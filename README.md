# Usage Detector — AI Limits

A small Manifest V3 browser extension that shows how much of your **AI usage
limits** you have left — Claude, ChatGPT, Gemini, Copilot, Perplexity, Grok,
DeepSeek, Mistral, Poe, Meta AI, Qwen, Kimi, You.com, HuggingChat and Pi, plus
third-party assistants like Sider, Monica, Merlin, MaxAI, Harpa and ChatHub, and
thirty more — coding agents, API consoles and image, audio and video tools —
without an account, an API key or a server.
It reads the sites you are signed in to, in the background, and can draw a small
usage widget on the sites themselves.

Works in every Chromium browser — Chrome, Edge, Opera, Brave, Vivaldi, Arc.

![states](extension/icons/icon-128.png)

## Why it exists

Ask any AI site how much you have left and the answer is the same: usage is
*"up to our discretion."* There is no counter, no reset clock and no warning
before the wall. This extension measures it for you — it reads the numbers your
own signed-in account already returns and the meters the page already draws, and
keeps the countdown in your toolbar.

## What it does

- Detects which supported AI site the tab you are on is, names it in the panel
  and reads that tab on demand.
- Covers fifty-one sites: Claude, ChatGPT, Gemini, Copilot, Perplexity, Grok,
  DeepSeek, Mistral, Poe, Meta AI, Qwen, Kimi, Base 1, You.com, HuggingChat, Pi,
  Sider, Monica, Merlin, MaxAI, Harpa and ChatHub, plus T3 Chat, Duck.ai, Lumo,
  Reka, Genspark, Felo, Character.AI, Venice AI, Phind, OpenRouter, Groq,
  AI Studio, OpenAI Platform, Anthropic Console, fal.ai, Cursor, Windsurf, v0,
  Bolt, Lovable, Devin, Midjourney, Suno, ElevenLabs, Leonardo AI, Ideogram,
  Runway, Krea and Replicate.
- Reads Claude and ChatGPT in the background — no tab needs to be open. The other
  forty-nine sites are read from their page when you have one open.
- Reads the usage windows each site exposes for your plan — Claude's 5-hour
  session and weekly limits, ChatGPT's message caps — plus the reset countdown.
- Falls back to the meters and limit banners already visible on the page.
- Draws a **usage widget on the AI sites themselves**: a small shadow-DOM card in
  the corner with your tightest limits, resets and last check, styled to match
  the panel and hidden from the site's own CSS.
- Paints the percentage left on your tightest limit onto the toolbar badge and
  colours it green / amber / red.
- Keeps a history of your tightest limit (seven days by default, up to thirty)
  and draws it as a sparkline in each site's details.
- Sends a desktop notification the first time a limit drops below your alert
  threshold, re-arms itself once that limit recovers, and can repeat the
  reminder, stay silent, ping you when a limit resets, or hold everything during
  quiet hours.
- Exports everything it stored as JSON, clears the trend history, and resets
  every setting from the settings page.

## Settings

The settings page saves as you change a control:

| Setting | What it does |
| --- | --- |
| Low-usage alerts | Threshold for the amber pill and the notification |
| Desktop notifications | Turn the notification off while keeping the panel and badge |
| Silent notifications | Alert without the system sound |
| Repeat the reminder | Remind again while a limit stays low |
| Notify when a limit resets | Ping when a used-up limit refills |
| Quiet hours | Pause notifications between two times; the count keeps running |
| Refresh interval | How often the sites are checked |
| Background checks | Poll on the timer with no tab open |
| Refresh when a tab wakes | Re-read a site when you switch back to it |
| Keep history | Store the trend points the sparkline is drawn from |
| History length | 3, 7, 14 or 30 days before old points are pruned |
| Trend sparkline | Show or hide the sparkline |
| Toolbar badge | Tightest limit, or any single site |
| Badge style | Percentage, coloured dot or hidden |
| Only sites with numbers | Hide the idle sites in the panel |
| Panel theme | System, light or dark — panel, settings and on-page widget |
| Widget on the AI sites | Turn the on-page widget on or off |
| Widget corner | Bottom right, bottom left, top right or top left |
| Start the widget collapsed | Show only the percentage until clicked |
| Widget rows | How many limits the open widget lists |
| Sites to track | Which of the supported sites the panel, badge and widget count |
| Export / Clear history / Reset | Download everything stored, wipe the trend, restore defaults |

Settings live in `chrome.storage.local` under `settings`.

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

A background alarm wakes the worker on your refresh interval and asks the sites
that expose an account API — Claude and ChatGPT — for the same numbers their own
settings screens show, with the cookies your browser already holds, so no tab has
to be open. `extension/readers.js` parses whatever usage windows the responses
contain.

When a site tab is open, a content script adds what the page itself renders. On
each page it:

1. asks the site detector (`extension/sites.js`) whether this tab really is the
   site the script is for, and stops if it isn't;
2. for Claude and ChatGPT, calls the same readers against the page's own
   endpoints; for every other site it reads the accessible meters, percentages,
   "3 of 20 messages" counters and limit banners the page renders
   (`content/generic.js` + `NS.genericPage`);
3. reports the result, which the worker stores in `chrome.storage.local` and
   turns into the badge, the history and the alerts.

The on-page widget (`content/overlay.js`) then renders those stored numbers in a
shadow root, so the site's styles can't reach it and it can't change the site.
Nothing is sent to any third party, and the extension has no build step — the
files in `extension/` are what the browser loads.

The `alarms` permission wakes the background worker on your refresh interval. The
`scripting` permission is used for one thing: when you install or update the
extension, tabs that already have a supported site open get the content script
injected, so you don't have to reload those sites before the panel fills in.

## Layout

```
extension/
  manifest.json        MV3 manifest: permissions, content scripts, popup, options
  sites.js             site detector: every supported AI site, its hosts and accent
  readers.js           account-API readers shared by the worker and the pages
  settings.js          alerts, refresh, badge focus, theme, sites, widget
  background.js        stores reports and history, alerts, paints the badge
  content/
    common.js          page scanning, generic page reader, reporting
    claude.js          Claude detection (account API + page)
    chatgpt.js         ChatGPT detection (account API + page)
    generic.js         every other site, read from the page
    overlay.js         the usage widget drawn on the sites themselves
  popup/
    popup.html/.css/.js  the toolbar panel: overview, site rows, details
  options/
    options.html/.css/.js  the settings page
  icons/               toolbar icons
preview/               standalone page that shows the real panel and settings
                       page at their natural size, so they can be seen without
                       loading the extension
```

History is kept per provider under `history:<provider>` as `{ t, used }` points,
pruned to the history length setting (seven days by default).

`preview/` exists only so the extension's own pages can be seen in a normal
browser tab; it is not part of the extension. It ships no sample numbers — an
empty panel there is the same empty panel you get before the extension has read a
site.

## Limits worth knowing

- Only Claude and ChatGPT expose an account endpoint this extension can read in
  the background. The other forty-nine sites are read from their page while one
  is open; their numbers are as good as what they render.
- The sites' account endpoints are internal and undocumented, so they can change.
  The page-based fallback keeps the panel useful when they do.
- API credit balances (OpenAI Platform, Anthropic Console, OpenRouter, Groq,
  fal.ai, Replicate) are read from the billing pages while you are signed in to
  them; the extension still never asks for an API key.
- Numbers come from the last background read or the last tab that reported them.
