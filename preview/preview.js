/* Presents the real extension panel at its natural width.
   The panel is the extension itself — no sample numbers, no wrapper content. */

(() => {
  const frame = document.getElementById('stage-frame');
  if (!frame) return;

  /* Keep the frame exactly as tall as the panel inside it. */
  const fit = () => {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return;
    const desired = Math.max(360, Math.min(1200, doc.body.scrollHeight + 2));
    if (Math.abs(frame.clientHeight - desired) > 4) frame.style.height = `${desired}px`;
  };

  frame.addEventListener('load', () => {
    fit();
    const doc = frame.contentDocument;
    if (!doc || !doc.body || typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(fit).observe(doc.body);
  });
})();
