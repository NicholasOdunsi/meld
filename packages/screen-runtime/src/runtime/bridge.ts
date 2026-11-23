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
    root.querySelectorAll('[data-orion-overlay]').forEach((node) => node.remove());
    return '<!doctype html>' + root.outerHTML;
  };
  let picking = false, pickEpoch = 0;
  const px = (v) => { const n = parseFloat(v); return String(Number.isFinite(n) ? Math.round(n * 10) / 10 : 0).slice(0, 12); };
  let swatch = null;
  const paint = (ctx, css, base) => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = base; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  // Browsers report oklch(), color-mix() and color() as authored, but the host reads rgb().
  const toRgb = (css) => {
    const original = String(css).slice(0, 40);
    try {
      if (!swatch) {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        swatch = canvas.getContext('2d', { willReadFrequently: true }) || false;
      }
      if (!swatch) return original;
      const onBlack = paint(swatch, css, '#000'), onWhite = paint(swatch, css, '#fff');
      // An unparseable colour leaves the base fill in place, so the two passes disagree.
      if (onBlack.some((v, i) => v !== onWhite[i])) return original;
      if (!onBlack[3]) return 'rgba(0, 0, 0, 0)';
      return ('rgb(' + onBlack[0] + ', ' + onBlack[1] + ', ' + onBlack[2] + ')').slice(0, 40);
    } catch (error) { return original; }
  };
  // The size the panel writes back is CSS width/height, so it reports that one (it follows box-sizing).
  // Inline boxes say "auto"; only then does the drawn box stand in.
  const size = (css, drawn) => { const n = parseFloat(css); return px(Number.isFinite(n) ? n : drawn); };
  const readComputed = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return {
      fontFamily: s.fontFamily.slice(0, 120), fontSize: px(s.fontSize), fontWeight: String(s.fontWeight).slice(0, 12),
      color: toRgb(s.color), backgroundColor: toRgb(s.backgroundColor),
      width: size(s.width, r.width), height: size(s.height, r.height), padding: px(s.paddingTop), gap: px(s.rowGap),
      borderRadius: px(s.borderTopLeftRadius), display: s.display.slice(0, 20),
    };
  };
  let overlay = null, marked = null;
  const place = () => {
    if (!marked || !overlay) return;
    const r = marked.getBoundingClientRect();
    overlay.style.left = r.left + 'px'; overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px'; overlay.style.height = r.height + 'px';
  };
  const mark = (el) => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-orion-overlay', '');
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #6965db;outline-offset:-1px;border-radius:2px';
      document.documentElement.appendChild(overlay);
    }
    marked = el; place();
  };
  const clearMark = () => { if (overlay) overlay.remove(); overlay = null; marked = null; };
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  const choose = (tagged) => {
    const src = tagged && tagged.getAttribute('data-orion-src');
    if (!src || src.length > 155) return false;
    mark(tagged);
    post({ type: 'picked', epoch: pickEpoch, src, computed: readComputed(tagged),
      label: (tagged.getAttribute('aria-label') || tagged.textContent || tagged.tagName).trim().slice(0, 100) });
    return true;
  };
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.source !== ${JSON.stringify(HOST_MESSAGE_SOURCE)}) return;
    if (data.type === 'pick-mode' && typeof data.enabled === 'boolean' && Number.isSafeInteger(data.epoch) && data.epoch >= pickEpoch) {
      picking = data.enabled; pickEpoch = data.epoch;
    }
    if (data.type === 'select-element' && typeof data.src === 'string' && Number.isSafeInteger(data.epoch) && data.epoch >= pickEpoch) {
      pickEpoch = data.epoch;
      const found = Array.from(document.querySelectorAll('[data-orion-src]')).find((n) => n.getAttribute('data-orion-src') === data.src);
      if (found) choose(found);
    }
    if (data.type === 'clear-selection') clearMark();
    if (data.type === 'snapshot') post({ type: 'snapshot', html: window.__orionSnapshot() });
  });
  // Escape puts the live screen back to sleep, unless the screen used it.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) post({ type: 'escape' });
  });
  // A pinch over the screen zooms the board, not the page or the screen. Chromium reports a
  // trackpad pinch as ctrl+wheel, Safari as gesture events; both stay inside this frame, so the
  // board hears them from here. A plain wheel scrolls the screen, and a screen that used
  // ctrl+wheel itself keeps it. Numbers are bounded to what the host accepts.
  const bound = (n, limit) => (Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0);
  window.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || event.defaultPrevented) return;
    event.preventDefault();
    post({ type: 'zoom', x: bound(event.clientX, 100000), y: bound(event.clientY, 100000), deltaY: bound(event.deltaY, 1000) });
  }, { passive: false });
  let gestureScale = 1;
  window.addEventListener('gesturestart', (event) => { event.preventDefault(); gestureScale = 1; });
  window.addEventListener('gesturechange', (event) => {
    event.preventDefault();
    const scale = event.scale;
    if (!Number.isFinite(scale) || scale <= 0) return;
    const step = Math.max(0.1, Math.min(10, scale / gestureScale));
    gestureScale = scale;
    post({ type: 'pinch', x: bound(event.clientX, 100000), y: bound(event.clientY, 100000), scale: step });
  });
  window.addEventListener('gestureend', (event) => { event.preventDefault(); });
  // While selecting, the screen must not react to a press at all: menus that open on pointerdown,
  // drag handles, focus and form submits. Only the click goes on to select.
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'submit'].forEach((type) => {
    document.addEventListener(type, (event) => {
      if (!picking) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (picking) {
      event.preventDefault(); event.stopImmediatePropagation();
      const tagged = target && typeof target.closest === 'function'
        ? target.closest('[data-orion-src]')
        : target && target.parentElement && target.parentElement.closest('[data-orion-src]');
      if (!choose(tagged)) { clearMark(); post({ type: 'deselected' }); }
      return;
    }
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
