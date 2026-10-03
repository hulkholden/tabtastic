import { createChromeBrowser } from './lib/browser.js';
import { createDemoBrowser } from './lib/demo.js';
import { createWindowLayout } from './lib/window-layout.js';
import { createPageStatuses } from './lib/page-status.js';
import { pageTarget, providers } from './lib/providers/index.js';
import {
  displayUrl,
  findDuplicates,
  matchesTab,
  NO_GROUP,
  segmentsForWindow,
  tabUrl,
} from './lib/model.js';

const browser = globalThis.chrome?.tabs?.query ? createChromeBrowser() : createDemoBrowser();
const pageStatuses = createPageStatuses(browser.statusBackend, scheduleStatusRender);
const $ = (selector) => document.querySelector(selector);
const updateWindowLayout = createWindowLayout($('#windows'));
const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M9 9v11"/>',
  window:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/><path d="M6 6.5h.1m2.9 0h.1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  density: '<path d="M5 5h14M5 10h14M5 15h14M5 20h14"/>',
  grip: '<path d="M9 5h.1M15 5h.1M9 12h.1M15 12h.1M9 19h.1M15 19h.1" stroke-width="3"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  right: '<path d="m10 7 5 5-5 5"/>',
  pin: '<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6"/>',
  move: '<path d="M4 12h16m-5-5 5 5-5 5"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  branch:
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10m12-9v3a4 4 0 0 1-4 4H6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
};
const colors = {
  grey: ['#acb4a9', '#f0f2ee', '#616d5b'],
  blue: ['#8fb0e7', '#edf3fc', '#456c9f'],
  red: ['#db9490', '#fceeed', '#9a534d'],
  yellow: ['#ddc267', '#faf5df', '#827026'],
  green: ['#88b394', '#edf5ed', '#4f7854'],
  pink: ['#d69dbe', '#faeef5', '#98577d'],
  purple: ['#b19acb', '#f2edf8', '#76568e'],
  cyan: ['#88bdc5', '#eaf6f6', '#467b82'],
  orange: ['#d9b084', '#fcf2e8', '#936a40'],
};
const state = {
  snapshot: null,
  scope: 'all',
  query: '',
  highlight: false,
  compact: localStorage.getItem('compact') === 'true',
  busy: false,
  dragId: null,
  refreshVersion: 0,
  statusFilter: 'all',
  enablingProvider: false,
};
let refreshTimer;
let statusRenderTimer;
let toastTimer;
let dialogSubmit;

