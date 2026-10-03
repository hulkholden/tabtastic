# Tabtastic

A Chrome new-tab extension for finding and organising open tabs. Native JavaScript, CSS, and Manifest V3; no build step, runtime dependencies, account, or server required.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `tabtastic` folder.
4. Open a new tab and accept Chrome’s prompt to keep Tabtastic as your new-tab page. If Favitabs still owns the new-tab page, disable it.

After changing the extension’s source, click **Reload** on its card in `chrome://extensions` and reload the new-tab page.

### Load a clean bundle with your real tabs

```sh
bun run build
```

This creates `dist/tabtastic/` with only the extension’s runtime files and `dist/tabtastic.zip` for sharing or archiving (the ZIP requires the `zip` command, included on macOS).

In your usual Chrome profile, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose `dist/tabtastic/`. Select the folder containing `manifest.json`, not the ZIP. Then open a new tab. Unlike the localhost preview, this uses your real tabs, windows, and groups. Sorting and dragging change your real Chrome tab strip.

After edits, run `bun run build` again, click **Reload** on Tabtastic’s extension card, and refresh the new-tab page. Keep the bundle folder in place while the extension is installed. Disable Tabtastic in `chrome://extensions` to stop using it, and re-enable Favitabs if desired.

## What it does

- Mirrors normal Chrome windows, pinned tabs, group names, colours, collapsed state, and tab order. Updates as Chrome changes.
- Switches to a tab and focuses its window when you click it.
- **Title A–Z** and **URL A–Z** reorder Chrome’s actual tabs. They sort each group, the pinned section, and each contiguous ungrouped section separately. Group positions stay intact. Choose a window in the sidebar to sort just that window. Sorting is disabled during search or duplicate filtering, so hidden results cannot be silently reordered.
- **Find duplicates** highlights all tabs sharing a full URL across windows. **Duplicates** in the sidebar shows only those tabs, keeping their window and group context. Counts include every matching tab, including the first copy. Query strings and fragments remain significant; browser utility pages are excluded. Nothing is automatically closed.
- Drag a row above or below another tab to reorder it. Drag onto a group heading to append to that group, or onto a window’s bottom drop area to move there without a group. This changes Chrome itself. Pinned tabs can move only to another pinned section; the row’s **Move** button also supports moving them into windows without existing pinned tabs.
- The row’s **Move** button is a keyboard-accessible alternative to dragging. The **Close** button closes that one tab; use Chrome’s Reopen closed tab command to restore it.
- Search titles, URLs, group names, and Tabtastic window labels. `/` or `⌘/Ctrl K` focuses search, `Enter` switches to the first result, and `Escape` clears search. Search and duplicate highlighting temporarily reveal collapsed groups without changing their saved collapsed state.
- **Theme** icon buttons (monitor, sun, and moon) offer **Use system default** (the default), **Light**, and **Dark**. Your choice persists across new tabs and browser restarts; system mode follows changes to your device’s appearance automatically.
- Compact rows, local favicons, current-window indicators, and audio indicators.
- **GitHub** view with Open, Draft, Merged, Closed, and Not planned badges for issue and pull-request tabs. Filter to **Closed / merged** to find finished work, then use each row’s Close button.

### GitHub statuses without a token

Open **GitHub** in the sidebar and choose **Enable statuses**. Chrome asks for optional access to `https://github.com/*`. Tabtastic uses your existing GitHub sign-in to fetch issue and PR pages and read their header status chips; it does not use the GitHub API or require a PAT. Badges then appear in every tab view. Repository pages and other GitHub pages are excluded from the GitHub view.

**Refresh statuses** checks every issue and PR tab, including those hidden by search or status filters. It fetches a fresh copy of the page without activating, reloading, or resuming the actual tab. Chrome Memory Saver/discarded and frozen tabs therefore work, and unfinished comments remain untouched. PR subpages such as Files changed share a single check with the conversation tab. Up to three pages are checked concurrently, with progress shown in the view.

Successful checks are reused for five minutes and rechecked when the dashboard next updates. Hover a badge for its last check time. Older results are labelled **stale**; a failed check preserves the previous result with that same label and an error explanation. **Unknown / failed** finds inaccessible or unreadable pages. Refresh retries failures. Nothing is closed automatically.

Checks run while a Tabtastic dashboard is open. Statuses are cached in session storage, so they survive dashboard reloads but reset on browser restart or extension reload. Revoke GitHub access through Chrome’s extension settings. Private repositories use your browser’s session; sign-in, cookie restrictions, network errors, redirected pages, or GitHub markup changes can prevent a check. A missing chip is treated as unknown, never as closed. GitHub Enterprise hosts, incognito status checks, and third-party suspender pages that replace the original URL are not currently supported.

### Window names and other limits

