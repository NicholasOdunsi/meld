import { SCREEN_KEY, STUCK_MESSAGE } from "../constants";

export const FRAME_MESSAGE_SOURCE = "orion-frame";

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
  document.addEventListener('click', (event) => {
    const target = event.target;
    const element = target && typeof target.closest === 'function'
      ? target.closest('[data-goto],a[href]')
      : target && target.parentElement && target.parentElement.closest('[data-goto],a[href]');
    if (!element) return;
    event.preventDefault();
    const screenKey = element.getAttribute('data-goto');
    if (screenKey !== null) window.orion.goto(screenKey);
  }, true);
})();`;
