/* ChatGPT — reads chatgpt.com's own message limits while you're signed in. */
(() => {
  const NS = globalThis.__usageDetector;
  const Readers = globalThis.UsageDetectorReaders;
  if (!NS || !Readers) return;

  const PROVIDER = 'chatgpt';

  const fetchUsage = () => Readers.readChatGPT(NS.fetchJson);

  /* The account API is authoritative; what chatgpt.com draws on the page is the
     fallback, read by the shared page reader. */
  const fromPage = () => NS.genericPage();

  NS.start(PROVIDER, () => NS.detect({ provider: PROVIDER, api: fetchUsage, page: fromPage }));
})();
