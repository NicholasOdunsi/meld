import { SCREEN_KEY, STUCK_MESSAGE, TAG_ATTRIBUTE } from "../constants";

export const FRAME_MESSAGE_SOURCE = "orion-frame";
export const HOST_MESSAGE_SOURCE = "orion-host";

/** Browser-side frame reporting and navigation, embedded before screen code. */
export const FRAME_BRIDGE_SOURCE = `(() => {
  const post = (payload) => window.parent.postMessage(
    Object.assign({ source: ${JSON.stringify(FRAME_MESSAGE_SOURCE)} }, payload), '*'
  );
  window.__orionReport = (error) => {
    const message = String(error && error.message != null ? error.message : error);
    if (message.includes(${JSON.stringify(STUCK_MESSAGE)})) post({ type: 'stuck' });
    else post({ type: 'error', message: message.slice(0, 500) });
  };
  // Called by the loop guard just before it throws; see loop-guard.ts.
  window.__orionStuck = () => post({ type: 'stuck' });
  window.orion = {
    goto: (screenKey) => {
      if (typeof screenKey === 'string' && ${SCREEN_KEY.toString()}.test(screenKey)) {
        post({ type: 'goto', screenKey });
      }
    },
  };
  window.__orionReady = () => post({ type: 'ready' });
  window.addEventListener('error', (event) => {
    event.preventDefault();
    window.__orionReport(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    window.__orionReport(event.reason);
  });
  // The board shows sleeping screens as pictures that never run code, so the
  // host asks for a copy of the rendered page with every script removed.
  window.__orionSnapshot = () => {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll('script,meta[http-equiv]').forEach((node) => node.remove());
    root.querySelectorAll('*').forEach((node) => {
      for (const attribute of Array.from(node.attributes)) {
        if (/^on/i.test(attribute.name) || attribute.name === ${JSON.stringify(TAG_ATTRIBUTE)}) node.removeAttribute(attribute.name);
      }
    });
    return '<!doctype html>' + root.outerHTML;
  };
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.source !== ${JSON.stringify(HOST_MESSAGE_SOURCE)}) return;
    if (data.type === 'snapshot') post({ type: 'snapshot', html: window.__orionSnapshot() });
  });
  // Escape puts the live screen back to sleep, unless the screen used it.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) post({ type: 'escape' });
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    const element = target && typeof target.closest === 'function'
      ? target.closest('[data-goto],a[href]')
      : target && target.parentElement && target.parentElement.closest('[data-goto],a[href]');
    if (!element) return;
    const screenKey = element.getAttribute('data-goto');
    // In-page #anchor links scroll natively; only block navigation away.
    if (screenKey === null && (element.getAttribute('href') || '').startsWith('#')) return;
    event.preventDefault();
    if (screenKey !== null) window.orion.goto(screenKey);
  }, true);
})();`;
