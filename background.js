import { fetchPageHtml } from './lib/page-fetch.js';
import { pageTarget } from './lib/providers/index.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'page-status-fetch') {
    return;
  }
  const read = async () => {
    const target = pageTarget({ url: message.url });
    if (
      sender.id !== chrome.runtime.id ||
      sender.url !== chrome.runtime.getURL('index.html') ||
      sender.tab?.incognito ||
      !target ||
      target.url !== message.url
    ) {
      throw new Error('Unsupported status request.');
    }
    if (!(await chrome.permissions.contains({ origins: target.provider.origins }))) {
      throw new Error('Enable statuses to allow access to this site.');
    }
    return fetchPageHtml(target.url);
  };
  read().then(
    (html) => sendResponse({ html }),
    (error) => sendResponse({ error: { name: error.name, message: error.message } }),
  );
  // Keep the channel open on Chrome versions without async listener support.
  return true;
});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('index.html');
  const existing = (await chrome.tabs.query({})).find((tab) => tab.url === url);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  chrome.storage.session.remove(`window-label-${windowId}`).catch(console.error);
});
