import type { Screen } from "./screen-store";

const page = (title: string, body: string, script = "") =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
  `<style>body{font-family:system-ui;margin:0;padding:32px;background:ghostwhite;color:black}` +
  `h1{margin:0 0 8px}button{padding:10px 16px;border:0;border-radius:8px;background:rebeccapurple;color:white;font-size:16px}</style>` +
  `</head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;

export const WELCOME_HTML = page(
  "Welcome",
  '<h1>Welcome</h1><p id="js">script has not run</p><button data-goto="login">Log in</button>',
  'document.getElementById("js").textContent="script ran";',
);
export const LOGIN_HTML = page("Log in", '<h1>Log in</h1><button data-goto="welcome">Back</button>');
export const GENERATED_HTML = page("Generated", '<h1>Generated screen</h1><button data-goto="welcome">Home</button>');

// Reports what a frame is and is not allowed to do. Read the text, or the
// Playwright assertions in e2e/canvas-excalidraw-frames.spec.ts.
export const PROBE_HTML = page(
  "Probe",
  '<h1>Probe</h1><section id="out"></section>',
  `var out=document.getElementById("out");
function line(k,v){var p=document.createElement("p");p.textContent=k+": "+v;p.id=k.replace(/ /g,"-");out.appendChild(p)}
try{fetch("https://example.com/").then(function(){line("network","ALLOWED")},function(){line("network","blocked")})}catch(e){line("network","blocked")}
line("popup",window.open("about:blank")===null?"blocked":"ALLOWED");
line("parent",(function(){try{return parent.document?"ALLOWED":"blocked"}catch(e){return"blocked"}})());
line("storage",(function(){try{localStorage.getItem("x");return"ALLOWED"}catch(e){return"blocked"}})());
var nativeHandler=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.orion;
line("native bridge",nativeHandler?"present":"absent");
if(nativeHandler){setTimeout(function(){try{nativeHandler.postMessage({v:1,type:"notify",title:"PROBE",body:"A generated frame reached the native bridge",path:"/"})}catch(e){}},8000)}`,
);

export const LOOP_HTML = page("Loop", "<h1>Loop</h1>", "while(true){}");

export type FixtureKey = "sample" | "probe" | "loop";

export const FIXTURES: Record<FixtureKey, { screens: Screen[]; frameScreenId: string }> = {
  sample: {
    screens: [
      { id: "welcome", rev: 1, html: WELCOME_HTML },
      { id: "login", rev: 1, html: LOGIN_HTML },
    ],
    frameScreenId: "welcome",
  },
  probe: { screens: [{ id: "probe", rev: 1, html: PROBE_HTML }], frameScreenId: "probe" },
  loop: { screens: [{ id: "loop", rev: 1, html: LOOP_HTML }], frameScreenId: "loop" },
};

export function fakeGeneratedScreen(): { screenId: string; html: string } {
  return { screenId: `generated-${Math.random().toString(36).slice(2, 8)}`, html: GENERATED_HTML };
}
