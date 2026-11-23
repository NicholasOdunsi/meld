import { SCREEN_SCROLLBAR_DEFAULTS } from "@meld/screen-runtime/document";

// Everything that makes a generated page safe to run with scripts enabled.
// The iframe gets FRAME_SANDBOX (no same-origin, popups, forms, downloads or
// top navigation); the document gets FRAME_CSP (no network, no outside code).

export const FRAME_SANDBOX = "allow-scripts";
// Board thumbnails never execute generated JavaScript. The interactive
// document remains available for an isolated preview outside the board.
export const BOARD_FRAME_SANDBOX = "";
export const BOARD_FRAME_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");
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
const LEADING_DOCTYPE = /^\s*<!doctype[^>]*>/i;

// The guard goes in front of the page's markup, not inside it. Finding a
// <head> in the raw text is unsafe: a commented-out or quoted "<head>" would put
// the CSP in the wrong place, and a script before the real head would run
// before the CSP. A leading meta with no <html> makes the parser imply the
// html and head elements, so the CSP is the first thing it sees. The page's
// own <html>/<head> tags are then merged or ignored by the parser.
// The page is concatenated, never passed to String.replace as a replacement.
export function buildFrameDocument(html: string): string {
  return `<!doctype html>${INJECTED}${html.replace(LEADING_DOCTYPE, "")}`;
}

// The sleeping picture gets the same quiet scrollbar as the awake screen (otherwise its classic grey
// bar would show in the picture and change when the screen wakes). It goes right after the CSP and
// before the page, so the page's own scrollbar styles still win. Only the scrollbar: the page's
// margin and overscroll are left exactly as the page wrote them.
const BOARD_FRAME_STYLE = `<style>${SCREEN_SCROLLBAR_DEFAULTS.join("")}</style>`;

export function buildBoardFrameDocument(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="${BOARD_FRAME_CSP}">`;
  return `<!doctype html>${csp}${BOARD_FRAME_STYLE}${html.replace(LEADING_DOCTYPE, "")}`;
}
