/* Sample numbers for the live popup preview. Built at load time so the reset
   countdowns always look current. */

(() => {
  const now = Date.now();
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;

  const record = (provider, plan, status, windows, notes) => ({
    provider,
    plan,
    status,
    source: 'api',
    detectedAt: now,
    windows,
    notes: notes || [],
  });

  const win = (id, label, usedPercent, resetsAt, detail) => ({
    id,
    label,
    usedPercent,
    remainingPercent: usedPercent == null ? null : Math.round((100 - usedPercent) * 10) / 10,
    resetsAt: resetsAt || null,
    detail: detail || undefined,
  });

  window.USAGE_DEMO = {
    normal: {
      claude: record('claude', 'pro', 'ok', [
        win('five_hour', '5-hour session', 34, now + 2 * HOUR + 14 * MIN),
        win('seven_day', 'Weekly', 61, now + 3 * DAY + 5 * HOUR),
      ]),
      chatgpt: record('chatgpt', 'plus', 'ok', [
        win('messages', 'Messages · 3-hour window', 22, now + 2 * HOUR + 10 * MIN),
        win('reasoning', 'Reasoning model messages', 48, now + 2 * HOUR + 10 * MIN),
      ]),
    },

    near: {
      claude: record('claude', 'pro', 'near-limit', [
        win('five_hour', '5-hour session', 92, now + 12 * MIN),
        win('seven_day', 'Weekly', 88, now + 2 * DAY + 9 * HOUR),
      ]),
      chatgpt: record('chatgpt', 'plus', 'near-limit', [
        win('messages', 'Messages · 3-hour window', 95, now + 24 * MIN),
        win('reasoning', 'Reasoning model messages', 71, now + 24 * MIN),
      ]),
    },

    limit: {
      claude: record(
        'claude',
        'pro',
        'limited',
        [
          win('five_hour', '5-hour session', 100, now + 45 * MIN),
          win('seven_day', 'Weekly', 74, now + 2 * DAY + 9 * HOUR),
        ],
        ['Session limit reached — it resets in 45 min.']
      ),
      chatgpt: record(
        'chatgpt',
        'plus',
        'limited',
        [win('messages', 'Messages · 3-hour window', 100, now + 38 * MIN)],
        ['No messages left on this window — resets in 38 min.']
      ),
    },

    empty: {
      claude: null,
      chatgpt: null,
    },
  };
})();
