/* Claude — reads claude.ai's own usage numbers while you're signed in. */
(() => {
  const NS = globalThis.__usageDetector;
  if (!NS) return;

  const PROVIDER = 'claude';

  const planFromText = () => {
    const match = /\bclaude\s+(max|pro|team|enterprise|free)\b/i.exec(NS.pageText());
    return match ? match[1].toLowerCase() : null;
  };

  const fetchUsage = async () => {
    const orgs = await NS.fetchJson('/api/organizations');
    const list = Array.isArray(orgs) ? orgs : Array.isArray(orgs && orgs.data) ? orgs.data : [];
    const org = list.find((item) => item && typeof item.uuid === 'string');
    if (!org) throw new Error('no-org');

    const usage = await NS.fetchJson(`/api/organizations/${org.uuid}/usage`);
    const windows = NS.extractWindows(usage);
    const plan = NS.findValue(usage, ['plan_type', 'plan', 'tier']);

    return {
      windows,
      plan: typeof plan === 'string' ? plan.toLowerCase() : null,
      notes: windows.length ? [] : ['claude.ai returned no usage windows for this account.'],
    };
  };

  const fromPage = () => {
    const text = NS.pageText();
    const windows = NS.progressBars();
    const notes = [];

    const percentLine = /([^\n]{0,48}?)(\d{1,3}(?:\.\d+)?)\s*%\s*(?:used|of (?:your )?(?:limit|usage))/i.exec(text);
    if (percentLine) {
      const used = NS.clamp(Number(percentLine[2]), 0, 100);
      windows.unshift({
        id: 'page-usage',
        label: percentLine[1].trim().slice(0, 40) || 'Usage',
        usedPercent: NS.round1(used),
        remainingPercent: NS.round1(100 - used),
        resetsAt: NS.resetFromText(text),
      });
    }

    const limited =
      /(?:you(?:['’]ve|\s+have)\s+)?(?:reached|hit)\s+(?:your|the)\s+(?:usage\s+|message\s+)?limit|usage limit reached|out of (?:messages|usage)/i.test(
        text
      );
    if (limited && !windows.length) {
      windows.push({
        id: 'page-limit',
        label: 'Usage limit',
        usedPercent: 100,
        remainingPercent: 0,
        resetsAt: NS.resetFromText(text),
      });
    }

    if (!windows.length) notes.push('Open a chat and send a message, then refresh.');
    return { windows, notes, plan: planFromText() };
  };

  NS.keepFresh(() => NS.detect({ provider: PROVIDER, api: fetchUsage, page: fromPage }));
})();
