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
npm run build
```

This creates `dist/tabtastic/` with only the extension’s runtime files and `dist/tabtastic.zip` for sharing or archiving (the ZIP requires the `zip` command, included on macOS).

In your usual Chrome profile, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose `dist/tabtastic/`. Select the folder containing `manifest.json`, not the ZIP. Then open a new tab. Unlike the localhost preview, this uses your real tabs, windows, and groups. Sorting and dragging change your real Chrome tab strip.

After edits, run `npm run build` again, click **Reload** on Tabtastic’s extension card, and refresh the new-tab page. Keep the bundle folder in place while the extension is installed. Disable Tabtastic in `chrome://extensions` to stop using it, and re-enable Favitabs if desired.

## What it does

- Mirrors normal Chrome windows, pinned tabs, group names, colours, collapsed state, and tab order. Updates as Chrome changes.
- Switches to a tab and focuses its window when you click it.
- **Title A–Z** and **URL A–Z** reorder Chrome’s actual tabs. They sort each group, the pinned section, and each contiguous ungrouped section separately. Group positions stay intact. Choose a window in the sidebar to sort just that window. Sorting is disabled during search or duplicate filtering, so hidden results cannot be silently reordered.
- **Find duplicates** highlights all tabs sharing a full URL across windows. **Duplicates** in the sidebar shows only those tabs, keeping their window and group context. Counts include every matching tab, including the first copy. Query strings and fragments remain significant; browser utility pages are excluded. Nothing is automatically closed.
- Drag a row above or below another tab to reorder it. Drag onto a group heading to append to that group, or onto a window’s bottom drop area to move there without a group. This changes Chrome itself. Pinned tabs can move only to another pinned section; the row’s **Move** button also supports moving them into windows without existing pinned tabs.
- The row’s **Move** button is a keyboard-accessible alternative to dragging. The **Close** button closes that one tab; use Chrome’s Reopen closed tab command to restore it.
- Search titles, URLs, group names, and Tabtastic window labels. `/` or `⌘/Ctrl K` focuses search, `Enter` switches to the first result, and `Escape` clears search. Search and duplicate highlighting temporarily reveal collapsed groups without changing their saved collapsed state.
- Compact rows, local favicons, current-window indicators, and audio indicators.

### Window names and other limits

Chrome’s [`windows.Window` API](https://developer.chrome.com/docs/extensions/reference/api/windows#type-Window) does **not** expose the names assigned through Chrome’s **Name window** command. The pencil beside a window title saves an independent Tabtastic label in `chrome.storage.session`. Labels survive new-tab page reloads but reset on a browser restart, extension reload, or extension update. Native Chrome window names cannot be imported or changed by this extension.

Only normal browser windows are managed. Incognito windows are visible only if Chrome grants the extension incognito access; moving between regular and incognito windows is disallowed. Split-view tabs are shown, but moving them or sorting a window containing them is blocked until they are separated in Chrome. Only open tab groups are shown, not closed/saved groups.

Sorting and moves are one-off actions, not ongoing auto-sort rules. If a tab closes or changes groups during an operation, the extension reports the error and refreshes its view. Chrome tab operations are not transactional, so moves completed before an error remain applied.

## Preview without installing

With Node.js 20 or newer:

```sh
npm run dev
```

Open [the interactive preview](http://127.0.0.1:5173). It uses an isolated sample workspace with working search, sorting, duplicate highlighting, moving, labels, and closing. It never accesses your real Chrome tabs. Refreshing resets sample tabs. The actual extension detects Chrome’s APIs and uses live data instead.

## Verification

```sh
npm run check
npm test
```

The unit tests cover conservative URL matching, group-preserving sort order, drag insertion indices, search, and the sample adapter.

The browser suite loads the unpacked extension into a fresh temporary Chrome profile and tests real APIs, group boundaries, cross-window moves, storage, and UI interactions. Run the preview server first, then install Playwright for development:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
```

To use an existing Playwright/browser installation, set `PLAYWRIGHT_MODULE` to its module path and `CHROMIUM_EXECUTABLE` to the browser executable. The suite writes desktop, duplicate, and narrow-layout screenshots to `artifacts/`.

Set `EXTENSION_PATH=dist/tabtastic` when running `npm run test:browser` to test the generated bundle instead of the source folder. Automated tests always use a temporary profile; manual loading into your usual Chrome profile is what connects the extension to your real tabs.

## Permissions and privacy

- `tabs`: titles, URLs, and tab management.
- `tabGroups`: group names, colours, and collapse state.
- `storage`: window labels in session storage. The row-density preference uses local storage.
- `favicon`: Chrome’s cached favicon endpoint. No external favicon service is used.

No host permissions, content scripts, telemetry, remote code, or external data transmission. All extension code and assets are local. The service worker handles only the toolbar shortcut and cleanup of labels for closed windows.

## Source layout

- `index.html`, `styles.css`, `app.js`: new-tab UI and interactions.
- `lib/model.js`: pure search, duplicate, segmentation, and insertion logic.
- `lib/browser.js`: Chrome API adapter.
- `lib/demo.js`: in-memory preview adapter.
- `background.js`: toolbar action and window-label cleanup.
- `scripts/serve.js`, `scripts/test-browser.js`, `tests/`: development preview and checks.
