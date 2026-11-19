# Usage Detector — Claude & ChatGPT

A small Manifest V3 browser extension that shows how much of your **Claude** and
**ChatGPT** usage limits you have left, without an account, an API key or a server.
It reads both sites in the background, so no tab has to be open.

Works in every Chromium browser — Chrome, Edge, Opera, Brave, Vivaldi, Arc.

![states](extension/icons/icon-128.png)

## Why it exists

Ask either site how much you have left and the answer is the same: usage is
*"up to our discretion."* There is no counter, no reset clock and no warning
before the wall. This extension measures it for you — it reads the numbers your
own signed-in account already returns and the meters the page already draws, and
keeps the countdown in your toolbar.

## What it does

- Detects whether the tab you are on is Claude or ChatGPT, names it in the panel
  and reads that tab on demand.
- Reads both sites in the background — no Claude or ChatGPT tab needs to be open.
- Reads the usage windows each site exposes for your plan — Claude's 5-hour
  session and weekly limits, ChatGPT's message caps — plus the reset countdown.
- Falls back to the meters and limit banners already visible on the page when an
  account API doesn't answer.
- Paints the percentage left on your tightest limit onto the toolbar badge and
  colours it green / amber / red.
- Keeps a seven-day history of your tightest limit and draws it as a sparkline in
  each card, so you can see how fast you are burning through a window.
- Sends a desktop notification the first time a limit drops below your alert
  threshold, and re-arms itself once that limit recovers.
- Warns in the popup before you run out: amber under your threshold (15% by
  default), red at the limit.
- Has a settings page: alert threshold, refresh interval, which limit the badge
  follows, and a light / dark / system panel theme.

## Install

1. Keep the `extension/` folder from this repository on your machine.
2. Open your browser's extensions page and enable **Developer mode**:
   - Chrome — `chrome://extensions`
   - Edge — `edge://extensions`
   - Opera — `opera://extensions`
   - Brave — `brave://extensions`
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin **Usage Detector** to the toolbar.

The panel fills in on its own within a minute of install, using the sign-in your
browser already holds. It refreshes on the interval from the settings page (five
minutes by default), on demand, and when a site tab becomes visible.

## How it reads usage

A background alarm wakes the worker on your refresh interval and asks both sites
for the same numbers their own settings screens show — with the cookies your
browser already holds, so no tab has to be open. `extension/readers.js` parses
whatever usage windows the responses contain.

When a site tab is open, a content script adds what the page itself renders. On
each page it:

1. asks the site detector (`extension/sites.js`) whether this tab really is the
   site the script is for, and stops if it isn't;
2. calls the same readers against the page's own endpoints;
3. if that fails, reads the percentages, accessible progress bars and limit
   banners rendered on the page instead.

The result is stored in `chrome.storage.local` and the badge is updated. Nothing
is sent to any third party, and the extension has no build step — the files in
`extension/` are what the browser loads.

The `alarms` permission wakes the background worker on your refresh interval, so
it can read the sites with no tab open. The `scripting` permission is used for
one thing: when you install or update the extension, tabs that already have
`claude.ai` or `chatgpt.com` open get the content script injected, so you don't
have to reload those sites before the panel fills in.

## Layout

```
extension/
  manifest.json        MV3 manifest: permissions, content scripts, popup, options
  sites.js             site detector: which tab is Claude or ChatGPT
  readers.js           account-API readers shared by the worker and the pages
  settings.js          alert threshold, refresh interval, badge focus, theme
  background.js        stores reports and history, alerts, paints the badge
  content/
    common.js          page scanning, reporting
    claude.js          Claude detection
    chatgpt.js         ChatGPT detection
  popup/
    popup.html/.css/.js  the toolbar panel, including the seven-day trend
  options/
    options.html/.css/.js  the settings page
  icons/               toolbar icons
preview/               standalone page that renders the real popup and settings
                       page, and audits the shipped files
```

Settings live in `chrome.storage.local` under `settings`; history is kept per
provider under `history:<provider>` as `{ t, used }` points, pruned to seven days.

`preview/` exists only so the popup can be seen in a normal browser tab; it is not
part of the extension. It ships no sample numbers — an empty panel there is the
same empty panel you get before the extension has read a site.

## Limits worth knowing

- The two sites' account endpoints are internal and undocumented, so they can
  change. The page-based fallback keeps the popup useful when they do, but it can
  only show what the site itself renders.
- API credit balances in Anthropic Console and OpenAI Platform are not covered —
  those need an API key, and this extension deliberately asks for none.
- Background reads rely on the sign-in cookies your browser holds for each site;
  if a browser blocks them, opening the site still fills the panel from the page.
- Numbers come from the last background read or the last tab that reported them.
