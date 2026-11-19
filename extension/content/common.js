/* Usage Detector — shared helpers for content scripts.
   Runs in the extension's isolated world, so the page can't read or change it.
   The parsing helpers live in readers.js, shared with the background worker. */

(() => {
  const NS = (globalThis.__usageDetector = globalThis.__usageDetector || {});
  const Readers = globalThis.UsageDetectorReaders;

  NS.clamp = Readers.clamp;
  NS.round1 = Readers.round1;
  NS.number = Readers.number;
  NS.toEpoch = Readers.toEpoch;
  NS.resetFromText = Readers.resetFromText;
  NS.extractWindows = Readers.extractWindows;
  NS.findValue = Readers.findValue;
  NS.statusFor = Readers.statusFor;

  NS.send = (provider, payload) => {
    try {
      chrome.runtime.sendMessage({ type: 'usage:report', provider, payload }, () => void chrome.runtime.lastError);
    } catch (_) {
      /* extension was reloaded while the page stayed open */
    }
  };

  NS.onRefresh = (run) => {
    try {
      chrome.runtime.onMessage.addListener((message, _sender, reply) => {
        if (!message || message.type !== 'usage:refresh') return undefined;
        Promise.resolve()
          .then(run)
          .then(() => reply({ ok: true }))
          .catch(() => reply({ ok: false }));
        return true;
      });
    } catch (_) {
      /* no messaging available */
    }
  };

  NS.pageText = () => (document.body ? document.body.innerText : '') || '';

  NS.fetchJson = async (url) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (response.status === 401 || response.status === 403) {
      const error = new Error('signed-out');
      error.code = response.status;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`http-${response.status}`);
      error.code = response.status;
      throw error;
    }
    return response.json();
  };

  const nearbyLabel = (node) => {
    let sibling = node.previousElementSibling;
    while (sibling && !sibling.textContent.trim()) sibling = sibling.previousElementSibling;
    if (sibling) return sibling.textContent.trim().split('\n')[0];
    const parent = node.parentElement;
    if (parent) {
      const line = (parent.innerText || '')
        .split('\n')
        .map((part) => part.trim())
        .find(Boolean);
      if (line) return line;
    }
    return null;
  };

  /* Visible meters a site renders as accessible progress bars. */
  NS.progressBars = () => {
    const out = [];
    for (const node of document.querySelectorAll('[role="progressbar"]')) {
      const now = NS.number(node.getAttribute('aria-valuenow'));
      if (now == null) continue;
      const max = NS.number(node.getAttribute('aria-valuemax'));
      const used = max && max !== 100 ? (now / max) * 100 : now;
      const label = (node.getAttribute('aria-label') || nearbyLabel(node) || 'Usage').slice(0, 48);
      const usedPercent = NS.round1(NS.clamp(used, 0, 100));
      out.push({
        id: `bar-${out.length}`,
        label,
        usedPercent,
        remainingPercent: NS.round1(100 - usedPercent),
        resetsAt: null,
      });
    }
    return out;
  };

  /* Ask the account API, fall back to what the page shows, then report. */
  NS.detect = async ({ provider, api, page }) => {
    let apiResult = null;
    try {
      apiResult = api ? await api() : { windows: [], notes: [], plan: null };
    } catch (error) {
      if (error && (error.code === 401 || error.code === 403)) {
        NS.send(provider, {
          status: 'signed-out',
          windows: [],
          plan: null,
          notes: ['Sign in to read your usage.'],
          source: 'api',
          detectedAt: Date.now(),
        });
        return;
      }
      apiResult = {
        windows: [],
        notes: ['Could not read the account API — showing what the page displays.'],
        plan: null,
      };
    }

    const pageResult = page ? page() : { windows: [], notes: [], plan: null };
    const fromApi = Boolean(apiResult && apiResult.windows && apiResult.windows.length);
    const windows = fromApi ? apiResult.windows : pageResult.windows || [];
    const notes = [...(apiResult && apiResult.notes ? apiResult.notes : []), ...(fromApi ? [] : pageResult.notes || [])];
    const status = windows.length ? NS.statusFor(windows, 'ok') : 'unknown';

    NS.send(provider, {
      status,
      windows,
      plan: (apiResult && apiResult.plan) || pageResult.plan || null,
      notes: [...new Set(notes.filter(Boolean))].slice(0, 3),
      source: fromApi ? 'api' : windows.length ? 'page' : 'none',
      url: location.href,
      detectedAt: Date.now(),
    });
  };

  /* What the page itself says about usage, for the sites without an account
     API: accessible meters, "42% used" copy, "3 of 20 messages" counters and
     limit banners. */
  NS.genericPage = () => {
    const text = NS.pageText();
    const windows = NS.progressBars();
    const notes = [];
    const resetsAt = NS.resetFromText(text);

    const percentLine = /([^\n]{0,40}?)(\d{1,3}(?:\.\d+)?)\s*%\s*(?:used|of (?:your )?(?:limit|usage|quota))/i.exec(text);
    if (percentLine) {
      const used = NS.clamp(Number(percentLine[2]), 0, 100);
      windows.unshift({
        id: 'page-usage',
        label: percentLine[1].trim().slice(0, 40) || 'Usage',
        usedPercent: NS.round1(used),
        remainingPercent: NS.round1(100 - used),
        resetsAt,
      });
    }

    const pair = /(\d{1,4})\s*(?:of|\/)\s*(\d{1,4})\s+(?:messages|prompts|credits|requests|queries|generations)/i.exec(text);
    if (pair) {
      const usedCount = Number(pair[1]);
      const limit = Number(pair[2]);
      if (limit > 0 && usedCount <= limit) {
        const used = NS.round1(NS.clamp((usedCount / limit) * 100, 0, 100));
        windows.unshift({
          id: 'page-quota',
          label: 'Quota',
          usedPercent: used,
          remainingPercent: NS.round1(100 - used),
          resetsAt,
        });
      }
    }

    const left = /(\d{1,4})\s+(?:messages|prompts|credits|requests|queries|generations)\s+(?:left|remaining)/i.exec(text);
    if (left && !windows.length) {
      windows.push({
        id: 'page-left',
        label: 'Left',
        usedPercent: null,
        remainingPercent: null,
        detail: `${left[1]} left`,
        resetsAt,
      });
    }

    const limited =
      /(?:reached|hit)\s+(?:your|the)\s+[^\n.]{0,32}?(?:limit|cap)|limit reached|out of (?:messages|credits|prompts)/i.test(
        text
      );
    if (limited && !windows.some((window) => window.usedPercent === 100)) {
      windows.unshift({
        id: 'page-limit',
        label: 'Limit',
        usedPercent: 100,
        remainingPercent: 0,
        resetsAt,
      });
    }

    if (!windows.length) notes.push('Open a chat and send a message, then refresh.');
    return { windows, notes, plan: null };
  };

  /* Starts page detection once per provider, even when the script is injected twice. */
  NS.start = (provider, run) => {
    // The detector decides whether this tab really is the site this script is for.
    const sites = globalThis.UsageDetectorSites;
    const site = sites ? sites.detect(location.href) : null;
    if (!site || site.id !== provider) return;

    NS.started = NS.started || {};
    if (NS.started[provider]) return;
    NS.started[provider] = true;

    const DEFAULT_MINUTES = 5;
    const MIN_GAP_MS = 10000;
    let timer = null;
    let lastRun = 0;
    let refreshOnFocus = true;

    /* The timer, a tab focus and the popup's refresh can all fire at once;
       keep them from hammering the site's own API. */
    const safeRun = () => {
      const now = Date.now();
      if (now - lastRun < MIN_GAP_MS) return Promise.resolve();
      lastRun = now;
      return Promise.resolve().then(run).catch(() => {});
    };

    /* The refresh interval comes from the settings page. */
    const schedule = (minutes) => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') safeRun();
      }, minutes * 60 * 1000);
    };

    setTimeout(safeRun, 1200);
    schedule(DEFAULT_MINUTES);

    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local
          .get('settings')
          .then((stored) => {
            const settings = (stored && stored.settings) || {};
            const minutes = Number(settings.refreshMinutes);
            if (Number.isFinite(minutes) && minutes > 0) schedule(minutes);
            refreshOnFocus = settings.refreshOnFocus !== false;
          })
          .catch(() => {});
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local' || !changes.settings) return;
          const settings = changes.settings.newValue || {};
          const minutes = Number(settings.refreshMinutes);
          if (Number.isFinite(minutes) && minutes > 0) schedule(minutes);
          refreshOnFocus = settings.refreshOnFocus !== false;
        });
      }
    } catch (_) {
      /* storage unavailable — keep the default cadence */
    }
    document.addEventListener('visibilitychange', () => {
      if (refreshOnFocus && document.visibilityState === 'visible') safeRun();
    });
    NS.onRefresh(safeRun);
  };
})();
