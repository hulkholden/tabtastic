import { insertionIndex, NO_GROUP, segmentsForWindow } from './model.js';

function createDemoStatusBackend() {
  const samples = ['open', 'merged', 'closed', 'draft', 'not-planned'];
  return {
    hasAccess: async () => true,
    enable: async () => true,
    load: async () => ({}),
    save: async () => {},
    async read(provider, target) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const number = Number(target.url.split('/').at(-1));
      return samples[(number - 1) % samples.length];
    },
  };
}

export function createDemoBrowser() {
  let nextId = 1;
  const tab = (title, url, groupId = -1, extra = {}) => ({
    id: nextId++,
    title,
    url,
    groupId,
    pinned: false,
    active: false,
    incognito: false,
    ...extra,
  });
  const windows = [
    {
      id: 1,
      focused: true,
      incognito: false,
      tabs: [
        tab('Inbox · Gmail', 'https://mail.google.com/mail/u/0/#inbox', -1, { pinned: true }),
        tab('GitHub', 'https://github.com', -1, { pinned: true }),
        tab('Tabtastic — a fresh start', 'https://github.com/hulkholden/tabtastic', 10, {
          active: true,
        }),
        tab('Chrome Extensions documentation', 'https://developer.chrome.com/docs/extensions', 10),
        tab(
          'Tabs API · Chrome for Developers',
          'https://developer.chrome.com/docs/extensions/reference/api/tabs',
          10,
        ),
        tab('Designing for a calmer web', 'https://read.cv/explore', 11),
        tab(
          'Colour and contrast · Material Design',
          'https://m3.material.io/styles/color/overview',
          11,
        ),
        tab('Lucide — beautiful & consistent icons', 'https://lucide.dev/icons', 11),
        tab('Awwwards — websites of the day', 'https://www.awwwards.com', 11),
        tab('Hacker News', 'https://news.ycombinator.com'),
        tab(
          'Tabs API · Chrome for Developers',
          'https://developer.chrome.com/docs/extensions/reference/api/tabs',
        ),
      ],
    },
    {
      id: 2,
      focused: false,
      incognito: false,
      tabs: [
        tab('AllTrails · Find your next trail', 'https://www.alltrails.com', 20),
        tab(
          'A weekend in the Lake District',
          'https://www.nationaltrust.org.uk/visit/lake-district',
          20,
        ),
        tab(
          'Lake District weather forecast',
          'https://www.metoffice.gov.uk/weather/forecast/lake-district',
          20,
        ),
        tab('The art of noticing', 'https://www.theguardian.com/lifeandstyle', 21),
        tab('Hacker News', 'https://news.ycombinator.com', 21),
        tab('The Creative Independent', 'https://thecreativeindependent.com', 21),
        tab('NTS · Radio for music lovers', 'https://www.nts.live', -1, {
          active: true,
          audible: true,
        }),
        tab('GitHub', 'https://github.com'),
      ],
    },
  ];
  // Append after the original workspace so existing sample tab IDs stay stable.
  windows[0].tabs.splice(
    5,
    0,
    tab('Remember window layouts · Issue #1', 'https://github.com/example/tabtastic/issues/1', 10),
    tab(
      'Improve keyboard navigation · PR #2',
      'https://github.com/example/tabtastic/pull/2/files',
      10,
      { discarded: true },
    ),
    tab('Fix duplicate counts · PR #3', 'https://github.com/example/tabtastic/pull/3', 10),
    tab('Explore saved views · PR #4', 'https://github.com/example/tabtastic/pull/4', 10),
    tab('Sync across devices · Issue #5', 'https://github.com/example/tabtastic/issues/5', 10),
  );
  const groups = [
    { id: 10, windowId: 1, title: 'Tabtastic', color: 'green', collapsed: false },
    { id: 11, windowId: 1, title: 'Design inspiration', color: 'purple', collapsed: false },
    { id: 20, windowId: 2, title: 'Weekend plans', color: 'blue', collapsed: false },
    { id: 21, windowId: 2, title: 'Reading list', color: 'orange', collapsed: false },
  ];
  const labels = { 'window-label-1': 'Workspace', 'window-label-2': 'Off the clock' };

  function reindex() {
    for (const window of windows) {
      for (const [index, tab] of window.tabs.entries()) {
        tab.index = index;
        tab.windowId = window.id;
      }
    }
  }

  reindex();
  return {
    isDemo: true,
    statusBackend: createDemoStatusBackend(),
    async snapshot() {
      return structuredClone({ windows, groups, labels, currentWindowId: 1 });
    },
    async activate(target) {
      for (const window of windows) {
        window.focused = window.id === target.windowId;
        if (window.focused) {
          for (const tab of window.tabs) {
            tab.active = tab.id === target.id;
          }
        }
      }
    },
    async focusWindow(id) {
      for (const window of windows) {
        window.focused = window.id === id;
      }
    },
    async close(id) {
      for (const window of windows) {
        window.tabs = window.tabs.filter((tab) => tab.id !== id);
      }
      reindex();
    },
    async labelWindow(id, label) {
      labels[`window-label-${id}`] = label;
    },
    async collapseGroup(id, collapsed) {
      groups.find((g) => g.id === id).collapsed = collapsed;
    },
    async sort(mode, ids) {
      const selected = windows.filter((window) => ids.includes(window.id));
      for (const window of selected) {
        window.tabs = segmentsForWindow(window, groups, mode).flatMap((segment) => segment.tabs);
      }
      reindex();
    },
    async move(id, destination) {
      const source = windows.find((w) => w.tabs.some((t) => t.id === id));
      const tab = source.tabs.find((t) => t.id === id);
      if (id === destination.anchorId) {
        return;
      }
      if (!!tab.pinned !== !!destination.pinned) {
        throw new Error(
          'Keep pinned tabs in the pinned section. Unpin in Chrome to move into a group.',
        );
      }
      const target = windows.find((w) => w.id === destination.windowId);
      const index = insertionIndex(target.tabs, id, destination);
      source.tabs = source.tabs.filter((t) => t.id !== id);
      tab.groupId = destination.groupId ?? NO_GROUP;
      target.tabs.splice(index, 0, tab);
      reindex();
    },
    favicon() {
      return null;
    },
    subscribe() {
      return () => {};
    },
  };
}
