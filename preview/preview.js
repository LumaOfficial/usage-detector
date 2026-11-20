/* Presents the real extension pages at their natural size — the panel and the
   settings page. No sample numbers, no wrapper content: it is the extension. */

(() => {
  const frame = document.getElementById('stage-frame');
  if (!frame) return;

  let observer = null;
  let queued = false;

  /* Keep the frame exactly as tall as the page inside it. */
  const fit = () => {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return;
    const desired = Math.max(360, Math.min(1400, doc.body.scrollHeight + 2));
    if (Math.abs(frame.clientHeight - desired) > 4) frame.style.height = `${desired}px`;
  };

  /* Resizing from inside a ResizeObserver callback makes the browser log a
     loop warning, so the resize waits for the next frame. */
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fit();
    });
  };

  frame.addEventListener('load', () => {
    fit();
    if (observer) observer.disconnect();
    const doc = frame.contentDocument;
    if (!doc || !doc.body || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(schedule);
    observer.observe(doc.body);
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((other) => {
        other.classList.toggle('is-on', other === tab);
        other.setAttribute('aria-selected', String(other === tab));
      });
      document.body.dataset.view = tab.dataset.view;
      frame.src = tab.dataset.src;
    });
  });
})();
