# Installation

## Windows localhost

1. Extract `SAHAJA-v1.0.0-Final.zip` into a folder you can write to. Open PowerShell in the extracted folder.
2. Ensure Node.js 22 or newer is on PATH. A user-local Node distribution with its directory on PATH also works.
3. Run `powershell -File .\setup.ps1`. The launcher binds to the loopback interface and opens [SAHAJA on localhost](http://localhost:8080/).
4. In Chrome or Edge, use the browser's app installation menu if offered. During the first online visit, let the shell finish caching. Reopen the page while the server is running so the worker can take control, then verify offline launch before stopping the server.

For upgrades, keep the exact same browser profile and origin, including the host and port. IndexedDB initializes from the old `sahaja` localStorage value on first successful startup. If you used a different address or opened the earlier version as a local file, export a backup there and import it from the new workspace. The previous localStorage value stays in place. If the migration warning persists due to malformed data, save the original localStorage value from browser developer tools before altering it, then validate a corrected copy through backup preview.

## Android or another device

Publish only the nine runtime files listed in `sw.js` to a static HTTPS host. For free GitHub Pages hosting, use a public repository, place the runtime files at the top of the publishing branch, and select that branch and its root in **Settings → Pages**. Enable **Enforce HTTPS** when the site is ready. [GitHub Pages publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [HTTPS settings](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

Open the published HTTPS URL in Chrome on Android and use the browser menu to install or add it to the home screen when offered. Service workers require a secure context. Windows loopback localhost qualifies. Ordinary LAN HTTP addresses do not. Use the launcher or HTTPS to open this release.

Each origin and browser profile has its own records. Transfer them through **Workspace → Export JSON**, followed by **Preview backup file** on the destination device. Synchronization is manual.
