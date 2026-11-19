/* Renders the real extension panel and settings page in the stage, runs the
   shipped site detector on any URL, and audits the extension files.
   No sample usage numbers: the stage shows only what the extension itself holds. */

(() => {
  const frame = document.getElementById('stage-frame');
  const urlPill = document.getElementById('stage-url');
  const tabs = Array.from(document.querySelectorAll('[data-view]'));
  const versionChip = document.getElementById('version');

  const VIEWS = {
    popup: {
      src: '/extension/popup/popup.html',
      label: 'chrome-extension://…/popup.html',
      title: 'The real extension panel, rendered live',
    },
    options: {
      src: '/extension/options/options.html',
      label: 'chrome-extension://…/options.html',
      title: 'The real extension settings page, rendered live',
    },
  };

  /* Keep the frame as tall as the page inside it. The settings page stretches to
     100vh, so only resize when the content really differs from the frame. */
  const fit = () => {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return;
    const desired = Math.max(360, Math.min(960, doc.body.scrollHeight + 2));
    if (Math.abs(frame.clientHeight - desired) > 4) frame.style.height = `${desired}px`;
  };

  const watch = () => {
    fit();
    const doc = frame.contentDocument;
    if (!doc || !doc.body || typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(fit).observe(doc.body);
  };

  frame.addEventListener('load', watch);

  const show = (view) => {
    const next = VIEWS[view] ? view : 'popup';
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.view === next));
    if (urlPill) urlPill.textContent = VIEWS[next].label;
    frame.title = VIEWS[next].title;
    if (frame.getAttribute('src') !== VIEWS[next].src) frame.setAttribute('src', VIEWS[next].src);
  };

  for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.view));

  /* Site detector: the same module the extension ships, run on any URL. */
  const detector = document.getElementById('detector');
  const detectorUrl = document.getElementById('detector-url');
  const detectorOut = document.getElementById('detector-out');
  const sites = globalThis.UsageDetectorSites;

  const describe = (url) => {
    const site = sites ? sites.detect(url) : null;
    return site
      ? { on: true, text: `Detected ${site.name} on ${site.hostname} — the panel reads that tab.` }
      : { on: false, text: 'Not Claude or ChatGPT — the detector leaves the panel alone.' };
  };

  const runDetector = (url) => {
    if (!detectorOut) return;
    const result = describe(url);
    detectorOut.textContent = result.text;
    detectorOut.classList.toggle('is-on', result.on);
  };

  if (detectorOut) {
    const here = describe(location.href);
    detectorOut.textContent = here.on
      ? here.text
      : `This page (${location.hostname}) is not Claude or ChatGPT — the detector stays off.`;
  }

  if (detector) {
    detector.addEventListener('submit', (event) => {
      event.preventDefault();
      const url = detectorUrl.value.trim();
      if (url) runDetector(url);
    });

    for (const chip of document.querySelectorAll('.detector-chip[data-url]')) {
      chip.addEventListener('click', () => {
        detectorUrl.value = chip.dataset.url;
        runDetector(chip.dataset.url);
      });
    }
  }

  /* Extension audit: read the shipped manifest and the files it points at. */
  const list = document.getElementById('audit');
  const summary = document.getElementById('audit-summary');

  const dot = () => {
    const span = document.createElement('span');
    span.className = 'audit-dot';
    span.setAttribute('aria-hidden', 'true');
    return span;
  };

  const item = (ok, label, detail) => {
    const li = document.createElement('li');
    li.className = `audit-item ${ok ? 'is-ok' : 'is-bad'}`;
    li.append(dot());

    const name = document.createElement('span');
    name.className = 'audit-label';
    name.textContent = label;
    li.append(name);

    if (detail) {
      const meta = document.createElement('span');
      meta.className = 'audit-detail';
      meta.textContent = detail;
      li.append(meta);
    }

    list.append(li);
    return ok;
  };

  const exists = async (path) => {
    try {
      const response = await fetch(path, { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    } catch (_) {
      return false;
    }
  };

  const run = async () => {
    list.textContent = '';

    let manifest = null;
    try {
      const response = await fetch('/extension/manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`http ${response.status}`);
      manifest = await response.json();
    } catch (_) {
      item(false, 'manifest.json', 'not readable');
      summary.textContent = 'The extension folder could not be read from this preview.';
      return;
    }

    if (versionChip) versionChip.textContent = `v${manifest.version}`;

    const worker = manifest.background && manifest.background.service_worker;
    const popup = manifest.action && manifest.action.default_popup;
    const optionsPage = manifest.options_ui && manifest.options_ui.page;
    const permissions = manifest.permissions || [];
    const hosts = (manifest.host_permissions || []).map((host) => host.replace('https://', '').replace('/*', ''));
    const scripts = manifest.content_scripts || [];
    const icons = Object.keys(manifest.icons || {});

    const results = [
      item(manifest.manifest_version === 3, 'Manifest V3', `version ${manifest.version}`),
      item(Boolean(worker) && (await exists(`/extension/${worker}`)), 'Background worker', worker || 'missing'),
      item(Boolean(popup) && (await exists(`/extension/${popup}`)), 'Toolbar popup', popup || 'missing'),
      item(Boolean(optionsPage) && (await exists(`/extension/${optionsPage}`)), 'Settings page', optionsPage || 'missing'),
      item(permissions.includes('notifications'), 'Low-usage alerts', permissions.join(', ')),
      item(permissions.includes('alarms'), 'Background refresh', permissions.includes('alarms') ? 'alarms' : 'missing'),
      item(hosts.length > 0, 'Site access', hosts.join(', ') || 'none'),
      item(
        scripts.length === 2,
        'Content scripts',
        scripts
          .map((entry) => entry.matches.map((match) => match.replace('https://', '').replace('/*', '')).join(' + '))
          .join(' | ')
      ),
      item(await exists('/extension/sites.js'), 'Site detector', 'sites.js'),
      item(await exists('/extension/readers.js'), 'Usage readers', 'readers.js'),
      item(
        icons.length > 0 &&
          (await Promise.all(icons.map((size) => exists(`/extension/${manifest.icons[size]}`)))).every(Boolean),
        'Icons',
        icons.map((size) => `${size}px`).join(', ') || 'none'
      ),
    ];

    const passed = results.filter(Boolean).length;
    summary.textContent =
      passed === results.length
        ? `All ${results.length} checks passed — the folder is ready to load.`
        : `${passed} of ${results.length} checks passed.`;
  };

  run();
})();
