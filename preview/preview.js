/* Renders the real extension popup and audits the shipped extension files.
   No sample usage numbers: the panel shows only what the extension itself holds. */

(() => {
  const frame = document.getElementById('popup');
  const list = document.getElementById('audit');
  const summary = document.getElementById('audit-summary');

  // Keep the frame exactly as tall as the panel inside it.
  const fit = () => {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return;
    frame.style.height = `${Math.max(320, Math.min(640, doc.body.scrollHeight + 2))}px`;
  };

  frame.addEventListener('load', () => {
    fit();
    const doc = frame.contentDocument;
    if (!doc || typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(fit).observe(doc.body);
  });

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

    const worker = manifest.background && manifest.background.service_worker;
    const popup = manifest.action && manifest.action.default_popup;
    const hosts = (manifest.host_permissions || []).map((host) => host.replace('https://', '').replace('/*', ''));
    const scripts = manifest.content_scripts || [];
    const icons = Object.keys(manifest.icons || {});

    const results = [
      item(manifest.manifest_version === 3, 'Manifest V3', `version ${manifest.version}`),
      item(Boolean(worker) && (await exists(`/extension/${worker}`)), 'Background worker', worker || 'missing'),
      item(Boolean(popup) && (await exists(`/extension/${popup}`)), 'Toolbar popup', popup || 'missing'),
      item(hosts.length > 0, 'Site access', hosts.join(', ') || 'none'),
      item(
        scripts.length === 2,
        'Content scripts',
        scripts
          .map((entry) => entry.matches.map((match) => match.replace('https://', '').replace('/*', '')).join(' + '))
          .join(' | ')
      ),
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