function icon(name) {
  const wrapper = document.createElement('span');
  // Icon paths are fixed local constants, never tab or user content.
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.window}</svg>`;
  return wrapper.firstChild;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function button(className, title, iconName, handler) {
  const node = el('button', className);
  node.type = 'button';
  node.title = title;
  node.setAttribute('aria-label', title);
  if (iconName) {
    node.append(icon(iconName));
  }
  node.addEventListener('click', handler);
  return node;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function windowName(window) {
  return (
    state.snapshot.labels[`window-label-${window.id}`] ||
    `Window ${state.snapshot.windows.findIndex((w) => w.id === window.id) + 1}`
  );
}

function notify(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(
    () => {
      $('#toast').hidden = true;
    },
    error ? 8000 : 4000,
  );
}

async function refresh() {
  const version = ++state.refreshVersion;
  try {
    const snapshot = await browser.snapshot();
    if (version !== state.refreshVersion) {
      return;
    }
    state.snapshot = snapshot;
    if (typeof state.scope === 'number' && !snapshot.windows.some((w) => w.id === state.scope)) {
      state.scope = 'all';
    }
    render();
    refreshStatuses();
  } catch (error) {
    notify(`Could not refresh tabs: ${error.message}`, true);
    $('#connection').textContent = 'Connection interrupted';
  }
}

function refreshStatuses() {
  if (state.snapshot) {
    void pageStatuses
      .refresh(state.snapshot.windows.flatMap((window) => window.tabs))
      .catch((error) => notify(`Could not check page statuses: ${error.message}`, true));
  }
}

async function action(operation, message) {
  if (state.busy) {
    return;
  }
  setBusy(true);
  ++state.refreshVersion; // Ignore a snapshot started before the mutation.
  clearTimeout(refreshTimer);
  try {
    await operation();
    if (message) {
      notify(message);
    }
  } catch (error) {
    notify(error.message || 'Something changed in Chrome. Please try again.', true);
  } finally {
    setBusy(false);
    await refresh();
  }
}

function setBusy(busy) {
  state.busy = busy;
  document.body.classList.toggle('busy', busy);
  for (const button of document.querySelectorAll('[data-sort]')) {
    button.disabled = busy;
  }
}

function visibleWindows() {
  const { windows, currentWindowId } = state.snapshot;
  if (state.scope === 'current') {
    return windows.filter((w) => w.id === currentWindowId);
  }
  return typeof state.scope === 'number' ? windows.filter((w) => w.id === state.scope) : windows;
}

function setScope(scope) {
  state.scope = scope;
  state.statusFilter = 'all';
  render();
}

function selectedProvider() {
  return providers.find((provider) => provider.id === state.scope);
}

function renderNavigation(duplicates) {
  const tabs = state.snapshot.windows.flatMap((w) => w.tabs);
  const currentWindow = state.snapshot.windows.find(
    (window) => window.id === state.snapshot.currentWindowId,
  );
  $('#navigation').replaceChildren(
    ...[
      ['all', 'All tabs', 'layout', tabs.length],
      ['current', 'This window', 'window', currentWindow?.tabs.length || 0],
      ['duplicates', 'Duplicates', 'copy', duplicates.ids.size],
      ...providers.map((provider) => [
        provider.id,
        provider.label,
        'branch',
        tabs.filter((tab) => pageTarget(tab)?.provider.id === provider.id).length,
      ]),
    ].map(([scope, label, symbol, count]) => {
      const node = button(
        `nav-button ${state.scope === scope ? 'active' : ''}`,
        label,
        symbol,
        () => setScope(scope),
      );
      node.append(el('span', '', label), el('span', 'nav-count', count));
      if (state.scope === scope) {
        node.setAttribute('aria-current', 'page');
      }
      return node;
    }),
  );
  $('#window-count').textContent = state.snapshot.windows.length;
  $('#window-navigation').replaceChildren(
    ...state.snapshot.windows.map((window) => {
      const node = button(
        `nav-button window-nav ${state.scope === window.id ? 'active' : ''}`,
        windowName(window),
        null,
        () => setScope(window.id),
      );
      node.append(
        el('span', 'window-dot'),
        el('span', '', windowName(window)),
        el('span', 'nav-count', window.tabs.length),
      );
      if (state.scope === window.id) {
        node.setAttribute('aria-current', 'page');
      }
      return node;
    }),
  );
}

function render({ statusesOnly = false } = {}) {
  if (!state.snapshot) {
    return;
  }
  // Preserve keyboard focus through live tab refreshes.
  const focusKey = document.activeElement?.dataset.focusKey;
  const { windows } = state.snapshot;
  const allTabs = windows.flatMap((w) => w.tabs);
  const duplicates = findDuplicates(allTabs);
  const filtering = !!state.query.trim() || state.scope === 'duplicates' || !!selectedProvider();
  const selectedWindows = visibleWindows();
  let shownCount = 0;
  // Only status updates reuse nodes; fresh tab snapshots rebuild their handlers.
  const existing = statusesOnly
    ? new Map([...$('#windows').children].map((card) => [Number(card.dataset.windowId), card]))
    : new Map();
  const cards = [];
  for (const window of selectedWindows) {
    const segments = filteredSegments(window, duplicates);
    const count = segments.reduce((sum, segment) => sum + segment.tabs.length, 0);
    shownCount += count;
    if (count || !filtering) {
      cards.push(
        renderWindow(window, segments, duplicates, filtering, count, existing.get(window.id)),
      );
    }
  }
  if (statusesOnly) {
    reconcileChildren($('#windows'), cards);
  } else {
    renderNavigation(duplicates);
    $('#windows').replaceChildren(...cards);
    renderDuplicateControls(duplicates);
    renderConnectionStatus();
    renderDensityControl();
  }
  renderEmptyState(cards.length);
  renderSummary(selectedWindows, filtering, shownCount, cards.length);
  renderSortControls(filtering, shownCount);
  renderProviderControls(allTabs);
  updateWindowLayout();
  if (!statusesOnly) {
    restoreFocus(focusKey);
  }
}

function filteredSegments(window, duplicates) {
  return segmentsForWindow(window, state.snapshot.groups)
    .map((segment, index) => ({
      ...segment,
      // Preserve each ungrouped run's identity as status filters hide its tabs.
      id: index,
      tabs: segment.tabs.filter((tab) => {
        const matchesSearch = matchesTab(
          tab,
          state.query,
          segment.group?.title,
          windowName(window),
        );
        const matchesScope = state.scope !== 'duplicates' || duplicates.ids.has(tab.id);
        return matchesSearch && matchesScope && matchesStatusFilter(tab);
      }),
    }))
    .filter((segment) => segment.tabs.length > 0);
}

function matchesStatusFilter(tab) {
  const provider = selectedProvider();
  if (!provider) {
    return true;
  }
  const status = pageStatuses.get(tab);
  if (status?.provider.id !== provider.id) {
    return false;
  }
  if (state.statusFilter === 'finished') {
    return !!provider.states[status.state]?.finished;
  }
  if (state.statusFilter === 'unknown') {
    return status.state === 'unknown' || !!status.error;
  }
  return state.statusFilter === 'all' || status.state === state.statusFilter;
}

function renderProviderControls(tabs) {
  const provider = selectedProvider();
  $('#provider-controls').hidden = !provider;
  if (!provider) {
    return;
  }
  const allowed = pageStatuses.hasAccess(provider);
  const statuses = tabs
    .map((tab) => pageStatuses.get(tab))
    .filter((status) => status?.provider.id === provider.id);
  $('#provider-title').textContent = `${provider.label} ${provider.itemLabel}`;
  $('#provider-description').textContent = allowed
    ? 'Refresh checks the latest page status, including paused tabs. Hover a badge for the last check time.'
    : provider.accessDescription;
  $('#provider-enable').hidden = allowed;
  $('#provider-enable').disabled = state.enablingProvider;
  $('#provider-refresh').hidden = !allowed;
  $('#provider-refresh').disabled = !!pageStatuses.progress || !statuses.length;
  $('#provider-refresh').title =
    'Check every matching page, including items hidden by filters. Tabs stay paused.';
  $('#provider-refresh-label').textContent = pageStatuses.progress
    ? 'Refreshing…'
    : 'Refresh statuses';
  const options = [
    ['all', 'All statuses'],
    ['finished', provider.finishedLabel || 'Finished'],
    ...Object.entries(provider.states).map(([key, value]) => [key, value.label]),
    ['unknown', 'Unknown / failed'],
  ];
  const filter = $('#status-filter');
  if (filter.dataset.provider !== provider.id) {
    filter.replaceChildren(
      ...options.map(([value, label]) => {
        const option = el('option', '', label);
        option.value = value;
        return option;
      }),
    );
    filter.dataset.provider = provider.id;
  }
  $('#status-filter').value = state.statusFilter;
  const failed = statuses.filter((status) => status.error).length;
  const stale = statuses.filter((status) => status.stale).length;
  const progress = pageStatuses.progress;
  let message = `${plural(statuses.length, 'tab')} · Status checks are cached for five minutes.`;
  if (progress) {
    message = `Checking ${progress.done} of ${progress.total} pages…`;
  } else if (failed || stale) {
    message = `${failed} unavailable · ${stale} stale. Refresh to retry; hover badges for details.`;
  }
  $('#provider-progress').textContent = allowed
    ? message
    : 'Status checks begin after you enable access.';
}

async function enableProvider() {
  const provider = selectedProvider();
  if (!provider || state.enablingProvider) {
    return;
  }
  state.enablingProvider = true;
  try {
    // Invoke before any await so Chrome can show its optional-access prompt.
    const granted = await pageStatuses.enable(provider);
    if (granted) {
      await refresh();
    } else {
      notify(`${provider.label} access was not enabled. You can try again at any time.`);
    }
  } catch (error) {
    notify(error.message, true);
  } finally {
    state.enablingProvider = false;
    render();
  }
}

async function refreshProvider() {
  const provider = selectedProvider();
  if (!provider || pageStatuses.refreshing) {
    return;
  }
  try {
    await pageStatuses.refresh(
      state.snapshot.windows.flatMap((window) => window.tabs),
      {
        force: true,
        providerId: provider.id,
      },
    );
  } catch (error) {
    notify(error.message, true);
  }
}

function scheduleStatusRender() {
  clearTimeout(statusRenderTimer);
  statusRenderTimer = setTimeout(() => {
    if (!state.busy && state.dragId == null) {
      render({ statusesOnly: true });
    }
  }, 50);
}

// Leave surviving nodes attached so hover, focus and button presses survive
// asynchronous status checks. Status filters only add/remove affected rows.
function reconcileChildren(parent, children) {
  const keep = new Set(children);
  for (const child of [...parent.children]) {
    if (!keep.has(child)) {
      child.remove();
    }
  }
  children.forEach((child, index) => {
    if (parent.children[index] !== child) {
      parent.insertBefore(child, parent.children[index] || null);
    }
  });
}

function renderEmptyState(windowCount) {
  $('#empty').hidden = windowCount > 0;
  $('#empty h2').textContent =
    state.scope === 'duplicates' && !state.query ? 'A little less repetition.' : 'No tabs found';
  $('#empty p').textContent =
    state.scope === 'duplicates' && !state.query
      ? 'No duplicate URLs. Your tabs are looking tidy.'
      : 'Try another title, website, or group name.';
}

function countGroups(tabs) {
  const groupIds = tabs.filter((tab) => tab.groupId !== NO_GROUP).map((tab) => tab.groupId);
  return new Set(groupIds).size;
}

function renderSummary(selectedWindows, filtering, shownCount, windowCount) {
  const headings = {
    all: 'Your tabs, together',
    current: 'Right here, right now',
    duplicates: 'Seeing double?',
    ...Object.fromEntries(
      providers.map((provider) => [provider.id, `${provider.label}, at a glance`]),
    ),
  };
  $('#heading').replaceChildren(
    document.createTextNode(headings[state.scope] || windowName(selectedWindows[0])),
    el('span', '', state.scope === 'duplicates' ? '' : '.'),
  );
  const tabs = selectedWindows.flatMap((window) => window.tabs);
  $('#summary').textContent = filtering
    ? `${plural(shownCount, 'matching tab')} across ${plural(windowCount, 'window')}`
    : `${plural(tabs.length, 'tab')} across ${plural(selectedWindows.length, 'window')} · ${plural(countGroups(tabs), 'group')} · Everything in its place.`;
}

function renderDuplicateControls(duplicates) {
  $('#duplicate-count').textContent = duplicates.ids.size;
  $('#duplicates').setAttribute('aria-pressed', String(state.highlight));
  $('#duplicate-banner').hidden = !state.highlight && state.scope !== 'duplicates';
  $('#duplicate-banner').replaceChildren(
    el(
      'strong',
      '',
      duplicates.ids.size
        ? `${plural(duplicates.ids.size, 'tab')} share ${plural(duplicates.groups.length, 'URL')}. `
        : 'No duplicates found. ',
    ),
    document.createTextNode(
      duplicates.ids.size
        ? 'Matching tabs are marked in amber. Nothing is closed automatically.'
        : 'A little more room to think.',
    ),
  );
  if (state.highlight && state.scope !== 'duplicates' && duplicates.ids.size) {
    const only = button('text-button', 'Show only duplicates', null, () => setScope('duplicates'));
    only.textContent = 'Show only duplicates →';
    $('#duplicate-banner').append(only);
  }
}

function renderSortControls(filtering, shownCount) {
  $('#view-description').textContent = filtering
    ? 'Filtered tabs keep their window and group context.'
    : 'Just like your browser, with a little more breathing room.';
  // A filtered list must never silently reorder hidden tabs.
  document.querySelectorAll('[data-sort]').forEach((node) => {
    node.disabled = state.busy || filtering || !shownCount;
    node.title = filtering
      ? 'Show an unfiltered tab view to sort its windows.'
      : `Reorder Chrome tabs by ${node.dataset.sort}, keeping groups and pinned tabs in place`;
  });
}

function renderConnectionStatus() {
  $('#connection').textContent = browser.isDemo ? 'Interactive preview' : 'Connected to Chrome';
  $('#live-label').replaceChildren(
    el('span', 'live-dot'),
    document.createTextNode(browser.isDemo ? 'Sample workspace' : 'In sync with Chrome'),
  );
}

function renderDensityControl() {
  document.body.classList.toggle('compact', state.compact);
  $('#density').setAttribute('aria-pressed', String(state.compact));
  $('#density').setAttribute(
    'aria-label',
    state.compact ? 'Use comfortable rows' : 'Use compact rows',
  );
  $('#density').title = $('#density').getAttribute('aria-label');
}

function restoreFocus(focusKey) {
  if (!focusKey) {
    return;
  }
  const target = [...document.querySelectorAll('[data-focus-key]')].find(
    (node) => node.dataset.focusKey === focusKey,
  );
  target?.focus({ preventScroll: true });
}

function renderWindow(window, segments, duplicates, filtering, count, existing) {
  const card = existing || el('section', 'window-card');
  card.dataset.windowId = window.id;
  card.setAttribute('aria-label', windowName(window));
  const content = existing?.querySelector('.window-content') || el('div', 'window-content');
  const sections = new Map(
    [...content.children].map((section) => [Number(section.dataset.segmentId), section]),
  );
  reconcileChildren(
    content,
    segments.map((segment) =>
      renderSection(window, segment, duplicates, filtering, sections.get(segment.id)),
    ),
  );
  if (existing) {
    const meta = card.querySelector('.window-meta');
    const label = windowMeta(window, count);
    if (meta.textContent !== label) {
      meta.textContent = label;
    }
  } else {
    card.append(renderWindowHeader(window, count), content, renderWindowDropzone(window.id));
  }
  return card;
}

function windowMeta(window, count) {
  return `${plural(count, 'tab')} · ${plural(countGroups(window.tabs), 'group')}${window.incognito ? ' · Incognito' : ''}`;
}

function renderWindowHeader(window, count) {
  const header = el('header', 'window-header');
  const badge = el('span', 'window-icon');
  badge.append(icon('window'));
  const info = el('div', 'window-info');
  const titleLine = el('div', 'window-title-line');
  const title = el('h2', 'window-title', windowName(window));
  const rename = button('icon-button rename-window', `Label ${windowName(window)}`, 'edit', () =>
    renameWindow(window),
  );
  rename.dataset.focusKey = `rename-${window.id}`;
  titleLine.append(title, rename);
  info.append(titleLine, el('p', 'window-meta', windowMeta(window, count)));
  header.append(badge, info);
  if (window.id === state.snapshot.currentWindowId) {
    header.append(el('span', 'current-badge', 'THIS WINDOW'));
  }
  const focus = button('icon-button window-focus', `Focus ${windowName(window)}`, 'arrow', () =>
    action(
      () => browser.focusWindow(window.id),
      browser.isDemo ? `Preview: focused ${windowName(window)}` : null,
    ),
  );
  focus.dataset.focusKey = `focus-${window.id}`;
  header.append(focus);
  return header;
}

function sectionName(segment) {
  if (segment.groupId !== NO_GROUP) {
    return segment.group?.title || 'Unnamed group';
  }
  return segment.pinned ? 'Pinned tabs' : 'Ungrouped';
}

function renderSection(window, segment, duplicates, filtering, existing) {
  const isGroup = segment.groupId !== NO_GROUP;
  const collapsed = isGroup && segment.group?.collapsed && !filtering && !state.highlight;
  const section =
    existing ||
    el('section', `tab-section ${isGroup ? 'group-section' : ''} ${collapsed ? 'collapsed' : ''}`);
  section.dataset.segmentId = segment.id;
  if (isGroup) {
    const [line, background, ink] = colors[segment.group?.color] || colors.grey;
    section.style.setProperty('--group-color', line);
    section.style.setProperty('--group-bg', background);
    section.style.setProperty('--group-ink', ink);
  }
  let heading = section.firstElementChild;
  if (
    !heading ||
    heading.querySelector('.section-count').textContent !== String(segment.tabs.length) ||
    heading.dataset.lastTabId !== String(segment.tabs.at(-1).id)
  ) {
    // An ungrouped heading's drop target depends on its last visible tab.
    heading = renderSectionHeading(window, segment, collapsed, filtering);
  }
  const rows = new Map(
    [...section.querySelectorAll('.tab-row')].map((row) => [Number(row.dataset.tabId), row]),
  );
  const tabs = collapsed ? [] : segment.tabs;
  reconcileChildren(section, [
    heading,
    ...tabs.map((tab) => renderTab(tab, duplicates, rows.get(tab.id))),
  ]);
  return section;
}

function renderSectionHeading(window, segment, collapsed, filtering) {
  const isGroup = segment.groupId !== NO_GROUP;
  const name = sectionName(segment);
  const heading = el(isGroup ? 'button' : 'div', 'section-heading');
  if (isGroup) {
    heading.type = 'button';
    heading.setAttribute('aria-expanded', String(!collapsed));
    heading.dataset.focusKey = `group-${segment.groupId}`;
    heading.setAttribute(
      'aria-label',
      `${name}, ${plural(segment.tabs.length, 'tab')}${filtering || state.highlight ? ', expanded for results' : ''}`,
    );
    heading.addEventListener('click', () => {
      if (filtering || state.highlight) {
        notify('Groups stay expanded while showing filtered results or duplicates.');
        return;
      }
      action(() => browser.collapseGroup(segment.groupId, !collapsed));
    });
    const pill = el('span', 'group-pill');
    pill.append(el('span', 'group-dot'), document.createTextNode(name));
    heading.append(pill);
  } else {
    if (segment.pinned) {
      heading.append(icon('pin'));
    }
    heading.append(document.createTextNode(name));
  }
  heading.append(el('span', 'section-count', segment.tabs.length));
  if (isGroup) {
    const chevron = el('span', 'chevron');
    chevron.append(icon(collapsed ? 'right' : 'down'));
    heading.append(chevron);
  }
  const last = segment.tabs.at(-1);
  heading.dataset.lastTabId = last.id;
  bindDrop(heading, {
    windowId: window.id,
    groupId: segment.groupId,
    pinned: segment.pinned,
    ...(isGroup ? {} : { anchorId: last.id, after: true }),
  });
  return heading;
}

function renderWindowDropzone(windowId) {
  const dropzone = el('div', 'window-dropzone');
  dropzone.append(
    icon('move'),
    document.createTextNode('Drop a tab here to move it out of a group'),
  );
  bindDrop(dropzone, { windowId, groupId: NO_GROUP, pinned: false });
  return dropzone;
}

function renderTab(tab, duplicates, existing) {
  const duplicate = (state.highlight || state.scope === 'duplicates') && duplicates.ids.has(tab.id);
  if (existing) {
    const status = existing.querySelector('.tab-status');
    const next = renderTabStatus(tab, duplicate);
    if (!status.isEqualNode(next)) {
      status.replaceWith(next);
    }
    return existing;
  }
  const row = el(
    'div',
    `tab-row ${tab.active ? 'is-current' : ''} ${duplicate ? 'is-duplicate' : ''}`,
  );
  row.draggable = true;
  row.dataset.tabId = tab.id;
  const grip = el('span', 'drag-handle');
  grip.append(icon('grip'));
  grip.setAttribute('aria-hidden', 'true');
  row.append(grip, renderTabLink(tab), renderTabStatus(tab, duplicate), renderTabActions(tab));
  bindTabDrag(row, tab);
  bindDrop(row, {
    windowId: tab.windowId,
    groupId: tab.groupId,
    pinned: tab.pinned,
    anchorId: tab.id,
  });
  return row;
}

function renderTabLink(tab) {
  const activate = button('tab-activate', `Switch to ${tab.title || displayUrl(tab)}`, null, () =>
    action(
      () => browser.activate(tab),
      browser.isDemo ? `Preview: switched to ${tab.title}` : null,
    ),
  );
  activate.title = `${tab.title || 'Untitled tab'}\n${tabUrl(tab)}`;
  activate.dataset.focusKey = `tab-${tab.id}`;
  const text = el('span', 'tab-text');
  text.append(
    el('span', 'tab-title', tab.title || 'Untitled tab'),
    el('span', 'tab-url', displayUrl(tab)),
  );
  activate.append(renderFavicon(tab), text);
  return activate;
}

function renderFavicon(tab) {
  const favicon = el('span', 'favicon-wrap');
  let host = '';
  try {
    host = new URL(tabUrl(tab)).hostname.replace(/^www\./, '');
  } catch {
    /* Fallback letter handles internal pages. */
  }
  const letter = el('span', 'favicon-letter', (host || tab.title || 'T')[0].toUpperCase());
  letter.setAttribute('aria-hidden', 'true');
  favicon.append(letter);
  const hue = [...host].reduce((n, char) => n + char.charCodeAt(0), 0) % 360;
  favicon.style.setProperty('--favicon-bg', `hsl(${hue} 27% 94%)`);
  favicon.style.setProperty('--favicon-color', `hsl(${hue} 26% 44%)`);
  const imageUrl = browser.favicon(tab);
  if (imageUrl) {
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('load', () => favicon.classList.add('has-image'));
    img.addEventListener('error', () => img.remove());
    img.src = imageUrl;
    favicon.append(img);
  }
  return favicon;
}

function renderTabStatus(tab, duplicate) {
  const status = el('span', 'tab-status');
  const pageStatus = pageStatuses.get(tab);
  if (pageStatus) {
    status.classList.add('has-page-status');
    const definition = pageStatus.provider.states[pageStatus.state];
    let label = definition?.label || 'Unknown';
    if (pageStatus.pending) {
      label = 'Checking…';
    } else if (pageStatus.stale) {
      label += ' · stale';
    }
    const badge = el('span', `page-status-badge tone-${definition?.tone || 'grey'}`, label);
    const details = [`${pageStatus.kind}: ${definition?.label || 'Unknown'}`];
    if (pageStatus.checkedAt) {
      details.push(`Last checked ${new Date(pageStatus.checkedAt).toLocaleString()}`);
    }
    if (pageStatus.error) {
      details.push(pageStatus.error);
    }
    if (pageStatus.needsAccess) {
      details.push(`Enable statuses in the ${pageStatus.provider.label} view.`);
    }
    if (pageStatus.stale) {
      details.push('This saved status may have changed. Refresh to check again.');
    }
    badge.title = details.join('\n');
    badge.setAttribute('aria-label', details.join('. '));
    status.append(badge);
    if (tab.discarded || tab.frozen) {
      const paused = el('span', 'paused-mark', 'Ⅱ');
      paused.title = 'Paused tab. Status checks work without waking it.';
      paused.setAttribute('aria-label', paused.title);
      status.append(paused);
    }
  }
  if (duplicate) {
    const mark = el('span', 'duplicate-mark', 'duplicate');
    mark.title = 'The same full URL is open in another tab';
    status.append(mark);
  }
  if (tab.audible) {
    const sound = el('span');
    sound.title = 'Playing audio';
    sound.append(icon('sound'));
    status.append(sound);
  } else if (tab.active) {
    const dot = el('span', 'active-dot');
    dot.title = 'Active tab in this window';
    status.append(dot);
  }
  return status;
}

function renderTabActions(tab) {
  const actions = el('span', 'row-actions');
  const move = button('icon-button', `Move ${tab.title || 'tab'}`, 'move', () => moveDialog(tab));
  move.dataset.focusKey = `move-${tab.id}`;
  const close = button('icon-button close-tab', `Close ${tab.title || 'tab'}`, 'close', () =>
    action(
      () => browser.close(tab.id),
      'Tab closed. Use Chrome’s Reopen closed tab command to restore it.',
    ),
  );
  close.dataset.focusKey = `close-${tab.id}`;
  actions.append(move, close);
  return actions;
}

function bindTabDrag(row, tab) {
  row.addEventListener('dragstart', (event) => {
    if (state.busy) {
      event.preventDefault();
      return;
    }
    state.dragId = tab.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-tabtastic-tab', String(tab.id));
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    state.dragId = null;
    clearDrop();
    row.classList.remove('dragging');
    scheduleRefresh();
  });
}

function clearDrop() {
  document
    .querySelectorAll('.drop-before,.drop-after,.drop-zone-active')
    .forEach((node) => node.classList.remove('drop-before', 'drop-after', 'drop-zone-active'));
}

function isAfterRowMidpoint(node, event) {
  return event.clientY > node.getBoundingClientRect().top + node.offsetHeight / 2;
}

function dropIndicatorClass(node, event) {
  if (!node.classList.contains('tab-row')) {
    return 'drop-zone-active';
  }
  return isAfterRowMidpoint(node, event) ? 'drop-after' : 'drop-before';
}

function bindDrop(node, destination) {
  node.addEventListener('dragover', (event) => {
    if (state.dragId == null || state.busy) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    clearDrop();
    node.classList.add(dropIndicatorClass(node, event));
  });
  node.addEventListener('dragleave', () =>
    node.classList.remove('drop-before', 'drop-after', 'drop-zone-active'),
  );
  node.addEventListener('drop', (event) => {
    if (state.dragId == null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const id = state.dragId;
    const after = node.classList.contains('tab-row')
      ? isAfterRowMidpoint(node, event)
      : destination.after;
    state.dragId = null;
    clearDrop();
    action(
      () => browser.move(id, { ...destination, after }),
      browser.isDemo ? 'Tab moved in the preview.' : 'Tab moved in Chrome.',
    );
  });
}

function openDialog(title, content, submit, saveLabel = 'Save') {
  $('#dialog-title').textContent = title;
  $('#dialog-body').replaceChildren(...content);
  $('#dialog-actions').hidden = !submit;
  $('#dialog-save').textContent = saveLabel;
  dialogSubmit = submit;
  $('#dialog').showModal();
}

function renameWindow(window) {
  const explanation = el(
    'p',
    '',
    'Chrome doesn’t share its window names with extensions. Give this window a Tabtastic label for this browser session. Labels reset when Chrome restarts or the extension reloads.',
  );
  const label = el('label', '', 'Window label');
  label.htmlFor = 'window-label';
  const input = el('input');
  input.id = 'window-label';
  input.maxLength = 60;
  input.autocomplete = 'off';
  input.placeholder = `Window ${state.snapshot.windows.indexOf(window) + 1}`;
  input.value = state.snapshot.labels[`window-label-${window.id}`] || '';
  openDialog('A name for this window', [explanation, label, input], () =>
    action(() => browser.labelWindow(window.id, input.value.trim()), 'Window label saved.'),
  );
  input.focus();
  input.select();
}

function moveCandidates(window, tab) {
  if (tab.pinned) {
    return [{ groupId: NO_GROUP, pinned: true, label: 'Pinned tabs' }];
  }

  const groups = state.snapshot.groups.filter((group) => group.windowId === window.id);
  return [
    { groupId: NO_GROUP, pinned: false, label: 'Ungrouped' },
    ...groups.map((group) => ({
      groupId: group.id,
      pinned: false,
      label: group.title || 'Unnamed group',
    })),
  ];
}

function moveDialog(tab) {
  const explanation = el(
    'p',
    '',
    'Move this tab to the end of a window or group. Drag a row to place it before or after a specific tab. Pinned tabs stay pinned.',
  );
  const label = el('label', '', 'Destination');
  label.htmlFor = 'move-destination';
  const select = el('select');
  select.id = 'move-destination';
  const destinations = [];
  for (const window of state.snapshot.windows.filter((w) => !!w.incognito === !!tab.incognito)) {
    for (const candidate of moveCandidates(window, tab)) {
      const option = el('option', '', `${windowName(window)} → ${candidate.label}`);
      option.value = destinations.length;
      if (window.id === tab.windowId && candidate.groupId === tab.groupId) {
        option.selected = true;
      }
      destinations.push({
        windowId: window.id,
        groupId: candidate.groupId,
        pinned: candidate.pinned,
      });
      select.append(option);
    }
  }
  openDialog(
    'Make a little space',
    [explanation, label, select],
    () =>
      action(
        () => browser.move(tab.id, destinations[Number(select.value)]),
        browser.isDemo ? 'Tab moved in the preview.' : 'Tab moved in Chrome.',
      ),
    'Move tab',
  );
  select.focus();
}

function showHelp() {
  const intro = el(
    'p',
    '',
    'Your new tab is a live map of Chrome. Click a tab to switch to it. Sorting changes Chrome’s tab strip within each group and contiguous ungrouped section; pinned tabs stay at the front. Use a window in the sidebar to sort just that window.',
  );
  const duplicates = el(
    'p',
    '',
    'Duplicate detection compares full URLs across all windows, including query strings and #fragments. It highlights matches without closing them. Search matches titles, URLs, group names, and window labels.',
  );
  const names = el(
    'p',
    '',
    'Chrome’s native window names aren’t available to extensions. Use the pencil beside a window title to give it a label for this browser session.',
  );
  const shortcuts = el('div', 'help-shortcuts');
  for (const [action, key] of [
    ['Find a tab', '/ or ⌘/Ctrl K'],
    ['Open first search result', 'Enter'],
    ['Clear search', 'Esc'],
    ['Move without dragging', 'Tab to a row’s → button'],
  ]) {
    shortcuts.append(el('span', '', action), el('span', '', key));
  }
  const content = [intro, duplicates, names, shortcuts];
  if (browser.isDemo) {
    const title = el('h3', '', 'Try it with your tabs');
    const steps = el('ol');
    for (const step of [
      'Open chrome://extensions in Chrome.',
      'Turn on Developer mode, then choose Load unpacked.',
      'Select the tabtastic project folder.',
      'Open a new tab and keep Tabtastic as your new-tab page. Disable Favitabs if it still controls the page.',
    ]) {
      steps.append(el('li', '', step));
    }
    content.push(title, steps);
  }
  openDialog('A little help, a lot less clutter', content);
}

function scheduleRefresh() {
  if (state.busy || state.dragId != null) {
    return;
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 100);
}

document
  .querySelectorAll('[data-icon]')
  .forEach((node) => node.replaceWith(icon(node.dataset.icon)));
$('#preview-banner').hidden = !browser.isDemo;
$('#search').addEventListener('input', (event) => {
  state.query = event.target.value;
  render();
});
$('#search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('.tab-activate')?.click();
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    $('.tab-activate')?.focus();
  }
});
$('#duplicates').addEventListener('click', () => {
  state.highlight = !state.highlight;
  render();
});
$('#density').addEventListener('click', () => {
  state.compact = !state.compact;
  localStorage.setItem('compact', String(state.compact));
  render();
});
$('#provider-enable').addEventListener('click', enableProvider);
$('#provider-refresh').addEventListener('click', refreshProvider);
$('#status-filter').addEventListener('change', (event) => {
  state.statusFilter = event.target.value;
  render();
});
$('#clear-filters').addEventListener('click', () => {
  state.scope = 'all';
  state.query = '';
  $('#search').value = '';
  render();
  $('#search').focus();
});
document.querySelectorAll('[data-sort]').forEach((node) =>
  node.addEventListener('click', () => {
    const ids = visibleWindows().map((w) => w.id);
    action(
      () => browser.sort(node.dataset.sort, ids),
      `Tabs sorted by ${node.dataset.sort === 'url' ? 'URL' : 'title'} ${browser.isDemo ? 'in the preview' : 'in Chrome'}. Groups stay together.`,
    );
  }),
);
$('#help').addEventListener('click', showHelp);
$('#install-help').addEventListener('click', showHelp);
$('#dialog-close').addEventListener('click', () => $('#dialog').close());
$('#dialog-cancel').addEventListener('click', () => $('#dialog').close());
$('#dialog-form').addEventListener('submit', (event) => {
  event.preventDefault();
  $('#dialog').close();
  dialogSubmit?.();
});
document.addEventListener('keydown', (event) => {
  if ($('#dialog').open) {
    return;
  }
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (
    (event.key === '/' && !editing) ||
    (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))
  ) {
    event.preventDefault();
    $('#search').focus();
    $('#search').select();
  }
  if (event.key === 'Escape') {
    if (state.query) {
      state.query = '';
      $('#search').value = '';
      render();
    } else if (state.highlight) {
      state.highlight = false;
      render();
    }
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    scheduleRefresh();
  }
});
browser.subscribe(scheduleRefresh, refreshStatuses);
await pageStatuses
  .init()
  .catch((error) => notify(`Could not load saved statuses: ${error.message}`, true));
// Keep the visible age indication honest even when no tab events arrive.
setInterval(scheduleStatusRender, 60000);
await refresh();
