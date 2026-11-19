/* Claude — reads claude.ai's own usage numbers while you're signed in. */
(() => {
  const NS = globalThis.__usageDetector;
  const Readers = globalThis.UsageDetectorReaders;
  if (!NS || !Readers) return;

  const PROVIDER = 'claude';

  const planFromText = () => {
    const match = /\bclaude\s+(max|pro|team|enterprise|free)\b/i.exec(NS.pageText());
    return match ? match[1].toLowerCase() : null;
  };

  const fetchUsage = () => Readers.readClaude(NS.fetchJson);

  /* The account API is authoritative; what claude.ai draws on the page is the
     fallback, read by the shared page reader. */
  const fromPage = () => {
    const page = NS.genericPage();
    return { windows: page.windows, notes: page.notes, plan: planFromText() };
  };

  NS.start(PROVIDER, () => NS.detect({ provider: PROVIDER, api: fetchUsage, page: fromPage }));
})();
