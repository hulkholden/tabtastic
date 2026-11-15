# Tabtastic privacy policy

Last updated: 15 November 2026

Tabtastic helps you find and organise your open Chrome tabs, windows, and tab groups. It does not collect or transmit user data to its developer. Tab information and preferences are processed and stored locally on your device. There are no analytics, advertising, or telemetry. Optional GitHub status checks communicate directly with GitHub.

## Information used on your device

Tabtastic accesses open-tab titles and URLs, window and tab-group information, and the window labels you enter. It uses this information to display and search your tabs, identify duplicates, sort tabs, and carry out the tab-management actions you request. Favicons come from Chrome's local cache. Tabtastic does not read Chrome's historical browsing database.

## Optional GitHub status checks

GitHub status checks require you to grant optional access to `https://github.com/*`. When enabled, Tabtastic makes HTTPS requests directly to GitHub for issue and pull-request pages associated with your open tabs. Checks run while a Tabtastic dashboard is open, including when you select **Refresh statuses**.

Chrome may include your existing GitHub authentication cookies with these requests. Tabtastic does not read or store those cookies, your password, or personal access tokens. GitHub receives the requested page address and ordinary connection information, such as your IP address, and may associate authenticated requests with your GitHub account.

The returned HTML may include private repository content that your account can access. Tabtastic processes it on your device to extract the issue or pull-request status. It does not execute scripts from the page or send the returned content to the developer. GitHub handles requests according to its [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Storage and retention

Window labels and cached GitHub status records are stored in Chrome's session storage. Status records include the relevant page URL, status, check times, and error information. Session data resets when the browser restarts or the extension is reloaded, disabled, or updated. Fetched page HTML is not saved in this cache.

Theme and row-density preferences are stored locally and persist across browser restarts. Removing the extension removes its extension storage.

## Sharing and use

Tabtastic does not sell user data or use it for advertising, credit decisions, or purposes unrelated to its tab-management features. The developer does not receive your tab data or GitHub page content. Optional GitHub status checks send requests directly to GitHub as described above.

Tabtastic's use of information received from Google APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data), including its Limited Use requirements.

## Your choices

You can use Tabtastic without enabling GitHub statuses. You can revoke GitHub access through Chrome's extension settings or remove Tabtastic at any time.

## Contact

For questions about this policy, use the [Tabtastic issue tracker](https://github.com/hulkholden/tabtastic/issues). Issues are public; do not include private browsing information, credentials, or private repository content.
