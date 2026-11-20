/* Every other supported AI — these sites expose no account API the extension
   can rely on, so it reads the meters and limit copy the page itself shows. */
(() => {
  const NS = globalThis.__usageDetector;
  const Sites = globalThis.UsageDetectorSites;
  if (!NS || !Sites) return;

  const site = Sites.detect(location.href);
  if (!site || site.hasApi) return;

  NS.start(site.id, () => NS.detect({ provider: site.id, page: () => NS.genericPage() }));
})();
