# Usage Detector — Claude & ChatGPT

A small Manifest V3 browser extension that shows how much of your **Claude** and
**ChatGPT** usage limits you have left, without an account, an API key or a server.

Works in every Chromium browser — Chrome, Edge, Opera, Brave, Vivaldi, Arc.

![states](extension/icons/icon-128.png)

## What it does

- Reads the usage windows each site exposes for your plan — Claude's 5-hour
  session and weekly limits, ChatGPT's message caps — plus the reset countdown.
- Falls back to the meters and limit banners already visible on the page when an
  account API doesn't answer.
- Paints the percentage left on your tightest limit onto the toolbar badge and
  colours it green / amber / red.
- Warns in the popup before you run out: amber under 15% left, red at the limit.

## Install

1. Keep the `extension/` folder from this repository on your machine.
2. Open your browser's extensions page and enable **Developer mode**:
   - Chrome — `chrome://extensions`
   - Edge — `edge://extensions`
   - Opera — `opera://extensions`
   - Brave — `brave://extensions`
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin **Usage Detector** to the toolbar.

Then open `claude.ai` and `chatgpt.com` once while signed in. The popup fills in
after those tabs load, and refreshes on demand, when a tab becomes visible, and
every five minutes.

## How it reads usage

A content script runs on `claude.ai` and `chatgpt.com` in the extension's isolated
world. On each page it:

1. asks the site's own account endpoints (`/api/organizations/…/usage` on Claude,
   `/backend-api/conversation_limit` and the account check on ChatGPT) with the
   cookies the page already has;
2. parses whatever usage windows the response contains;
3. if that fails, reads the percentages, accessible progress bars and limit
   banners rendered on the page instead.

The result is stored in `chrome.storage.local` and the badge is updated. Nothing
is sent to any third party, and the extension has no build step — the files in
`extension/` are what the browser loads.

The `scripting` permission is used for one thing: when you install or update the
extension, tabs that already have `claude.ai` or `chatgpt.com` open get the
content script injected, so you don't have to reload those sites before the panel
fills in.

## Layout

```
extension/
  manifest.json        MV3 manifest: permissions, content scripts, popup
  background.js        stores reports, merges them, paints the badge
  content/
    common.js          shared parsing, page scanning, reporting
    claude.js          Claude detection
    chatgpt.js         ChatGPT detection
  popup/
    popup.html/.css/.js  the toolbar panel
  icons/               toolbar icons
preview/               standalone page that renders the real popup and audits the files
```

`preview/` exists only so the popup can be seen in a normal browser tab; it is not
part of the extension. It ships no sample numbers — an empty panel there is the
same empty panel you get before the extension has read a site.

## Limits worth knowing

- The two sites' account endpoints are internal and undocumented, so they can
  change. The page-based fallback keeps the popup useful when they do, but it can
  only show what the site itself renders.
- API credit balances in Anthropic Console and OpenAI Platform are not covered —
  those need an API key, and this extension deliberately asks for none.
- Numbers come from the tab that last reported them; a site you have not opened
  since installing stays empty until you visit it.
