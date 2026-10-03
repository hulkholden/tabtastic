export const NO_GROUP = -1;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function tabUrl(tab) {
  return tab.pendingUrl || tab.url || '';
}

export function displayUrl(tab) {
  try {
    const url = new URL(tabUrl(tab));
    return (
      `${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}` ||
      tabUrl(tab)
    );
  } catch {
    return tabUrl(tab) || 'New tab';
  }
}

export function duplicateKey(tab) {
  const raw = tabUrl(tab);
  // Browser utility pages and new-tab dashboards aren't useful duplicates.
  if (!/^(https?|file):/i.test(raw)) {
    return null;
  }
  try {
    return new URL(raw).href;
  } catch {
    return null;
  }
}

export function findDuplicates(tabs) {
  const byUrl = new Map();
  for (const tab of tabs) {
    const key = duplicateKey(tab);
    if (key) {
      byUrl.set(key, [...(byUrl.get(key) || []), tab.id]);
    }
  }
  const groups = [...byUrl.values()].filter((ids) => ids.length > 1);
  return {
    groups,
    ids: new Set(groups.flat()),
    extra: groups.reduce((n, ids) => n + ids.length - 1, 0),
  };
}

export function compareTabs(mode) {
  return (a, b) => {
    const first = sortValue(a, mode);
    const second = sortValue(b, mode);
    return collator.compare(first, second) || a.index - b.index;
  };
}

function sortValue(tab, mode) {
  return mode === 'title' ? tab.title || displayUrl(tab) : displayUrl(tab);
}

function segmentKey(tab, groupId) {
  if (tab.pinned) {
    return 'pinned';
  }
  return groupId === NO_GROUP ? 'ungrouped' : `group-${groupId}`;
}

// Keep each contiguous ungrouped run in place: combining runs would shift groups.
export function segmentsForWindow(window, groups, mode = 'chrome') {
  const result = [];
  for (const tab of [...window.tabs].sort((a, b) => a.index - b.index)) {
    const groupId = tab.groupId ?? NO_GROUP;
    const key = segmentKey(tab, groupId);
    let segment = result.at(-1);
    if (!segment || segment.key !== key) {
      segment = {
        key,
        groupId,
        pinned: !!tab.pinned,
        group: groups.find((g) => g.id === groupId),
        tabs: [],
      };
      result.push(segment);
    }
    segment.tabs.push(tab);
  }
  if (mode !== 'chrome') {
    for (const segment of result) {
      segment.tabs.sort(compareTabs(mode));
    }
  }
  return result;
}

export function matchesTab(tab, query, groupName = '', windowName = '') {
  const text = `${tab.title || ''} ${tabUrl(tab)} ${groupName} ${windowName}`.toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export function insertionIndex(
  tabs,
  sourceId,
  { anchorId, after = false, groupId = NO_GROUP, pinned = false },
) {
  const remaining = tabs.filter((t) => t.id !== sourceId).sort((a, b) => a.index - b.index);
  if (anchorId != null) {
    const index = remaining.findIndex((t) => t.id === anchorId);
    if (index < 0) {
      throw new Error('That tab has moved or closed. Please try again.');
    }
    return index + Number(after);
  }
  if (pinned) {
    return remaining.filter((t) => t.pinned).length;
  }
  if (groupId !== NO_GROUP) {
    return groupEndIndex(tabs, remaining, sourceId, groupId);
  }
  return remaining.length;
}

function groupEndIndex(tabs, remaining, sourceId, groupId) {
  const lastGroupTab = remaining.filter((tab) => tab.groupId === groupId).at(-1);
  if (lastGroupTab) {
    return remaining.indexOf(lastGroupTab) + 1;
  }

  // Moving a group's only tab back into its own group leaves it in place.
  const source = tabs.find((tab) => tab.id === sourceId && tab.groupId === groupId);
  if (source) {
    return Math.min(source.index, remaining.length);
  }
  throw new Error('That group has closed. Please try again.');
}
