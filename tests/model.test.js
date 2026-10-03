import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicates, segmentsForWindow, insertionIndex, matchesTab } from '../lib/model.js';
import { createDemoBrowser } from '../lib/demo.js';

const tab = (id, index, title, groupId = -1, pinned = false) => ({ id, index, title, groupId, pinned, url: `https://example.org/${title}` });

test('duplicates span windows but preserve meaningful URL differences', () => {
  const tabs = [
    { id: 1, url: 'https://example.com', windowId: 1 }, { id: 2, url: 'https://example.com/', windowId: 2 },
    { id: 3, url: 'https://example.com/#one' }, { id: 4, url: 'https://example.com/#two' },
    { id: 5, url: 'https://example.com/?account=1' }, { id: 6, url: 'https://example.com/?account=2' },
    { id: 7, url: 'chrome://newtab/' }, { id: 8, url: 'chrome://newtab/' }, { id: 9, url: '' },
    { id: 10, url: 'https://example.com', pendingUrl: 'https://example.com/new' },
  ];
  assert.deepEqual(findDuplicates(tabs), { groups: [[1, 2]], ids: new Set([1, 2]), extra: 1 });
});

test('sorting preserves pinned and group boundaries, including separate ungrouped runs', () => {
  const window = { tabs: [tab(1, 0, 'Z', -1, true), tab(2, 1, 'A', -1, true), tab(3, 2, 'Z'), tab(4, 3, 'B'), tab(5, 4, 'Z', 10), tab(6, 5, 'A', 10), tab(7, 6, 'D'), tab(8, 7, 'C')] };
  const original = structuredClone(window);
  const segments = segmentsForWindow(window, [{ id: 10, title: 'Work' }], 'title');
  assert.deepEqual(segments.map(s => s.tabs.map(t => t.id)), [[2, 1], [4, 3], [6, 5], [8, 7]]);
  assert.deepEqual(window, original);
  assert.deepEqual(segmentsForWindow(window, []).flatMap(s => s.tabs.map(t => t.id)), [1,2,3,4,5,6,7,8]);
});

test('URL sorting uses the host and path with numeric natural order', () => {
  const tabs = [tab(1, 0, 'a'), tab(2, 1, 'b'), tab(3, 2, 'c')];
  tabs[0].url = 'http://zebra.com'; tabs[1].url = 'https://alpha.com/10'; tabs[2].url = 'https://alpha.com/2';
  assert.deepEqual(segmentsForWindow({ tabs }, [], 'url')[0].tabs.map(t => t.id), [3,2,1]);
});

test('drop positions account for source removal in both directions', () => {
  const tabs = [tab(1,0,'A'), tab(2,1,'B'), tab(3,2,'C'), tab(4,3,'D')];
  assert.equal(insertionIndex(tabs, 1, { anchorId: 3, after: true }), 2);
  assert.equal(insertionIndex(tabs, 4, { anchorId: 2 }), 1);
  assert.equal(insertionIndex(tabs, 99, { anchorId: 2, after: true }), 2);
  assert.equal(insertionIndex(tabs, 1, {}), 3);
  assert.throws(() => insertionIndex(tabs, 1, { anchorId: 99 }), /moved or closed/);
});

test('group append and singleton group moves have valid positions', () => {
  const tabs = [tab(1,0,'A',-1,true), tab(2,1,'B',10), tab(3,2,'C',10), tab(4,3,'D',20)];
  assert.equal(insertionIndex(tabs, 2, { groupId: 10 }), 2);
  assert.equal(insertionIndex(tabs, 4, { groupId: 20 }), 3);
  assert.equal(insertionIndex(tabs, 1, { pinned: true }), 0);
  assert.throws(() => insertionIndex(tabs, 2, { groupId: 999 }), /group has closed/);
});

test('search matches all terms across title, URL, group and window without interpreting markup', () => {
  const item = { title: 'Chrome extensions', url: 'https://developer.chrome.com/docs' };
  assert.ok(matchesTab(item, ' CHROME project ', 'Project', 'Work'));
  assert.ok(matchesTab(item, 'docs work', 'Project', 'Work'));
  assert.ok(!matchesTab(item, '<script>', 'Project', 'Work'));
});

test('preview moves change actual window membership and indices', async () => {
  const demo = createDemoBrowser();
  const initial = await demo.snapshot();
  const source = initial.windows[0].tabs.find(t => t.groupId === 10);
  await demo.move(source.id, { windowId: 2, groupId: 20, pinned: false });
  const next = await demo.snapshot();
  assert.ok(!next.windows[0].tabs.some(t => t.id === source.id));
  assert.equal(next.windows[1].tabs.find(t => t.id === source.id).groupId, 20);
  for (const window of next.windows) window.tabs.forEach((t, i) => assert.equal(t.index, i));
  await assert.rejects(demo.move(1, { windowId: 2, groupId: 20, pinned: false }), /pinned/);
});
