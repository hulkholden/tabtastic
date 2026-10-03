import { NO_GROUP, insertionIndex, segmentsForWindow } from './model.js';
import { createChromeStatusBackend } from './page-status.js';

function isSplitView(tab) {
  return tab.splitViewId != null && tab.splitViewId !== -1;
}

async function sortSegment(api, windowId, segment) {
  const start = Math.min(...segment.tabs.map((tab) => tab.index));
  for (const [offset, tab] of segment.tabs.entries()) {
    const fresh = await api.tabs.get(tab.id);
    const changedPlacement =
      fresh.windowId !== windowId || fresh.groupId !== tab.groupId || fresh.pinned !== tab.pinned;
    if (changedPlacement) {
      throw new Error('Tabs changed while sorting. The view has been refreshed; please try again.');
    }

    const index = start + offset;
    if (fresh.index !== index) {
      await api.tabs.move(tab.id, { index });
    }
  }
}

async function validateMoveDestination(api, tab, destination) {
  if (isSplitView(tab)) {
    throw new Error('Separate this split view in Chrome before moving the tab.');
  }

  const targetWindow = await api.windows.get(destination.windowId);
  if (tab.incognito !== targetWindow.incognito) {
    throw new Error('Tabs cannot move between regular and incognito windows.');
  }
  if (!!tab.pinned !== !!destination.pinned) {
    throw new Error(
      'Keep pinned tabs in the pinned section. Unpin in Chrome to move into a group.',
    );
  }

  if (destination.groupId !== NO_GROUP) {
    const group = await api.tabGroups.get(destination.groupId);
    if (group.windowId !== destination.windowId) {
      throw new Error('That group has moved. Please try again.');
    }
  }

  // Validate the anchor before making any changes.
  const tabs = await api.tabs.query({ windowId: destination.windowId });
  if (destination.anchorId != null) {
    const anchor = tabs.find((tab) => tab.id === destination.anchorId);
    const matchesDestination =
      anchor && anchor.groupId === destination.groupId && !!anchor.pinned === !!destination.pinned;
    if (!matchesDestination) {
      throw new Error('That destination has changed. Please try again.');
    }
  }
}

async function setGroupMembership(api, id, groupId) {
  const tab = await api.tabs.get(id);
  if (tab.groupId === groupId) {
    return;
  }

  if (groupId === NO_GROUP) {
    await api.tabs.ungroup(id);
  } else {
    await api.tabs.group({ tabIds: [id], groupId });
  }
}

async function moveToPosition(api, id, destination) {
  const tabs = await api.tabs.query({ windowId: destination.windowId });
  const index = insertionIndex(tabs, id, destination);
  if (tabs.find((tab) => tab.id === id).index !== index) {
    await api.tabs.move(id, { index });
  }
}

export function createChromeBrowser(api = chrome) {
  return {
    isDemo: false,
    statusBackend: createChromeStatusBackend(api),
    async snapshot() {
      const [windows, groups, current, labels] = await Promise.all([
        api.windows.getAll({ populate: true, windowTypes: ['normal'] }),
        api.tabGroups.query({}),
        api.windows.getCurrent(),
        api.storage.session.get(null),
      ]);
      return { windows, groups, currentWindowId: current.id, labels };
    },
    async activate(tab) {
      await api.tabs.update(tab.id, { active: true });
      await api.windows.update(tab.windowId, { focused: true });
    },
    async focusWindow(id) {
      await api.windows.update(id, { focused: true });
    },
    async close(id) {
      await api.tabs.remove(id);
    },
    async labelWindow(id, label) {
      await api.storage.session.set({ [`window-label-${id}`]: label });
    },
    async collapseGroup(id, collapsed) {
      await api.tabGroups.update(id, { collapsed });
    },
    async sort(mode, windowIds) {
      const { windows, groups } = await this.snapshot();
      const selected = windows.filter((w) => windowIds.includes(w.id));
      if (selected.some((window) => window.tabs.some(isSplitView))) {
        throw new Error('Separate split-view tabs in Chrome before sorting this window.');
      }
      for (const window of selected) {
        for (const segment of segmentsForWindow(window, groups, mode)) {
          await sortSegment(api, window.id, segment);
        }
      }
    },
    async move(id, destination) {
      const tab = await api.tabs.get(id);
      if (destination.anchorId === id) {
        return;
      }
      await validateMoveDestination(api, tab, destination);
      if (tab.windowId !== destination.windowId) {
        await api.tabs.move(id, { windowId: destination.windowId, index: tab.pinned ? 0 : -1 });
      }
      await setGroupMembership(api, id, destination.groupId);
      await moveToPosition(api, id, destination);

      // Chrome may infer group membership at a boundary. Make the destination explicit.
      await setGroupMembership(api, id, destination.groupId);
    },
    favicon(tab) {
      const url = new URL(api.runtime.getURL('/_favicon/'));
      url.searchParams.set('pageUrl', tab.url || '');
      url.searchParams.set('size', '32');
      return url.href;
    },
    subscribe(callback, statusCallback = callback) {
      const events = [
        api.tabs.onCreated,
        api.tabs.onRemoved,
        api.tabs.onUpdated,
        api.tabs.onMoved,
        api.tabs.onAttached,
        api.tabs.onDetached,
        api.tabs.onActivated,
        api.tabs.onReplaced,
        api.windows.onCreated,
        api.windows.onRemoved,
        api.windows.onFocusChanged,
        api.tabGroups.onCreated,
        api.tabGroups.onUpdated,
        api.tabGroups.onMoved,
        api.tabGroups.onRemoved,
      ];
      events.forEach((event) => event.addListener(callback));
      const onStorage = (changes, area) => {
        if (area !== 'session') {
          return;
        }
        const keys = Object.keys(changes);
        if (keys.some((key) => key.startsWith('window-label-'))) {
          callback();
        }
        if (keys.some((key) => key.startsWith('page-status:'))) {
          statusCallback();
        }
      };
      api.storage.onChanged.addListener(onStorage);
      api.permissions.onAdded.addListener(statusCallback);
      api.permissions.onRemoved.addListener(statusCallback);
      return () => {
        events.forEach((event) => event.removeListener(callback));
        api.storage.onChanged.removeListener(onStorage);
        api.permissions.onAdded.removeListener(statusCallback);
        api.permissions.onRemoved.removeListener(statusCallback);
      };
    },
  };
}
