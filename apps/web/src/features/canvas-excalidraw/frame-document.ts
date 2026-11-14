// Everything that makes a generated page safe to run with scripts enabled.
// The iframe gets FRAME_SANDBOX (no same-origin, popups, forms, downloads or
// top navigation); the document gets FRAME_CSP (no network, no outside code).

export const FRAME_SANDBOX = "allow-scripts";
export const FRAME_MESSAGE_SOURCE = "orion-frame";

export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");

// A click on [data-goto] asks the canvas to show another screen. Every other
// link click is swallowed: the spike does not open external links.
const BRIDGE = `(function(){
var post=function(m){parent.postMessage(Object.assign({source:"${FRAME_MESSAGE_SOURCE}"},m),"*")};
window.orion={goto:function(k){post({type:"goto",screenKey:String(k)})}};
document.addEventListener("click",function(e){
var a=e.target instanceof Element?e.target.closest("[data-goto],a[href]"):null;
if(!a)return;
e.preventDefault();
var k=a.getAttribute("data-goto");
if(k)post({type:"goto",screenKey:k});
},true);
})();`;

const INJECTED = `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><script>${BRIDGE}</script>`;
const HEAD_OPEN = /<head(\s[^>]*)?>/i;
const HTML_OPEN = /<html(\s[^>]*)?>/i;

export function buildFrameDocument(html: string): string {
  if (HEAD_OPEN.test(html)) return html.replace(HEAD_OPEN, (open) => `${open}${INJECTED}`);
  if (HTML_OPEN.test(html)) return html.replace(HTML_OPEN, (open) => `${open}<head>${INJECTED}</head>`);
  return `<!doctype html><html><head>${INJECTED}</head><body>${html}</body></html>`;
}
