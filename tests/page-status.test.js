import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { github } from '../lib/providers/github.js';
import { pageTarget } from '../lib/providers/index.js';
import { createPageStatuses, STATUS_MAX_AGE } from '../lib/page-status.js';

function fixture() {
  const saved = {};
  const calls = [];
  const backend = {
    hasAccess: async () => true,
    enable: async () => true,
    load: async () => structuredClone(saved),
    save: async (key, value) => {
      saved[key] = value;
    },
    read: async (provider, target) => {
      calls.push(target.url);
      return 'open';
    },
  };
  return { backend, calls, saved };
}

test('GitHub matching accepts issue/PR subpages but excludes lookalike hosts and other pages', () => {
  assert.deepEqual(github.match('https://github.com/owner/repo/pull/42/files?diff=split#hello'), {
    url: 'https://github.com/owner/repo/pull/42',
    kind: 'PR',
  });
  assert.equal(github.match('https://github.com/owner/repo/issues/3').kind, 'Issue');
  for (const url of [
    'https://github.com.evil.test/a/b/pull/1',
    'https://evil.test/github.com/a/b/pull/1',
    'http://github.com/a/b/pull/1',
    'https://user:secret@github.com/a/b/pull/1',
    'https://github.com/a/b/issues',
    'https://github.com/a/b/pulls',
    'https://github.com/a/b/issues/new',
    'https://github.com/a/b/issues/3oops',
    'https://github.com/a/b/issues/0',
    'https://github.com/a/b/commit/3',
    'not a url',
  ]) {
    assert.equal(github.match(url), null, url);
  }
  assert.equal(
    pageTarget({ url: 'https://github.com/a/b/pull/1', pendingUrl: 'https://example.com' }),
    null,
  );
});

test('status checks deduplicate subpages and include discarded tabs without tab operations', async () => {
  const { backend, calls } = fixture();
  let time = 1000;
  const statuses = createPageStatuses(
    backend,
    () => {},
    () => time,
  );
  await statuses.init();
  const tabs = [
    { url: 'https://github.com/a/b/pull/1', discarded: true },
    { url: 'https://github.com/a/b/pull/1/files#foo' },
    { url: 'https://example.com' },
  ];
  await statuses.refresh(tabs);
  assert.equal(calls.length, 1);
  assert.equal(statuses.get(tabs[0]).state, 'open');
  await statuses.refresh(tabs);
  assert.equal(calls.length, 1);
  time += STATUS_MAX_AGE;
  assert.equal(statuses.get(tabs[0]).stale, true);
  await statuses.refresh(tabs);
  assert.equal(calls.length, 2);
  await statuses.refresh(tabs, { force: true });
  assert.equal(calls.length, 3);
});

test('failures retain a visibly stale last-known state and only retry explicitly', async () => {
  const { backend } = fixture();
  let time = 1000;
  const statuses = createPageStatuses(
    backend,
    () => {},
    () => time,
  );
  await statuses.init();
  const tab = { url: 'https://github.com/a/b/issues/1' };
  await statuses.refresh([tab]);
  time += 100;
  let failures = 0;
  backend.read = async () => {
    failures++;
    throw new Error('Offline');
  };
  await statuses.refresh([tab], { force: true });
  assert.equal(statuses.get(tab).state, 'open');
  assert.equal(statuses.get(tab).checkedAt, 1000);
  assert.equal(statuses.get(tab).error, 'Offline');
  assert.equal(statuses.get(tab).stale, true);
  time += STATUS_MAX_AGE * 2;
  await statuses.refresh([tab]);
  assert.equal(failures, 1);
  backend.read = async () => 'closed';
  await statuses.refresh([tab], { force: true });
  assert.equal(statuses.get(tab).state, 'closed');
  assert.equal(statuses.get(tab).error, undefined);
  assert.equal(statuses.get(tab).stale, false);
});

test('access denial/revocation and incognito never expose or fetch regular cached state', async () => {
  const { backend, calls } = fixture();
  const tab = { url: 'https://github.com/a/b/issues/1' };
  backend.hasAccess = async () => false;
  backend.enable = async () => false;
  const statuses = createPageStatuses(backend);
  await statuses.init();
  assert.equal(await statuses.enable(github), false);
  await statuses.refresh([tab], { force: true });
  assert.equal(calls.length, 0);
  assert.equal(statuses.get(tab).needsAccess, true);
  backend.hasAccess = async () => true;
  await statuses.refresh([tab]);
  assert.equal(calls.length, 1);
  await statuses.refresh([{ ...tab, incognito: true }], { force: true });
  assert.equal(calls.length, 1);
  assert.equal(statuses.get({ ...tab, incognito: true }).state, 'unknown');
  backend.hasAccess = async () => false;
  await statuses.refresh([tab], { force: true });
  assert.equal(calls.length, 1);
  assert.equal(statuses.get(tab).state, 'unknown');
});

test('refresh bounds concurrency, ignores overlapping runs, and consumes another dashboard cache', async () => {
  const { backend } = fixture();
  let exclusive = Promise.resolve();
  backend.runExclusive = (operation) => {
    const result = exclusive.then(operation);
    exclusive = result.catch(() => {});
    return result;
  };
  const tabs = Array.from({ length: 8 }, (_, index) => ({
    url: `https://github.com/a/b/issues/${index + 1}`,
  }));
  let active = 0;
  let peak = 0;
  let calls = 0;
  backend.read = async () => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return 'merged';
  };
  const first = createPageStatuses(backend);
  const second = createPageStatuses(backend);
  await Promise.all([first.init(), second.init()]);
  await Promise.all([
    first.refresh(tabs),
    first.refresh(tabs, { force: true }),
    second.refresh(tabs),
  ]);
  assert.equal(calls, 8);
  assert.equal(peak, 3);
  await second.refresh(tabs);
  assert.equal(calls, 8);
  assert.equal(second.get(tabs[0]).state, 'merged');
  assert.equal(first.progress, null);
});
