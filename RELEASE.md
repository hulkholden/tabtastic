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

## Release from a Git tag

The release workflow runs when a `v*` tag is pushed. It requires a stable `vMAJOR.MINOR.PATCH` tag matching both package.json and manifest.json, and the tagged commit must be on `main`. It installs the locked dependencies, runs lint, formatting and unit tests, builds the ZIP, and creates a GitHub release with generated notes and a versioned ZIP attachment. Browser tests remain a local pre-release check.

Merge the release changes (including the workflow) into `main` first, then:

```sh
git switch main
git pull --ff-only origin main
git tag -a v0.2.0 -m "Tabtastic 0.2.0"
git push origin v0.2.0
```

Download `tabtastic-v0.2.0.zip` from the resulting GitHub release for Chrome Web Store upload. The workflow uses the built-in GitHub token; no additional secret is required. It publishes a GitHub release only; Chrome Web Store submission is still manual. For future releases, update both version fields before tagging. Existing releases are not overwritten; a rerun after successful publication will fail at release creation.

## Chrome Web Store submission

1. Open the existing Tabtastic item in the Chrome Web Store Developer Dashboard.
2. Upload `dist/tabtastic.zip` as the new package and verify version 0.2.0.
3. Update the listing with the changes above and check that privacy disclosures describe optional GitHub status requests.
4. Submit for review when ready. Building this package does not submit or publish it.

Required permissions remain `tabs`, `tabGroups`, `storage`, and `favicon`. Optional `https://github.com/*` access lets Tabtastic fetch issue and pull-request pages using the browser's existing sign-in and read their status chips. Access is requested only when the user enables statuses. No GitHub token is required; Tabtastic does not read or store credentials. Status results are cached in session storage; theme and row-density preferences use local storage. There is no telemetry or remote code.

Window labels and cached GitHub statuses reset on extension update because they use session storage. Theme and row-density preferences persist.

Official guidance: [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare) and [Update your Chrome Web Store item](https://developer.chrome.com/docs/webstore/update).
