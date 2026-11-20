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

  /* Every meter a site draws: accessible progress bars and meters, native
     <progress>/<meter> elements, and any element that exposes aria-valuenow. */
  const meterPercent = (node) => {
    let now = NS.number(node.getAttribute('aria-valuenow'));
    let max = NS.number(node.getAttribute('aria-valuemax'));
    if (now == null && 'value' in node) now = NS.number(node.value);
    if (max == null && 'max' in node) max = NS.number(node.max);
    if (now == null || now < 0) return null;
    if (!max || max <= 0) max = 100;
    return NS.clamp((now / max) * 100, 0, 100);
  };

  NS.pageMeters = () => {
    const out = [];
    const seen = new Set();
    const nodes = document.querySelectorAll('[role="progressbar"], [role="meter"], progress, meter, [aria-valuenow]');
    for (const node of nodes) {
      const used = meterPercent(node);
      if (used == null) continue;
      const labelledBy = node.getAttribute('aria-labelledby');
      const labelled = labelledBy ? document.getElementById(labelledBy) : null;
      const label = (
        node.getAttribute('aria-label') ||
        (labelled && labelled.textContent) ||
        nearbyLabel(node) ||
        'Usage'
      )
        .trim()
        .slice(0, 48);
      const usedPercent = NS.round1(used);
      const key = `${label}|${usedPercent}`;
      if (seen.has(key)) continue;
      seen.add(key);
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
      /* Only a 401 proves you are signed out. A 403 usually means the route
         wants a header this extension cannot send — the page still shows the
         numbers, so fall through to it instead of reporting signed-out. */
      if (error && error.code === 401) {
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

  /* What the page itself says about usage: the meters it draws plus the
     numbers it prints in text, whatever the site's wording. This is the
     reader behind every site without an account API, and the fallback for
     the two that have one. */
  NS.genericPage = () => {
    const text = NS.pageText();
    const resetsAt = NS.resetFromText(text);
    const windows = NS.pageMeters();
    const notes = [];

    /* A meter and a "25% used" line describe the same limit — keep one.
       "Generations" and "Generations used" are the same label once the
       wording around the number is dropped. */
    const core = (label) =>
      String(label || '')
        .toLowerCase()
        .replace(/\b(used|usage|left|remaining|available)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    for (const window of Readers.windowsFromText(text, resetsAt)) {
      const key = core(window.label);
      const duplicate = windows.find((existing) => {
        if (existing.usedPercent !== window.usedPercent) return false;
        const other = core(existing.label);
        return !key || !other || key === other || key.includes(other) || other.includes(key);
      });
      if (!duplicate) {
        windows.push(window);
      } else if (!duplicate.resetsAt && window.resetsAt) {
        /* The bar has no reset time of its own; the sentence beside it does. */
        duplicate.resetsAt = window.resetsAt;
      }
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

    if (!windows.length) notes.push('No usage numbers on this page yet — open a chat or the usage page, then refresh.');
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
    const OBSERVE_GAP_MS = 45000;
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

    /* Sites draw their meters after the first paint, and chats change as you
       use them. Read again when the page changes instead of waiting for the
       timer — at most once every OBSERVE_GAP_MS. */
    if (typeof MutationObserver !== 'undefined') {
      let pending = null;
      let lastObserved = 0;
      const observer = new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(() => {
          if (Date.now() - lastObserved < OBSERVE_GAP_MS) return;
          lastObserved = Date.now();
          safeRun();
        }, 1500);
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

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
    /* The popup's refresh button always reads, even if a read just happened. */
    NS.onRefresh(() => {
      lastRun = 0;
      return safeRun();
    });
  };
})();
