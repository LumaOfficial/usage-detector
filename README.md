# Usage Detector

A Manifest V3 Chrome extension that shows how much time you spend on each site. Everything runs and stays on your device.

## One package, no external server

The whole app lives in `extension/` — the client pages and the background "server" are all files inside the extension:

```
extension/
├── manifest.json              Manifest V3
├── background/
│   └── service-worker.js      tab tracking, storage, message API
├── lib/
│   ├── usage.js               pure domain and time helpers
│   └── store.js               chrome.storage read/write + validation
├── shared/
│   ├── api.js                 client bridge to the service worker
│   ├── demo.js                local sample data for the browser preview
│   ├── defaults.js
│   └── theme.css
├── popup/                     toolbar client
├── options/                   settings client
└── icons/
```

- No backend, no build step, no bundler.
- No remote code: every script is a local file and the MV3 CSP is `script-src 'self'`.
- No `host_permissions` and no network requests; data stays in `chrome.storage.local`.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → choose the `extension/` folder

## Package for upload

```
scripts/package-extension.sh
```

Writes `dist/usage-detector-<version>.zip` containing exactly the `extension/` folder. That is the same package you load unpacked and the same file you upload to the Chrome Web Store.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | save settings and daily totals locally |
| `tabs` | read the active tab's URL to attribute time |
| `idle` | stop counting when you are away |
| `alarms` | one-minute accounting tick |

## Manifest V3 specifics

- background is `background.service_worker` with `type: "module"` — never a background page
- pages are plain HTML with external ES modules; no inline scripts and no inline event handlers
- CSP uses the MV3 object form and allows only `'self'`
- settings use `options_ui`, the toolbar button uses `action.default_popup`
- `chrome.storage.session` keeps the live tracker state across service-worker restarts
- the service worker answers `chrome.runtime` messages; the popup and settings pages never touch storage directly

## Preview

`preview/index.html` audits the package and embeds the real popup and settings pages. Outside a Chrome extension host the pages fall back to `shared/demo.js`, so the preview stays interactive with sample data.
