# Excalidraw canvas spike report

Date: 2026-11-14  
Spec: `docs/superpowers/specs/2026-11-14-excalidraw-canvas-design.md`  
Plan: `docs/superpowers/plans/2026-11-14-excalidraw-canvas-spike.md`

## Decision

**GO WITH CHANGES for further development; no production rollout yet.** The board, HTML frames, generation paths and browser persistence work in the dev route, and measured pan and zoom met the 50 ms threshold. A looping frame script froze the board, and the Mac host checks remain unverified. Frame execution isolation and the Mac check must be resolved before release.

## What was built

`/dev/canvas-excalidraw` mounts Excalidraw in an Astryx shell with sketch frames, sandboxed HTML screens, a screen switch bridge, Build screen, browser storage and a clear action. The scene stores an `orion-screen://` screen ID; HTML lives in a separate screen store. Build screen calls the owner's connected AI through the existing room queue when a room is supplied, then falls back to DeepSeek for no connection, limits, sign-in problems, failures or timeouts. Multiplayer was explicitly deferred; no relay or sync route was built.

## Results against the spike checklist

| Item | Result | Evidence |
| --- | --- | --- |
| Next app and Astryx shell | Pass in Chromium | `/dev/canvas-excalidraw` mounted in the browser test. `check:astryx` passed. |
| Sketch to HTML | Pass with test doubles; real account not run | Browser tests created a frame and generated an adjacent HTML screen. Fake room queue reported `codex`; without a room the fake DeepSeek route reported `no_connection`. Unit tests cover other fallback reasons and cancellation. No real owner account or DeepSeek key was exercised. Queue-built pages still have no scripts or `data-goto` links. |
| Referenced HTML | Pass in browser | Scene frame links use `orion-screen://<id>`; the HTML is loaded from `ScreenStore` by `FrameHost`. Browser tests render and update screens. |
| Sandbox and screen switch | Pass in Chromium, with a serious limitation | `sandbox="allow-scripts"` omits same-origin, popups, forms, downloads and top navigation. Frame CSP denies network and permits inline scripts. Browser probes tested network, popup, app and storage denial, plus `data-goto` switching. A looping script made the board unresponsive after five seconds. Native command isolation in WebKit was not run. |
| Save and reopen | Pass in Chromium; Mac not run | Five persistence browser tests cover reload, separate board IDs, clear, screen-only edits and quota failure. WebKit quit and reopen was not run. |
| 20-frame performance | Pass for 20 scene frames; only six iframes mounted | Five-second synthetic pan and zoom: 299 animation frames, p50 16.7 ms, p95 17.6 ms. Excalidraw mounted six HTML iframes at the measured viewport, so this does not prove the cost of 20 simultaneously executing pages. |
| Mac host and trackpad | Not run | Preview startup spent about 3.5 minutes compiling `/dev/demo-sign-in`, which returned 404; the canvas route timed out during compilation. The attempt stopped during Swift build, before the app opened. Pan, pinch, drawing, native bridge, WebKit persistence and loop recovery were not exercised. Source inspection shows `NativeBridge` checks `isMainFrame` and same-origin, but is not runtime proof. |
| Multiplayer | Deferred by owner | No Durable Object relay, cursors or reconnect testing. |

## Verification

On 2026-11-14, after moving a malformed generated `.next-e2e` type cache aside, `@meld/web` typecheck passed. Lint passed with 0 errors and 17 existing warnings. Vitest reported **19 files, 114 tests passed** for the Excalidraw feature and dev API. Astryx and test colocation checks passed. Playwright reported **15 passed** for the complete Excalidraw config, including the observation test that records the runaway script failure. The first typecheck attempt failed parsing the malformed generated cache, before any source type error was reported.

## Surprises and things that did not work

- The built-in Magic Frame generation path did not offer the desired sandbox control. The spike uses a normal frame and its own Build screen action and `renderEmbeddable` hook.
- `allow-scripts` plus a restrictive CSP did not protect board responsiveness. A script with an infinite loop blocked the board in Chromium. The passing stress test records the observation; it does not assert that the board stayed usable.
- Excalidraw virtualized the frames: 20 were in the scene, six HTML iframes were mounted during measurement.
- The Mac preview did not reach a usable window. Its warmup route returned 404, and the canvas route timed out while compiling.
- The probe blocks external links entirely. The spec's click-triggered system-browser flow remains unimplemented.

## Risks that remain

- Generated scripts can deny service to the board, especially when a collaborator's board is opened. A separate origin or process, or a thumbnail-first architecture with an isolated interactive preview, needs a new spike and a demonstrated recovery path.
- Browser `localStorage` has a 4 MB application cap, no image persistence, no server backup and no revision conflict handling. The current dev board is single-editor only.
- The queue and DeepSeek browser paths used fakes. Real account, model, failure and timeout behavior need smoke tests. The queue's generated document contract is still static; script-enabled generation and connected prototype screens are stage 6 work.
- The network policy is fixed to no network. A per-board allowlist and the external-link handoff remain to be designed.
- WebKit isolation from native commands, trackpad gestures and persistence are unverified. Source guards are encouraging but insufficient for release.
- Multiplayer and migration of tldraw boards remain deferred.

## Recommendation for stage 2

Keep Excalidraw as the drawing base and retain the scene-to-screen-ID separation. Before production board work, make a short isolation and Mac validation milestone: prevent one frame script from freezing the board, prove recovery, and complete the WebKit checklist. Re-run performance with 20 actually mounted interactive pages or document an explicit viewport cap. Then plan server persistence, recoverable saves, the real generation path, instruction edits and revision handling. Update the spec to make script responsiveness and Mac validation explicit release gates. A reliable stage 2 size estimate depends on the isolation solution and real-account results; do not treat the dev spike as a production implementation estimate.
