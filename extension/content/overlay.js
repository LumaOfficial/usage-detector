/* Usage Detector — the widget drawn on the AI sites themselves.
   A shadow-root host, so the site's own styles never reach it and the widget
   never changes how the site looks. It reads the numbers the content script
   already reports, so it needs no requests of its own. */

(() => {
  const Sites = globalThis.UsageDetectorSites;
  const Settings = globalThis.UsageDetectorSettings;
  if (!Sites || !Settings) return;

  const site = Sites.detect(location.href);
  if (!site) return;

  const NS = (globalThis.__usageDetector = globalThis.__usageDetector || {});
  if (NS.overlayMounted || document.getElementById('usage-detector-widget')) return;
  NS.overlayMounted = true;

  const MINUTE = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;
  const MAX_ROWS = 4;

  const CSS = `
    .card {
      position: relative;
      width: 232px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background:
        linear-gradient(150deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.03) 60%),
        radial-gradient(120% 100% at 0% 0%, rgba(124, 92, 255, 0.32), transparent 62%),
        rgba(10, 10, 18, 0.93);
      color: #f2f4fb;
      font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(14px) saturate(140%);
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .card.is-light {
      border-color: rgba(22, 19, 31, 0.14);
      background:
        linear-gradient(150deg, rgba(255, 255, 255, 0.97), rgba(255, 255, 255, 0.87) 60%),
        radial-gradient(120% 100% at 0% 0%, rgba(124, 92, 255, 0.16), transparent 62%);
      color: #16131f;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 7px;
      width: 100%;
      padding: 8px 22px 8px 10px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .head:hover { background: rgba(124, 92, 255, 0.12); }
    .dot { flex: none; width: 7px; height: 7px; border-radius: 999px; background: #2fd4a5; box-shadow: 0 0 0 3px rgba(47, 212, 165, 0.16); }
    .dot.warn { background: #f0a63c; box-shadow: 0 0 0 3px rgba(240, 166, 60, 0.18); }
    .dot.bad { background: #ff5f6d; box-shadow: 0 0 0 3px rgba(255, 95, 109, 0.2); }
    .dot.idle { background: #788199; box-shadow: none; }
    .name { flex: 1; min-width: 0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.01em; }
    .pct { font-size: 11px; font-weight: 750; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .chev { flex: none; width: 11px; text-align: center; font-size: 11px; opacity: 0.65; transition: transform 0.16s ease; }
    .card.is-open .chev { transform: rotate(90deg); }
    .body { display: grid; gap: 7px; padding: 0 10px 9px; }
    .card:not(.is-open) .body { display: none; }
    .row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 7px; }
    .mark {
      width: 19px;
      height: 19px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      font-size: 7.5px;
      font-weight: 800;
      color: #0b0b14;
      background: linear-gradient(140deg, var(--accent, #7c5cff), rgba(255, 255, 255, 0.75));
    }
    .who { min-width: 0; display: grid; gap: 3px; }
    .label { font-size: 10px; opacity: 0.86; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { height: 3px; border-radius: 999px; background: rgba(255, 255, 255, 0.14); overflow: hidden; }
    .card.is-light .bar { background: rgba(22, 19, 31, 0.12); }
    .bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #1fae86, #4ce3b6); }
    .bar i.warn { background: linear-gradient(90deg, #d98a22, #ffc46b); }
    .bar i.bad { background: linear-gradient(90deg, #e2414f, #ff8a6b); }
    .val { font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .foot { padding-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 9.5px; opacity: 0.62; }
    .card.is-light .foot { border-color: rgba(22, 19, 31, 0.1); }
    .empty { font-size: 10px; opacity: 0.7; }
    .close {
      position: absolute;
      top: 3px;
      right: 3px;
      width: 16px;
      height: 16px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 5px;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 12px;
      line-height: 1;
      opacity: 0;
      cursor: pointer;
    }
    .card:hover .close { opacity: 0.6; }
    .close:hover { opacity: 1; background: rgba(124, 92, 255, 0.2); }
  `;

  let settings = null;
  let records = {};
  let expanded = null;
  let dismissed = false;
  let host = null;
  let shadow = null;

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };

  const until = (timestamp) => {
    const diff = timestamp - Date.now();
    if (diff <= 0) return 'any moment';
    if (diff < MINUTE) return 'under a minute';
    if (diff < HOUR) return `${Math.round(diff / MINUTE)} min`;
    if (diff < DAY) {
      const hours = Math.floor(diff / HOUR);
      const minutes = Math.round((diff % HOUR) / MINUTE);
      return minutes && hours < 6 ? `${hours} hr ${minutes} min` : `${hours} hr`;
    }
    return `${Math.round(diff / DAY)} days`;
  };

  const ago = (timestamp) => {
    const diff = Math.max(0, Date.now() - timestamp);
    if (diff < 45000) return 'just now';
    if (diff < HOUR) return `${Math.max(1, Math.round(diff / MINUTE))} min ago`;
    if (diff < DAY) return `${Math.round(diff / HOUR)} hr ago`;
    return `${Math.round(diff / DAY)} d ago`;
  };

  const tone = (remaining) => (remaining == null ? 'idle' : remaining <= 0 ? 'bad' : remaining <= 10 ? 'bad' : remaining <= 30 ? 'warn' : 'ok');

  /* The tightest window per provider, providers ordered tightest first. */
  const summary = () => {
    const enabled = settings ? settings.enabledSites : Sites.IDS;
    const rows = [];
    for (const provider of Sites.SITES) {
      if (!enabled.includes(provider.id)) continue;
      const record = records[provider.id];
      if (!record || !Array.isArray(record.windows)) continue;
      let best = null;
      for (const window of record.windows) {
        if (typeof window.remainingPercent !== 'number') continue;
        if (!best || window.remainingPercent < best.remainingPercent) best = window;
      }
      if (!best) continue;
      rows.push({ provider, record, window: best, remaining: best.remainingPercent });
    }
    rows.sort((a, b) => a.remaining - b.remaining);
    return rows;
  };

  const build = () => {
    host = document.createElement('div');
    host.id = 'usage-detector-widget';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.append(style);
    (document.body || document.documentElement).appendChild(host);
  };

  const place = (position) => {
    host.style.cssText = 'all: initial; display: block; position: fixed; z-index: 2147483000;';
    const offset = '18px';
    if (position === 'top-left') host.style.cssText += `top: ${offset}; left: ${offset};`;
    else if (position === 'top-right') host.style.cssText += `top: ${offset}; right: ${offset};`;
    else if (position === 'bottom-left') host.style.cssText += `bottom: ${offset}; left: ${offset};`;
    else host.style.cssText += `bottom: ${offset}; right: ${offset};`;
  };

  const render = () => {
    if (!host || !shadow) return;
    const enabled = settings && settings.overlayEnabled && !dismissed;
    host.style.display = enabled ? 'block' : 'none';
    if (!enabled) return;

    place(settings.overlayPosition);
    if (expanded === null) expanded = !settings.overlayCompact;

    const rows = summary();
    const tightest = rows[0] || null;
    const resolved =
      settings.theme === 'auto'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : settings.theme;

    const card = node('div', `card${expanded ? ' is-open' : ''}${resolved === 'light' ? ' is-light' : ''}`);

    const head = node('button', 'head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(expanded));
    head.setAttribute('aria-label', 'Usage Detector');
    head.append(node('span', `dot ${tone(tightest && tightest.remaining)}`));
    head.append(node('span', 'name', 'Usage Detector'));
    head.append(node('span', 'pct', tightest ? `${Math.max(0, Math.round(tightest.remaining))}% left` : 'no data'));
    head.append(node('span', 'chev', '›'));
    card.append(head);

    const close = node('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Hide for this page');
    card.append(close);

    const body = node('div', 'body');
    if (rows.length) {
      for (const entry of rows.slice(0, MAX_ROWS)) {
        const row = node('div', 'row');
        const mark = node('span', 'mark', entry.provider.mark);
        mark.style.setProperty('--accent', entry.provider.accent);
        row.append(mark);

        const who = node('span', 'who');
        who.append(node('span', 'label', `${entry.provider.name} · ${entry.window.label || 'Usage'}`));
        const bar = node('span', 'bar');
        const fill = node('i', tone(entry.remaining) === 'ok' ? null : tone(entry.remaining));
        fill.style.width = `${Math.min(100, Math.max(0, entry.remaining))}%`;
        bar.append(fill);
        who.append(bar);
        row.append(who);

        row.append(node('span', 'val', `${Math.max(0, Math.round(entry.remaining))}%`));
        body.append(row);
      }

      const foot = [];
      if (tightest && tightest.window.resetsAt) foot.push(`Resets in ${until(tightest.window.resetsAt)}`);
      if (tightest && tightest.record.detectedAt) foot.push(`checked ${ago(tightest.record.detectedAt)}`);
      if (foot.length) body.append(node('div', 'foot', foot.join(' · ')));
    } else {
      body.append(node('div', 'empty', `Waiting for the first read on ${site.hostName}.`));
    }
    card.append(body);

    shadow.querySelectorAll('.card').forEach((element) => element.remove());
    shadow.append(card);
  };

  const read = async () => {
    settings = await Settings.get();
    records = {};
    const enabled = settings.enabledSites;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const keys = enabled.map((id) => `usage:${id}`);
      const stored = await chrome.storage.local.get(keys);
      for (const id of enabled) records[id] = stored[`usage:${id}`] || null;
    }
    render();
  };

  build();
  read().catch(() => {});

  setInterval(() => read().catch(() => {}), 30000);

  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const touched = Object.keys(changes);
        if (touched.some((key) => key.startsWith('usage:') || key === 'settings')) read().catch(() => {});
      });
    }
  } catch (_) {
    /* storage unavailable — the interval still keeps it fresh */
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') read().catch(() => {});
  });

  shadow.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.close')) {
      dismissed = true;
      render();
      return;
    }
    if (target.closest('.head')) {
      expanded = !expanded;
      render();
    }
  });
})();
