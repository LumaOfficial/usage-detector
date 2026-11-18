/* ChatGPT — reads chatgpt.com's own message limits while you're signed in. */
(() => {
  const NS = globalThis.__usageDetector;
  if (!NS) return;

  const PROVIDER = 'chatgpt';

  const planFrom = (data) => {
    const raw = NS.findValue(data, ['plan_type', 'plan', 'subscription_plan', 'workspace_plan']);
    if (typeof raw !== 'string') return null;
    const value = raw.toLowerCase();
    for (const name of ['enterprise', 'team', 'pro', 'plus', 'free']) {
      if (value.includes(name)) return name;
    }
    return value;
  };

  const fetchUsage = async () => {
    const notes = [];
    let plan = null;

    try {
      const account = await NS.fetchJson('/backend-api/accounts/check/v4-2023-04-27');
      plan = planFrom(account);
    } catch (error) {
      if (error && (error.code === 401 || error.code === 403)) throw error;
    }

    const windows = [];
    try {
      const limit = await NS.fetchJson('/backend-api/conversation_limit');
      windows.push(...NS.extractWindows(limit));
      const cap = NS.number(limit && (limit.message_cap ?? limit.messageCap));
      const used = NS.number(limit && (limit.message_usage ?? limit.messageUsage ?? limit.used));
      if (cap && used != null) {
        const percent = NS.round1(NS.clamp((used / cap) * 100, 0, 100));
        windows.push({
          id: 'messages',
          label: 'Messages',
          usedPercent: percent,
          remainingPercent: NS.round1(100 - percent),
          resetsAt: NS.toEpoch(limit && (limit.resets_at ?? limit.reset_at)),
        });
      } else if (cap) {
        notes.push(`Your plan allows ${cap} messages per window.`);
      }
    } catch (error) {
      if (error && (error.code === 401 || error.code === 403)) throw error;
    }

    if (!plan) {
      try {
        const me = await NS.fetchJson('/backend-api/me');
        plan = planFrom(me);
      } catch (_) {
        /* plan stays unknown */
      }
    }

    return { windows, plan, notes };
  };

  const fromPage = () => {
    const text = NS.pageText();
    const windows = NS.progressBars();
    const notes = [];

    const left = /(\d{1,4})\s+messages?\s+(?:left|remaining)/i.exec(text);
    if (left) {
      const count = Number(left[1]);
      if (count === 0) {
        windows.unshift({
          id: 'page-limit',
          label: 'Message limit',
          usedPercent: 100,
          remainingPercent: 0,
          resetsAt: NS.resetFromText(text),
        });
      } else {
        windows.unshift({
          id: 'messages-left',
          label: 'Messages left',
          usedPercent: null,
          remainingPercent: null,
          detail: `${count} left`,
          resetsAt: NS.resetFromText(text),
        });
      }
    }

    const limitHit =
      /(?:you(?:['’]ve|\s+have)\s+)?(?:reached|hit)\s+(?:the|your)\s+[^\n.]{0,32}?(?:limit|cap)|limit reached/i.test(text);
    if (limitHit && !windows.some((window) => window.usedPercent === 100)) {
      windows.unshift({
        id: 'page-limit',
        label: 'Limit',
        usedPercent: 100,
        remainingPercent: 0,
        resetsAt: NS.resetFromText(text),
      });
    }

    if (!windows.length) notes.push('Open a chat or the model menu to see your current limits.');
    return { windows, notes, plan: null };
  };

  NS.keepFresh(() => NS.detect({ provider: PROVIDER, api: fetchUsage, page: fromPage }));
})();
