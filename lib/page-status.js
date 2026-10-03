import { pageTarget, providers } from './providers/index.js';

export const STATUS_MAX_AGE = 5 * 60 * 1000;
const CACHE_PREFIX = 'page-status:';

export function createChromeStatusBackend(api = chrome, fetchPage = fetch) {
  return {
    runExclusive: (operation) => navigator.locks.request('tabtastic-page-status', operation),
    hasAccess: (provider) => api.permissions.contains({ origins: provider.origins }),
    enable: (provider) => api.permissions.request({ origins: provider.origins }),
    async load() {
      const saved = await api.storage.session.get(null);
      return Object.fromEntries(
        Object.entries(saved)
          .filter(([key]) => key.startsWith(CACHE_PREFIX))
          .map(([key, value]) => [key.slice(CACHE_PREFIX.length), value]),
      );
    },
    save: (key, value) => api.storage.session.set({ [`${CACHE_PREFIX}${key}`]: value }),
    async read(provider, target) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetchPage(target.url, {
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `Page unavailable (HTTP ${response.status}). Check access or try again later.`,
          );
        }
        // A detached template is inert: scripts and remote images never run/load.
        // None of the fetched markup is inserted into the visible document.
        const template = document.createElement('template');
        template.innerHTML = await response.text();
        const state = provider.parse(template.content);
        if (!state) {
          throw new Error(
            'Status chip unavailable. Check your sign-in or open the page and try again.',
          );
        }
        return state;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createPageStatuses(backend, onChange = () => {}, now = Date.now) {
  const runExclusive = backend.runExclusive || ((operation) => operation());
  let cache = {};
  const access = new Set();
  const pending = new Set();
  let running = false;
  let progress = null;

  function get(tab) {
    const target = pageTarget(tab);
    if (!target) {
      return null;
    }
    if (tab.incognito) {
      return {
        ...target,
        state: 'unknown',
        error: 'Status checks are unavailable for incognito tabs.',
      };
    }
    const allowed = access.has(target.provider.id);
    const saved = allowed ? cache[target.key] : null;
    return {
      ...target,
      ...saved,
      state: saved?.state || 'unknown',
      needsAccess: !allowed,
      pending: pending.has(target.key),
      stale: !!saved?.checkedAt && (now() - saved.checkedAt >= STATUS_MAX_AGE || !!saved.error),
    };
  }

  async function check(target) {
    const { key, provider } = target;
    pending.add(key);
    onChange();
    let value;
    try {
      const state = await backend.read(provider, target);
      if (!Object.hasOwn(provider.states, state)) {
        throw new Error('Unrecognised page status.');
      }
      value = { state, checkedAt: now(), attemptedAt: now() };
    } catch (error) {
      value = {
        ...cache[key],
        attemptedAt: now(),
        error: error.name === 'AbortError' ? 'Status check timed out. Try again.' : error.message,
      };
    }
    cache[key] = value;
    // Session storage is a best-effort cache, not a prerequisite for showing results.
    await backend.save(key, value).catch(() => {});
    pending.delete(key);
    progress.done++;
    onChange();
  }

  return {
    get,
    get progress() {
      return progress;
    },
    get refreshing() {
      return running;
    },
    hasAccess: (provider) => access.has(provider.id),
    async init() {
      cache = await backend.load().catch(() => ({}));
      for (const provider of providers) {
        if (await backend.hasAccess(provider)) {
          access.add(provider.id);
        }
      }
    },
    async enable(provider) {
      // Called directly by a click handler to preserve Chrome's user gesture.
      const granted = await backend.enable(provider);
      if (granted) {
        access.add(provider.id);
        onChange();
      }
      return granted;
    },
    async refresh(tabs, { force = false, providerId } = {}) {
      if (running) {
        return;
      }
      running = true;
      try {
        await runExclusive(async () => {
          let changed = false;
          // Pick up checks performed by another open Tabtastic dashboard.
          const savedCache = await backend.load().catch(() => ({}));
          for (const [key, value] of Object.entries(savedCache)) {
            if (!cache[key] || value.attemptedAt > cache[key].attemptedAt) {
              cache[key] = value;
              changed = true;
            }
          }
          for (const provider of providers) {
            const allowed = await backend.hasAccess(provider);
            changed ||= allowed !== access.has(provider.id);
            if (!allowed) {
              access.delete(provider.id);
            } else {
              access.add(provider.id);
            }
          }
          const unique = new Map();
          for (const tab of tabs) {
            const target = pageTarget(tab);
            if (!target || tab.incognito || !access.has(target.provider.id)) {
              continue;
            }
            if (providerId && target.provider.id !== providerId) {
              continue;
            }
            // Retry failures only on an explicit refresh; ordinary tab events must
            // not cause a request storm. Successful checks are reused for five minutes.
            const saved = cache[target.key];
            if (force || !saved || (!saved.error && now() - saved.attemptedAt >= STATUS_MAX_AGE)) {
              unique.set(target.key, target);
            }
          }
          const queue = [...unique.values()];
          if (!queue.length) {
            if (changed) {
              onChange();
            }
            return;
          }
          progress = { done: 0, total: queue.length };
          onChange();
          const worker = async () => {
            while (queue.length) {
              await check(queue.shift());
            }
          };
          // Limit requests for large collections of tabs and share subpage results.
          await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
        });
      } finally {
        running = false;
        if (progress) {
          progress = null;
          onChange();
        }
      }
    },
  };
}