Chrome’s [`windows.Window` API](https://developer.chrome.com/docs/extensions/reference/api/windows#type-Window) does **not** expose the names assigned through Chrome’s **Name window** command. The pencil beside a window title saves an independent Tabtastic label in `chrome.storage.session`. Labels survive new-tab page reloads but reset on a browser restart, extension reload, or extension update. Native Chrome window names cannot be imported or changed by this extension.

Only normal browser windows are managed. Incognito windows are visible only if Chrome grants the extension incognito access; moving between regular and incognito windows is disallowed. Split-view tabs are shown, but moving them or sorting a window containing them is blocked until they are separated in Chrome. Only open tab groups are shown, not closed/saved groups.

Sorting and moves are one-off actions, not ongoing auto-sort rules. If a tab closes or changes groups during an operation, the extension reports the error and refreshes its view. Chrome tab operations are not transactional, so moves completed before an error remain applied.

## Preview without installing

With Bun 1.3.14 or newer:

```sh
bun run dev
```

Open [the interactive preview](http://127.0.0.1:5173). It uses an isolated sample workspace with working search, sorting, duplicate highlighting, moving, labels, and closing. It never accesses your real Chrome tabs. Refreshing resets sample tabs. The actual extension detects Chrome’s APIs and uses live data instead.

## Verification

Install the development tools with `bun install --frozen-lockfile` first. The project uses Bun for package management, scripts, and unit tests; no separate Node.js installation is needed. `bun.lock` records the dependency versions.

Development scripts retain standard `node:` imports for filesystem, path, HTTP, and assertion APIs, which [Bun implements](https://bun.com/docs/runtime/nodejs-compat). ESLint and Prettier explicitly use `bun run --bun` so their executable shebangs do not fall back to Node.js. The extension itself still runs entirely in Chrome.

```sh
bun run check
bun run test
```

`bun run check` runs ESLint and Prettier. ESLint requires braces on every conditional and loop, multiline blocks, one statement per line, and spacing between functions. It also rejects nested ternaries and assignments returned from callbacks. Prettier handles indentation, wrapping, and consistent formatting across JavaScript, HTML, CSS, and JSON.

To clean up edited code:

```sh
bun run lint:fix
bun run format
```

Prefer small helpers named for their purpose, such as `filteredSegments`, `renderTabStatus`, and `validateMoveDestination`, when a function mixes separate responsibilities. Keep short, straightforward expressions inline. Generated bundles and browser-test artifacts are excluded from both tools.

The unit tests cover conservative URL matching, group-preserving sort order, drag insertion indices, search, the sample adapter, status caching, permission handling, and refresh concurrency.

The browser suite loads the unpacked extension into a fresh temporary Chrome profile and tests real APIs, group boundaries, cross-window moves, storage, and UI interactions. GitHub checks use intercepted HTML fixtures; a local HTTP server verifies that the fetch backend sends an existing HttpOnly/SameSite cookie. Tests cover current/legacy header chips, denied access, refresh without reloading or activating source tabs, failed refreshes, and narrow layouts. Because native permission prompts cannot be clicked in headless Chrome, granted-access checks use a temporary extension copy with GitHub and the local cookie fixture host pre-granted. Chrome 145 crashes when its headless driver calls `tabs.discard`, so the browser suite freezes a renderer instead; discarded snapshots are covered by unit tests. Run the preview server first, then install Playwright for development:

```sh
bun add --dev playwright
bunx --bun playwright install chromium
bun run test:browser
```

To use an existing Playwright/browser installation, set `PLAYWRIGHT_MODULE` to its module path and `CHROMIUM_EXECUTABLE` to the browser executable. The suite writes desktop, duplicate, and narrow-layout screenshots to `artifacts/`.

Set `EXTENSION_PATH=dist/tabtastic` when running `bun run test:browser` to test the generated bundle instead of the source folder. Automated tests always use a temporary profile; manual loading into your usual Chrome profile is what connects the extension to your real tabs.

## Permissions and privacy

- `tabs`: titles, URLs, and tab management.
- `tabGroups`: group names, colours, and collapse state.
- `storage`: window labels and page-status checks in session storage. The row-density and theme preferences use local storage.
- `favicon`: Chrome’s cached favicon endpoint. No external favicon service is used.
- Optional `https://github.com/*` access: read issue and PR status chips using authenticated page requests. Only requested when you enable statuses.

No required host permissions, content scripts, telemetry, or remote code. All extension code and assets are local. With GitHub access enabled, status checks send ordinary authenticated GET requests only to GitHub, with the browser supplying its existing session cookies; Tabtastic does not read or store credentials. The service worker fetches pages so Chrome does not follow their HTTP preload hints. Fetched HTML is parsed in an inert template and never displayed or executed. Only the URL, state, check times, and error information are cached. The service worker also handles the toolbar shortcut and cleanup of labels for closed windows.

## Source layout

- `index.html`, `styles.css`, `app.js`: new-tab UI and interactions.
- `lib/model.js`: pure search, duplicate, segmentation, and insertion logic.
- `lib/browser.js`: Chrome API adapter.
- `lib/demo.js`: in-memory preview adapter.
- `lib/providers/`: built-in page-status providers. GitHub owns URL matching, header parsing, state names, and access copy; register future providers in `index.js` and declare their optional origins in the manifest.
- `lib/page-status.js`: shared permissions, inert HTML parsing, session cache, and bounded refresh queue. Providers receive an inert HTML root and return a known state or `null`; no dynamic or remote plugin code is loaded.
- `lib/page-fetch.js`: authenticated HTML transport, run in the service worker to avoid HTTP preloads.
- `background.js`: validated status requests, toolbar action, and window-label cleanup.
- `scripts/serve.js`, `scripts/test-browser.js`, `tests/`: development preview and checks.
