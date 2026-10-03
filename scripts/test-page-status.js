import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

async function verifyAuthenticatedFetch(context, worker) {
  let receivedCookie;
  const server = createServer((request, response) => {
    receivedCookie = request.headers.cookie;
    response.setHeader('Content-Type', 'text/html');
    response.end('<div class="gh-header"><span class="State">Open</span></div>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    await context.addCookies([
      {
        name: 'tabtastic_test_session',
        value: 'signed-in-fixture',
        url,
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    const html = await worker.evaluate((url) => globalThis.testFetchPageHtml(url), url);
    assert.match(html, /<span class="State">Open<\/span>/);
    assert.ok(receivedCookie?.includes('tabtastic_test_session=signed-in-fixture'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Native optional-permission prompts cannot be clicked in headless Chrome.
// Use the unchanged manifest for denial, then an isolated copy with the same
// host pre-granted to exercise the actual authenticated network path.
export async function verifyGrantedPageStatuses(chromium, launchOptions, extensionRoot, artifacts) {
  const root = await mkdtemp(resolve(tmpdir(), 'tabtastic-status-test-'));
  let context;
  try {
    for (const file of [
      'manifest.json',
      'index.html',
      'styles.css',
      'app.js',
      'background.js',
      'lib',
      'assets',
    ]) {
      await cp(resolve(extensionRoot, file), resolve(root, file), { recursive: true });
    }
    const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
    manifest.host_permissions = ['https://github.com/*', 'http://127.0.0.1/*'];
    await writeFile(resolve(root, 'manifest.json'), JSON.stringify(manifest));
    // Expose the production worker transport only in this isolated test copy,
    // so the local cookie fixture need not become a supported status provider.
    const background = await readFile(resolve(root, 'background.js'), 'utf8');
    await writeFile(
      resolve(root, 'background.js'),
      `${background}\nglobalThis.testFetchPageHtml = fetchPageHtml;\n`,
    );
    context = await chromium.launchPersistentContext('', {
      ...launchOptions,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Exercise the actual new-tab override as well as direct extension URLs.
    await page.goto('chrome://newtab/');
    await page.locator('.window-card').first().waitFor();
    await verifyAuthenticatedFetch(context, worker);
    await verifyPageStatuses(context, page, artifacts, true);
    assert.deepEqual(errors, []);
  } finally {
    await context?.close();
    await rm(root, { recursive: true, force: true });
  }
}

export async function verifyPageStatuses(context, page, artifacts, granted = false) {
  const parsed = await page.evaluate(async () => {
    const { github } = await import('./lib/providers/github.js');
    const parse = (html) => {
      const template = document.createElement('template');
      template.innerHTML = html;
      return github.parse(template.content);
    };
    const currentIssue = (state) =>
      `<div data-testid="issue-header"><span data-testid="header-state" data-status="${state}">ignored label</span></div>`;
    const currentPR = (state) =>
      `<div data-component="PageHeader"><span data-component="StateLabel" data-status="${state}">ignored label</span></div>`;
    const legacy = (state) =>
      `<div class="gh-header"><span class="State"><svg></svg>${state}</span></div>`;
    return [
      ...['issueOpened', 'issueClosed', 'issueClosedNotPlanned'].map((state) =>
        parse(currentIssue(state)),
      ),
      ...['pullOpened', 'pullDraft', 'pullMerged', 'pullClosed'].map((state) =>
        parse(currentPR(state)),
      ),
      ...['Open', 'Draft', 'Merged', 'Closed', 'Closed (not planned)'].map((state) =>
        parse(legacy(state)),
      ),
      // Structure observed in the full HTML of microsoft/vscode/issues/1:
      // the metadata and sticky chip sit outside the issue-header title region.
      parse(
        '<div data-testid="issue-header"><h1>Issue title</h1></div><div><span data-testid="header-state" data-component="StateLabel" data-status="issueClosed">Closed</span></div><div><span data-testid="header-state" data-component="StateLabel" data-status="issueClosed">Closed</span></div>',
      ),
      parse('<div class="comment"><span class="State">Closed</span></div>'),
      parse('<div data-component="StateLabel" data-status="pullMerged">Merged</div>'),
      parse(currentIssue('issueOpened') + currentIssue('issueClosed')),
      parse('<title>Sign in to GitHub</title><p>Open an account</p>'),
      parse(
        currentPR('pullMerged') + '<div class="timeline"><span class="State">Closed</span></div>',
      ),
    ];
  });
  assert.deepEqual(parsed, [
    'open',
    'closed',
    'not-planned',
    'open',
    'draft',
    'merged',
    'closed',
    'open',
    'draft',
    'merged',
    'closed',
    'not-planned',
    'closed',
    null,
    null,
    null,
    null,
    'merged',
  ]);

  const statuses = new Map([
    ['1', 'issueOpened'],
    ['2', 'pullMerged'],
    ['3', 'pullDraft'],
  ]);
  let failed = false;
  let heldChecks = null;
  let documentRequests = 0;
  const checks = [];
  const unexpectedRequests = [];
  const preloadWarnings = [];
  const onConsole = (message) => {
    if (message.text().includes('preload')) {
      preloadWarnings.push(message.text());
    }
  };
  page.on('console', onConsole);
  await context.route('https://github.com/**', async (route) => {
    const request = route.request();
    if (/secondary_view|fixture-resource/.test(request.url())) {
      unexpectedRequests.push(request.url());
      return route.fulfill({ status: 204, body: '' });
    }
    if (request.resourceType() !== 'document' && request.resourceType() !== 'fetch') {
      return route.fulfill({ status: 204, body: '' });
    }
    if (request.resourceType() === 'fetch') {
      checks.push(request.url());
      assert.ok(request.serviceWorker(), 'Status requests must come from the background worker');
    } else {
      documentRequests++;
    }
    if (failed && request.resourceType() === 'fetch') {
      return route.fulfill({ status: 503, body: 'Unavailable' });
    }
    const id = new URL(request.url()).pathname.split('/')[4];
    const isCheck = request.resourceType() === 'fetch';
    if (isCheck && heldChecks) {
      await heldChecks.get(id);
    }
    return route.fulfill({
      contentType: 'text/html',
      // GitHub issue responses advertise this extra request in an HTTP header.
      // A document fetch preloads it even if the HTML is never inserted into a page.
      headers: isCheck
        ? {
            link: `<${request.url()}/secondary_view?markAsRead=true>; rel=preload; as=fetch; crossorigin=use-credentials`,
          }
        : {},
      body: `<title>GitHub fixture ${id}</title>${isCheck ? '<link rel="preload" as="fetch" href="https://github.com/fixture-resource"><img src="https://github.com/fixture-resource">' : ''}<div data-component="PageHeader"><span data-component="StateLabel" data-status="${statuses.get(id)}">state</span></div><script>window.fixtureLoaded = true;</script>`,
    });
  });
  // Attach routing before navigation; tabs.create can load before Playwright
  // attaches to the tab, escaping the fixture route.
  for (const path of ['issues/1', 'pull/2', 'pull/2/files', 'pull/3']) {
    const fixture = await context.newPage();
    await fixture.goto(`https://github.com/example/test/${path}`);
  }
  await page.bringToFront();
  const tabs = await page.evaluate(() =>
    chrome.tabs.query({ url: 'https://github.com/example/test/*' }),
  );
  const ids = tabs.map((tab) => tab.id);
  assert.equal(ids.length, 4, JSON.stringify(tabs));
  await page.waitForFunction(
    async (ids) =>
      (await Promise.all(ids.map((id) => chrome.tabs.get(id)))).every(
        (tab) => tab.status === 'complete',
      ),
    ids,
  );
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 4);
  assert.equal(await page.locator('.tab-row').count(), 4);
  assert.equal(await page.locator('[data-sort="url"]').isDisabled(), true);
  if (!granted) {
    await page.locator('#provider-enable').waitFor({ state: 'visible' });
    assert.equal(checks.length, 0);
    const denied = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'page-status-fetch',
        url: 'https://github.com/example/test/issues/1',
      }),
    );
    assert.match(denied.error.message, /Enable statuses/);
    assert.equal(checks.length, 0);
    assert.equal(
      await page.locator('.page-status-badge').filter({ hasText: 'Unknown' }).count(),
      4,
    );
    await page.evaluate((ids) => chrome.tabs.remove(ids), ids);
    await page.getByRole('button', { name: 'All tabs', exact: true }).click();
    page.off('console', onConsole);
    console.log('PASS: no GitHub requests or inferred states without optional host access');
    return;
  }
  await page.waitForFunction(() => document.querySelector('#provider-enable').hidden);
  await page.waitForFunction(
    () => document.querySelectorAll('.page-status-badge.tone-purple').length === 2,
  );
  assert.equal(checks.length, 3);
  const rejected = await page.evaluate(() =>
    Promise.all(
      [
        'https://example.com/',
        'https://github.com/example/test/issues/1/secondary_view?markAsRead=true',
      ].map((url) => chrome.runtime.sendMessage({ type: 'page-status-fetch', url })),
    ),
  );
  assert.ok(rejected.every((response) => /Unsupported/.test(response.error?.message)));
  // Chrome reports unused preloads on a delayed timer, not when fetch resolves.
  await new Promise((resolve) => setTimeout(resolve, 4000));
  assert.deepEqual(unexpectedRequests, []);
  assert.deepEqual(preloadWarnings, []);
  assert.equal(await page.evaluate(() => window.fixtureLoaded), undefined);

  // Chrome 145 crashes in tabs.discard under headless automation. Freeze a real
  // renderer instead; the unit suite separately covers discarded snapshots.
  const pausedPage = context.pages().find((tab) => tab.url().endsWith('/issues/1'));
  const lifecycle = await context.newCDPSession(pausedPage);
  await lifecycle.send('Page.setWebLifecycleState', { state: 'frozen' });
  statuses.set('1', 'issueClosed');
  statuses.set('3', 'pullOpened');
  await page.locator('#status-filter').selectOption('finished');
  await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 2);
  await page.locator('#provider-refresh').click();
  await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 3);
  await page.waitForFunction(() => !document.querySelector('#provider-refresh').disabled);
  assert.equal(checks.length, 6);
  assert.equal(documentRequests, 4);
  assert.equal(
    await pausedPage.locator('[data-status]').getAttribute('data-status'),
    'issueOpened',
  );
  assert.equal(
    await page.evaluate((id) => chrome.tabs.get(id).then((tab) => tab.active), ids[0]),
    false,
  );
  assert.match(
    await page.locator(`[data-tab-id="${ids[0]}"] .page-status-badge`).getAttribute('title'),
    /Last checked/,
  );
  await page.screenshot({ path: resolve(artifacts, 'tabtastic-github.png'), fullPage: true });

  failed = true;
  await page.locator('#provider-refresh').click();
  await page.waitForFunction(() =>
    document.querySelector('#provider-progress').textContent.includes('4 unavailable'),
  );
  assert.match(
    await page.locator(`[data-tab-id="${ids[0]}"] .page-status-badge`).textContent(),
    /Closed · stale/,
  );
  await page.locator('#status-filter').selectOption('unknown');
  assert.equal(await page.locator('.tab-row').count(), 4);
  failed = false;
  await page.locator('#provider-refresh').click();
  await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 0);
  await page.locator('#status-filter').selectOption('all');
  assert.equal(await page.locator('.tab-row').count(), 4);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await page.screenshot({
    path: resolve(artifacts, 'tabtastic-github-mobile.png'),
    fullPage: true,
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 1100 });

  // Hold each response so both progress callbacks and session-cache events run
  // while the user is hovering/focusing controls, in All tabs and filtered views.
  const releases = new Map();
  heldChecks = new Map(
    ['1', '2', '3'].map((id) => [id, new Promise((resolve) => releases.set(id, resolve))]),
  );
  await page.locator('#provider-refresh').click();
  await page.getByRole('button', { name: 'All tabs', exact: true }).click();
  await page.locator('#search').fill('github.com/example/test');
  await page.locator(`[data-tab-id="${ids[1]}"] .close-tab`).hover();
  await page.locator(`[data-tab-id="${ids[2]}"] .close-tab`).focus();
  await rememberControls(page);
  releases.get('2')();
  await page.waitForFunction(
    (id) =>
      document.querySelector(`[data-tab-id="${id}"] .page-status-badge`).textContent === 'Merged',
    ids[1],
  );
  // Allow the former full-snapshot refresh debounce to run after the cache write.
  await new Promise((resolve) => setTimeout(resolve, 250));
  await assertControlsRetained(page);
  assert.equal(
    await page
      .locator(`[data-tab-id="${ids[1]}"] .row-actions`)
      .evaluate((node) => getComputedStyle(node).opacity),
    '1',
  );

  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.locator('#status-filter').selectOption('finished');
  await page.locator(`[data-tab-id="${ids[2]}"] .close-tab`).focus();
  await rememberControls(page, [ids[1], ids[2]]);
  statuses.set('1', 'issueOpened');
  releases.get('1')();
  await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 2);
  statuses.set('3', 'pullClosed');
  releases.get('3')();
  await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 3);
  await page.waitForFunction(() => !document.querySelector('#provider-refresh').disabled);
  await assertControlsRetained(page);
  assert.match(await page.locator('#summary').textContent(), /3 matching tabs/);
  assert.equal(await page.locator('.section-count').textContent(), '3');
  heldChecks = null;

  // A result saved by another extension context must update the badge and
  // filter without rebuilding the tab snapshot or navigation.
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async () => {
    const key = 'page-status:github:https://github.com/example/test/pull/3';
    const saved = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.set({
      [key]: { state: 'open', checkedAt: saved.checkedAt + 1, attemptedAt: saved.attemptedAt + 1 },
    });
  });
  await page.waitForFunction(() => document.querySelectorAll('.tab-row').length === 2);
  await assertControlsRetained(page);
  await page.locator('#status-filter').selectOption('all');
  assert.equal(
    await page.locator(`[data-tab-id="${ids[3]}"] .page-status-badge`).textContent(),
    'Open',
  );
  await page.locator('#search').fill('');
  console.log(
    'PASS: refresh keeps hovered/focused controls attached through progress, cache writes and filtered membership changes',
  );

  await lifecycle.send('Page.setWebLifecycleState', { state: 'active' });
  await lifecycle.detach();
  await page.evaluate((ids) => chrome.tabs.remove(ids), ids);
  await page.getByRole('button', { name: 'All tabs', exact: true }).click();
  page.off('console', onConsole);
  console.log(
    'PASS: GitHub header parsing, authenticated worker checks without preloads, filtered refresh, paused tabs, failure recovery and mobile layout',
  );
}

async function rememberControls(page, ids = null) {
  await page.evaluate((ids) => {
    const rows = [...document.querySelectorAll('.tab-row')].filter(
      (row) => !ids || ids.includes(Number(row.dataset.tabId)),
    );
    globalThis.refreshControls = {
      focus: document.activeElement,
      nodes: [
        ...rows.flatMap((row) => [row, ...row.querySelectorAll('.row-actions button')]),
        ...document.querySelectorAll(
          '#navigation button, #window-navigation button, #status-filter option',
        ),
      ],
    };
  }, ids);
}

async function assertControlsRetained(page) {
  const result = await page.evaluate(() => ({
    attached: globalThis.refreshControls.nodes.every((node) => node.isConnected),
    focused: document.activeElement === globalThis.refreshControls.focus,
  }));
  assert.deepEqual(result, { attached: true, focused: true });
}
