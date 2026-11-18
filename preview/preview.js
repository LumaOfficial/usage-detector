/* Drives the live popup preview: sends sample data into the iframe and
   switches between the sample states. */

(() => {
  const frame = document.getElementById('popup');
  const buttons = [...document.querySelectorAll('.states button')];

  let current = 'normal';

  const sample = () => {
    const source = (window.USAGE_DEMO && window.USAGE_DEMO[current]) || { claude: null, chatgpt: null };
    const data = structuredClone(source);
    const stamp = Date.now();
    for (const key of ['claude', 'chatgpt']) {
      if (data[key]) data[key].detectedAt = stamp;
    }
    return data;
  };

  const send = () => {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'usage:demo', data: sample() }, '*');
  };

  const select = (name) => {
    current = name;
    for (const button of buttons) {
      button.classList.toggle('is-active', button.dataset.state === name);
    }
    send();
  };

  for (const button of buttons) {
    button.addEventListener('click', () => select(button.dataset.state));
  }

  frame.addEventListener('load', send);

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'usage:demo-ready' || message.type === 'usage:demo-request') send();
  });

  send();
})();
