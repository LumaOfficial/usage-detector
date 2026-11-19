/* ChatGPT — reads chatgpt.com's own message limits while you're signed in. */
(() => {
  const NS = globalThis.__usageDetector;
  const Readers = globalThis.UsageDetectorReaders;
  if (!NS || !Readers) return;

  const PROVIDER = 'chatgpt';

  const fetchUsage = () => Readers.readChatGPT(NS.fetchJson);

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

  NS.start(PROVIDER, () => NS.detect({ provider: PROVIDER, api: fetchUsage, page: fromPage }));
})();
