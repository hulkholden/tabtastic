# Tabtastic 0.2.0

Prepared from `main` at `ff31ba9` (Add dark mode with system-aware theme controls).

## What's new

- Choose Light, Dark, or System appearance. Your preference is saved and stays in sync across new tabs.
- See GitHub issue and pull-request statuses using your existing GitHub sign-in, with optional access enabled from the GitHub view. Find closed and merged work, and refresh statuses without reloading your tabs.
- Improved window layout removes gaps between cards of different heights.
- Tab controls stay stable while statuses refresh.
- GitHub status checks avoid unnecessary preload requests.

## Build and verify

```sh
bun install --frozen-lockfile
bun run check
bun run test
bun run build
```

Run the preview server with `bun run dev`, then run `EXTENSION_PATH=dist/tabtastic bun run test:browser` in another terminal. See README.md for Playwright setup or the `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` overrides.

The store package is `dist/tabtastic.zip`. It contains the complete extension with `manifest.json` at the ZIP root. Both package.json and manifest.json declare version 0.2.0. The unpacked equivalent is `dist/tabtastic/`.

## Chrome Web Store submission

1. Open the existing Tabtastic item in the Chrome Web Store Developer Dashboard.
2. Upload `dist/tabtastic.zip` as the new package and verify version 0.2.0.
3. Update the listing with the changes above and check that privacy disclosures describe optional GitHub status requests.
4. Submit for review when ready. Building this package does not submit or publish it.

Required permissions remain `tabs`, `tabGroups`, `storage`, and `favicon`. Optional `https://github.com/*` access lets Tabtastic fetch issue and pull-request pages using the browser's existing sign-in and read their status chips. Access is requested only when the user enables statuses. No GitHub token is required; Tabtastic does not read or store credentials. Status results are cached in session storage; theme and row-density preferences use local storage. There is no telemetry or remote code.

Window labels and cached GitHub statuses reset on extension update because they use session storage. Theme and row-density preferences persist.

Official guidance: [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare) and [Update your Chrome Web Store item](https://developer.chrome.com/docs/webstore/update).
