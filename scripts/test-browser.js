import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { verifyPageStatuses, verifyGrantedPageStatuses } from './test-page-status.js';

async function verifyThemes(context, page) {
  const selectedTheme = (target = page) =>
    target.locator('#theme [aria-pressed="true"]').getAttribute('data-theme');
  const chooseTheme = (value) => page.locator(`#theme [data-theme="${value}"]`).click();
  const appliedTheme = () => page.locator('html').getAttribute('data-theme');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await selectedTheme(), 'system');
  assert.equal(await appliedTheme(), 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(
    await page.locator('html').evaluate((node) => getComputedStyle(node).colorScheme),
    'dark',
  );
  await chooseTheme('light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await appliedTheme(), 'light');
  await chooseTheme('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await appliedTheme(), 'dark');
  await page.reload();
  assert.equal(await appliedTheme(), 'dark');
  assert.equal(await selectedTheme(), 'dark');

  const other = await context.newPage();
  await other.goto(page.url());
  assert.equal(await selectedTheme(other), 'dark');
  await chooseTheme('system');
  await other.waitForFunction(
    () =>
      document.querySelector('#theme [data-theme="system"]').getAttribute('aria-pressed') ===
      'true',
  );
  assert.equal(await appliedTheme(), 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await other.close();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  console.log('PASS: system theme changes, explicit overrides, reload persistence, and tab sync');
}

async function verifyWindowLayout(page, fixture) {
  await page.evaluate(async ({ otherWindowId }) => {
    await chrome.windows.create({ url: 'https://example.com/layout-only-3', focused: false });
    await chrome.windows.create({ url: 'https://example.com/layout-only-4', focused: false });
    for (let index = 0; index < 20; index++) {
      await chrome.tabs.create({
        windowId: otherWindowId,
        url: `https://example.com/layout-long-${index}`,
        active: false,
      });
    }
  }, fixture);
  await page.bringToFront();
  await page.waitForFunction(() => document.querySelectorAll('.window-card').length === 4);
  if ((await page.locator('#duplicates').getAttribute('aria-pressed')) === 'true') {
    await page.getByRole('button', { name: 'Find duplicates', exact: false }).click();
  }

  // With a tall second window, the next two windows should fill the space
  // below the first window instead of waiting for the second one's bottom.
  await page.waitForFunction(() => {
    const boxes = [...document.querySelectorAll('.window-card')].map((card) =>
      card.getBoundingClientRect(),
    );
    return (
      Math.abs(boxes[2].top - boxes[0].bottom - 24) < 1 &&
      Math.abs(boxes[3].top - boxes[2].bottom - 24) < 1 &&
      boxes[3].bottom < boxes[1].bottom
    );
  });
  await page.screenshot({
    path: resolve(artifacts, 'tabtastic-four-windows.png'),
    fullPage: true,
    animations: 'disabled',
  });

  const thirdTop = await page
    .locator('.window-card')
    .nth(2)
    .evaluate((card) => card.getBoundingClientRect().top);
  await page.locator(`[data-focus-key="group-${fixture.groupId}"]`).click();
  await page.waitForFunction((previousTop) => {
    const cards = document.querySelectorAll('.window-card');
    const first = cards[0].getBoundingClientRect();
    const third = cards[2].getBoundingClientRect();
    return third.top < previousTop - 30 && Math.abs(third.top - first.bottom - 24) < 1;
  }, thirdTop);

  await page.setViewportSize({ width: 1900, height: 1100 });
  await page.waitForFunction(() => {
    const boxes = [...document.querySelectorAll('.window-card')].map((card) =>
      card.getBoundingClientRect(),
    );
    return (
      Math.abs(boxes[0].top - boxes[2].top) < 1 &&
      Math.abs(boxes[3].left - boxes[2].left) < 1 &&
      Math.abs(boxes[3].top - boxes[2].bottom - 24) < 1
    );
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const boxes = [...document.querySelectorAll('.window-card')].map((card) =>
      card.getBoundingClientRect(),
    );
    return boxes.every(
      (box, index) =>
        index === 0 ||
        (Math.abs(box.left - boxes[index - 1].left) < 1 &&
          Math.abs(box.top - boxes[index - 1].bottom - 20) < 1),
    );
  });
  await page.locator('#search').fill('layout-only-3');
  await page.waitForFunction(() => document.querySelectorAll('.window-card').length === 1);
  const layout = await page.evaluate(() => ({
    cardHeight: document.querySelector('.window-card').getBoundingClientRect().height,
    containerHeight: document.querySelector('#windows').getBoundingClientRect().height,
    fitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
  }));
  assert.ok(Math.abs(layout.cardHeight - layout.containerHeight) < 1);
  assert.ok(layout.fitsViewport);
  await page.locator('#search').fill('no-window-matches-this');
  await page.waitForFunction(() => document.querySelectorAll('.window-card').length === 0);
  assert.equal(
    await page.locator('#windows').evaluate((node) => node.getBoundingClientRect().height),
    0,
  );
  console.log(
    'PASS: unequal window heights pack without gaps; collapse, resize, and filtering reflow cards',
  );
}

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..');
const extensionRoot = process.env.EXTENSION_PATH ? resolve(process.env.EXTENSION_PATH) : root;
const artifacts = resolve(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const launchOptions = {
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : { channel: 'chromium' }),
  args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
  viewport: { width: 1440, height: 1100 },
};
const context = await chromium.launchPersistentContext('', launchOptions);
const errors = [];
context.on('page', (page) =>
  page.on('pageerror', (error) =>
    errors.push({ page: page.url(), message: error.message, stack: error.stack }),
  ),
);
await context.route('https://example.com/**', (route) => {
  if (route.request().resourceType() !== 'document') {
    return route.fulfill({ status: 204, body: '' });
  }
  return route.fulfill({
    contentType: 'text/html',
    body: `<title>${new URL(route.request().url()).pathname.slice(1)}</title><p>Tabtastic test fixture</p>`,
  });
});
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.locator('.window-card').first().waitFor();
  assert.equal(await page.locator('#preview-banner').isVisible(), false);
  console.log('PASS: unpacked Manifest V3 extension loads with real Chrome APIs');
  await verifyThemes(context, page);
  await verifyPageStatuses(context, page, artifacts);
  await verifyGrantedPageStatuses(chromium, launchOptions, extensionRoot, artifacts);
  const fixture = await page.evaluate(async () => {
    const current = await chrome.windows.getCurrent();
    const create = (title, windowId = current.id) =>
      chrome.tabs.create({ url: `https://example.com/${title}`, active: false, windowId });
    const pinnedZ = await create('pinned-z');
    const pinnedA = await create('pinned-a');
    await chrome.tabs.update(pinnedZ.id, { pinned: true });
    await chrome.tabs.update(pinnedA.id, { pinned: true });
    const z = await create('z');
    const a = await create('a');
    const b = await create('b');
    const groupId = await chrome.tabs.group({ tabIds: [z.id, a.id, b.id] });
    await chrome.tabGroups.update(groupId, { title: 'Project <img src=x>', color: 'purple' });
    const looseZ = await create('loose-z');
    const looseA = await create('loose-a');
    const other = await chrome.windows.create({ url: 'https://example.com/z', focused: false });
    const targetA = await create('target-a', other.id);
    const targetB = await create('target-b', other.id);
    const targetGroup = await chrome.tabs.group({
      tabIds: [targetA.id, targetB.id],
      createProperties: { windowId: other.id },
    });
    await chrome.tabGroups.update(targetGroup, { title: 'Destination', color: 'blue' });
    return {
      windowId: current.id,
      otherWindowId: other.id,
      pinnedZ: pinnedZ.id,
      pinnedA: pinnedA.id,
      z: z.id,
      a: a.id,
      b: b.id,
      groupId,
      looseZ: looseZ.id,
      looseA: looseA.id,
      targetA: targetA.id,
      targetB: targetB.id,
      targetGroup,
    };
  });
  await page.locator('.group-pill', { hasText: 'Project <img src=x>' }).waitFor();
  assert.equal(await page.locator('.group-pill img').count(), 0);
  await page.getByRole('button', { name: 'Find duplicates', exact: false }).click();
  await page.waitForFunction(() => document.querySelectorAll('.is-duplicate').length >= 2);
  assert.match(await page.locator('#duplicate-banner').innerText(), /share/);
  console.log('PASS: live tab/group events, safe titles and duplicate highlighting');

  // Exercise production adapter on native tabs; titles need not finish network loading.
  await page.evaluate(async (fixture) => {
    const { createChromeBrowser } = await import('./lib/browser.js');
    await createChromeBrowser().sort('url', [fixture.windowId]);
  }, fixture);
  let actual = await page.evaluate((id) => chrome.tabs.query({ windowId: id }), fixture.windowId);
  assert.ok(
    actual.find((t) => t.id === fixture.pinnedA).index <
      actual.find((t) => t.id === fixture.pinnedZ).index,
  );
  assert.deepEqual(
    actual.filter((t) => t.groupId === fixture.groupId).map((t) => t.id),
    [fixture.a, fixture.b, fixture.z],
  );
  assert.ok(
    actual.find((t) => t.id === fixture.looseA).index <
      actual.find((t) => t.id === fixture.looseZ).index,
  );
  console.log('PASS: URL sorting reorders native tabs and preserves pins and groups');

  const move = (destination) =>
    page.evaluate(async ({ id, destination }) => {
      const { createChromeBrowser } = await import('./lib/browser.js');
      await createChromeBrowser().move(id, destination);
    }, destination);
  await move({
    id: fixture.z,
    destination: {
      windowId: fixture.windowId,
      groupId: fixture.groupId,
      pinned: false,
      anchorId: fixture.a,
      after: false,
    },
  });
  actual = await page.evaluate((id) => chrome.tabs.query({ windowId: id }), fixture.windowId);
  assert.deepEqual(
    actual.filter((t) => t.groupId === fixture.groupId).map((t) => t.id),
    [fixture.z, fixture.a, fixture.b],
  );
  await move({
    id: fixture.z,
    destination: {
      windowId: fixture.otherWindowId,
      groupId: fixture.targetGroup,
      pinned: false,
      anchorId: fixture.targetB,
      after: false,
    },
  });
  actual = await page.evaluate((id) => chrome.tabs.query({ windowId: id }), fixture.otherWindowId);
  assert.deepEqual(
    actual.filter((t) => t.groupId === fixture.targetGroup).map((t) => t.id),
    [fixture.targetA, fixture.z, fixture.targetB],
  );
  await move({
    id: fixture.z,
    destination: { windowId: fixture.otherWindowId, groupId: -1, pinned: false },
  });
  actual = await page.evaluate((id) => chrome.tabs.query({ windowId: id }), fixture.otherWindowId);
  assert.equal(actual.at(-1).id, fixture.z);
  assert.equal(actual.at(-1).groupId, -1);
  console.log('PASS: reordering within groups, moving across windows, and ungrouping');

  // Drive the sorting UI and inspect the native strip, rather than just the adapter.
  await page.getByRole('button', { name: 'All tabs', exact: true }).click();
  await page.locator('[data-sort="title"]').click();
  await page.waitForFunction(() => !document.body.classList.contains('busy'));
  actual = await page.evaluate((id) => chrome.tabs.query({ windowId: id }), fixture.windowId);
  assert.deepEqual(
    actual.filter((t) => t.groupId === fixture.groupId).map((t) => t.id),
    [fixture.a, fixture.b],
  );
  assert.ok(
    actual.find((t) => t.id === fixture.looseA).index <
      actual.find((t) => t.id === fixture.looseZ).index,
  );
  // A real row drop into another Chrome group must update group membership.
  await page
    .locator(`[data-tab-id="${fixture.b}"]`)
    .dragTo(page.locator(`[data-tab-id="${fixture.targetA}"]`));
  await page.waitForFunction(
    async ({ id, groupId }) => (await chrome.tabs.get(id)).groupId === groupId,
    { id: fixture.b, groupId: fixture.targetGroup },
  );
  const dragged = await page.evaluate((id) => chrome.tabs.get(id), fixture.b);
  assert.equal(dragged.windowId, fixture.otherWindowId);
  console.log('PASS: sorting buttons and native drag-and-drop change Chrome itself');

  await page.evaluate(async ({ windowId }) => {
    const { createChromeBrowser } = await import('./lib/browser.js');
    await createChromeBrowser().labelWindow(windowId, 'My test window');
  }, fixture);
  await page.locator('.window-title', { hasText: 'My test window' }).waitFor();
  await page.reload();
  await page.locator('.window-title', { hasText: 'My test window' }).waitFor();
  console.log('PASS: window labels persist across new-tab page reloads');

  await verifyWindowLayout(page, fixture);

  const preview = await context.newPage();
  await preview.goto('http://127.0.0.1:5173');
  await preview.locator('.window-card').first().waitFor();
  assert.equal(await preview.locator('.tab-row').count(), 24);
  await preview.screenshot({
    path: resolve(artifacts, 'tabtastic-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await preview.locator('#theme [data-theme="dark"]').click();
  await preview.screenshot({
    path: resolve(artifacts, 'tabtastic-desktop-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await preview.locator('#theme [data-theme="system"]').click();
  await preview.getByRole('button', { name: 'Find duplicates', exact: false }).click();
  assert.equal(await preview.locator('.is-duplicate').count(), 6);
  await preview.screenshot({
    path: resolve(artifacts, 'tabtastic-duplicates.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await preview.locator('#search').fill('chrome tabtastic');
  assert.ok((await preview.locator('.tab-row').count()) > 0);
  assert.equal(await preview.locator('[data-sort="url"]').isDisabled(), true);
  await preview.locator('#search').fill('nothing-will-match-this');
  assert.equal(await preview.locator('#empty').isVisible(), true);
  await preview.getByRole('button', { name: 'Clear filters' }).click();
  await preview.getByRole('button', { name: 'Find duplicates', exact: false }).click();
  await preview.locator('[data-tab-id="3"]').dragTo(preview.locator('[data-tab-id="13"]'));
  await preview.waitForFunction(() =>
    document.querySelectorAll('.window-card')[1].querySelector('[data-tab-id="3"]'),
  );
  await preview.getByRole('button', { name: 'Use compact rows' }).click();
  assert.ok(await preview.locator('body').evaluate((node) => node.classList.contains('compact')));
  await preview.getByRole('button', { name: 'Use comfortable rows' }).click();
  await preview.setViewportSize({ width: 390, height: 844 });
  await preview.reload();
  await preview.locator('.tab-row').first().waitFor();
  await preview.evaluate(() => {
    document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await preview.screenshot({
    path: resolve(artifacts, 'tabtastic-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  assert.equal(
    await preview.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  console.log('PASS: preview search, filters, drag-and-drop, density, and narrow layout');
  assert.deepEqual(errors, []);
  console.log('PASS: no uncaught browser errors');
} catch (error) {
  const dashboard = context.pages().find((page) => page.url().startsWith('chrome-extension://'));
  if (dashboard) {
    console.error(
      await dashboard.evaluate(() => ({
        toast: document.querySelector('#toast')?.textContent,
        progress: document.querySelector('#provider-progress')?.textContent,
        enableDisabled: document.querySelector('#provider-enable')?.disabled,
      })),
    );
    await dashboard.screenshot({ path: resolve(artifacts, 'test-failure.png'), fullPage: true });
  }
  throw error;
} finally {
  await context.close();
}
