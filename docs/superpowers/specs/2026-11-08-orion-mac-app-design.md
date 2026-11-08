# Orion Mac App — design

Status: approved in brainstorm 2026-11-08 · Owner: Nicholas Odunsi
Comes after: Orion Online (`2026-11-08-orion-online-design.md`, shipped).
Comes before: native Inspiration screen, then native Taste screen (own specs).

---

## Part A — Read this first (plain language)

### What it is

One Mac app called **Orion**, in your Applications folder. It replaces the
**Orion Shelf** app — Shelf becomes part of it.

- **The window** shows everything you have online today — rooms, canvas,
  Inspiration, Taste — in a real Mac window. No web browser. Links to other
  websites open in your normal browser.
- **The menu-bar icon** works exactly like Shelf does now: drag images onto it,
  or press ⌥⌘O and paste. Its panel gains **Open Orion**.
- **Closing the window** keeps Orion running in the menu bar, so Shelf keeps
  working. The Dock icon shows only while a window is open. Orion starts by
  itself when you log in to your Mac.
- **Signing in:** the first time, type your email, then the 6-digit code from
  the email. (The email keeps its link too, so your normal browser still works.)
  You stay signed in. Shelf connects itself — no pairing code ever again.
- **Notifications:** if you're in another app when the AI finishes replying, or
  finishes generating screens or a user flow, a Mac notification pops up.
  Clicking it takes you straight there.
- **Remembers where you were:** reopens on the same project and page, with the
  window the same size and in the same place.
- **Updates itself:** when a change to the app is merged, GitHub builds a new
  copy. Orion downloads it quietly and offers **Install and Relaunch** (or
  installs it next time Orion restarts). Settings has **Check for Updates…**.
  Your screens keep updating on their own, as today.
- **No internet?** A clear *"Can't reach Orion — Try again"* screen instead of a
  blank window; it reconnects by itself when the internet is back. Images dropped
  on Shelf wait and upload later, as today.

### Not in this version

Menus with keyboard shortcuts, several windows at once, and native (rebuilt in
Swift) screens. Native Inspiration and Taste screens are the next two specs.

### Cost and trust

Still **$0**. No Apple developer account. Orion is signed with a free,
home-made certificate so your Mac recognises every update as the same app and
doesn't keep asking for your password or notification permission again.

### What you do by hand (once, about 5 minutes)

1. Let an agent install Orion (it downloads the latest build for you).
2. Open Orion, type your email, type the code from the email.
3. Click **Allow** when Mac asks about notifications.
4. Check your Inspiration images and taste board are there, then say "done" —
   the agent deletes the old Shelf app and its old connection.

### What "done" means

- Orion opens from Applications with Terminal closed and no browser open.
- Dropping an image on the menu-bar icon saves it to Inspiration.
- Closing the window leaves the menu-bar icon working; the Dock icon disappears.
- An AI reply that finishes while you're in another app shows a notification;
  clicking it opens that room.
- Quitting and reopening Orion lands on the same page and window position.
- A merged change to the app is offered as an update, and installing it
  raises no password or permission prompt.
- With Wi-Fi off, Orion shows the "Can't reach Orion" screen, and recovers by
  itself when Wi-Fi comes back.
- The old Orion Shelf app is gone.

### Decisions I made for you (technical — flagged so you know)

- **The window shows the online site inside the app** (Apple's built-in web
  view). That's what makes everything work on day one; screens get swapped for
  native ones later, one at a time.
- **Updates use Sparkle**, the standard free updater most Mac apps outside the
  App Store use. Each update is cryptographically signed; Orion refuses any
  download that isn't.
- **Google sign-in is hidden inside the app** (Google blocks sign-in inside
  embedded web views). It stays available in your normal browser.

---

## Part B — How it works (for implementers)

### B1. Repository layout

`apps/shelf` is renamed to **`apps/mac`** (`git mv`, history kept). The Swift
package becomes `OrionMac`:

| Target | Kind | Purpose |
|---|---|---|
| `ShelfCore` | library (unchanged) | capture, outbox, upload, keychain token |
| `OrionAppCore` | library (new, no UI) | pure logic: link policy, restorable URL, bridge messages, notification routing, update config, connection state |
| `Orion` | executable | the app: window, web view, status item, Shelf panel, settings |
| `ShelfTestSupport`, `ShelfCoreTests`, `OrionAppCoreTests`, `OrionTests` | tests | — |

Current `OrionShelf` UI sources move into `Orion/Shelf/…` unchanged in
behaviour. Dependencies: `orion-design-system` (local), **Sparkle 2** (SPM).
Platform stays `.macOS(.v26)`, Swift 6 language mode. All Swift follows
`.claude/skills/swiftui-pro`.

App bundle: `AppBundle/Info.plist` → name **Orion**, executable `Orion`, bundle
id **`com.orion.app`**, `LSUIElement` removed (activation policy is set at
runtime, see B4), `SUFeedURL` + `SUPublicEDKey` added, `CFBundleVersion` set by
the build script.

### B2. Window and web view

- One window owned by an AppKit `NSWindowController` hosting SwiftUI (not a
  SwiftUI `Window` scene — the status item must show/hide it and the activation
  policy follows it). Content wraps a `WKWebView` using
  `WKWebsiteDataStore.default()` so cookies (the Supabase session) persist.
- Base URL `https://orion-workspace-phi.vercel.app`, read from Info.plist key
  `OrionBaseURL` (debug builds may override via `UserDefaults` for local dev).
- Custom user agent suffix `OrionMac/<version>` so the web app can detect it.
- **Link policy** (`OrionAppCore.LinkPolicy`, unit-tested): same-origin → load
  in view; any other `http(s)` origin → `NSWorkspace.shared.open`; other schemes
  (`mailto:` etc.) → `NSWorkspace`; `target=_blank` same-origin → same view.
- `WKUIDelegate`: implement file open panel (`runOpenPanelWith`), JS
  alert/confirm/prompt, and `WKDownloadDelegate` saving to `~/Downloads`.
  Drag-and-drop and paste into the web canvas work natively in WKWebView —
  verify, don't reimplement.
- Show the Orion mark with a progress indicator until the first page load
  finishes (no blank white window).

### B3. Offline and errors

- `ConnectionState` (`online` / `unreachable(reason)`) in `OrionAppCore`.
- `didFailProvisionalNavigation` / `didFail` with a network error (or the
  web-content process terminating) → native **"Can't reach Orion"** view with
  **Try again**. An `NWPathMonitor` reload is triggered automatically when the
  path becomes satisfied.
- HTTP 5xx on the main frame → same view with "Orion is having trouble — Try
  again".

### B4. Dock, menu bar and launch at login

- The status item and Shelf panel move over unchanged (drop target, ⌥⌘O hotkey,
  room picker, recent thumbnails, outbox). The panel footer's "Open Library"
  becomes **Open Orion**; **Check for Updates…** lives in Settings. Shelf's
  "open in Inspiration" actions now open in the Orion window.
- Activation policy: `.regular` while the window is visible, `.accessory` when
  it closes. `applicationShouldTerminateAfterLastWindowClosed` → `false`.
  Clicking the Dock icon or **Open Orion** shows and focuses the window.
- Launch at login via the existing `SMAppServiceLaunchAtLogin`, now registering
  the Orion app; on at first run, toggle in Settings.
- Launch at login opens Orion **without** showing the window (menu bar only).
  If macOS gives no reliable "launched at login" signal, fall back to showing
  the window and tell the owner.

### B5. Remember where you were

- Window frame: `NSWindow.setFrameAutosaveName("OrionMain")`.
- Last page: observe `webView.url` via KVO (fires on Next.js client
  navigations). `RestorableURL` (OrionAppCore) keeps it only if same-origin and
  not an auth path (`/sign-in`, `/auth/*`); stored in `UserDefaults`. On launch
  load it, else base URL. If it 404s or redirects to sign-in, that's the web
  app's normal behaviour — no special handling.

### B6. Email-code sign-in (web change)

- Supabase **Magic Link** email template gains the code alongside the link
  (`{{ .Token }}`), both in `supabase/config.toml` (local) and on the online
  project (via Supabase Management API in the release task, recorded in
  `docs/runbooks/orion-online.md`). OTP length is 6 (already configured).
- Sign-in page: after "Check your email", show a **6-digit code** field.
  New server action `verifyEmailCode(email, code)` calls
  `supabase.auth.verifyOtp({ email, token, type: "email" })`, then redirects to
  `next` (same validation as the existing callback). Errors: wrong/expired code
  → "That code didn't work. Check the latest email or send a new one." Link
  sign-in keeps working unchanged.
- When the user agent contains `OrionMac/`, hide the Google button.
- This works in every browser too — it is not app-only.

### B7. Native bridge (web ⇄ app)

A tiny, versioned message channel. Web side: `apps/web/src/features/native/`
(`bridge.ts`, client-only). It is a no-op unless
`window.webkit?.messageHandlers?.orion` exists. Native side:
`WKScriptMessageHandler` named `orion`; messages are decoded by
`OrionAppCore.BridgeMessage` (Codable, unknown types ignored, never crash).

Web → app messages (v1):

| type | payload | when |
|---|---|---|
| `notify` | `{ title, body, path }` | an AI task finishes (below) |
| `shelfConnectCode` | `{ code }` | reply to `requestShelfConnect` |
| `shelfConnectFailed` | `{ message }` | the page could not make a code |
| `ready` | `{ workspaceId \| null }` | page signed-in and mounted |

App → web (via `evaluateJavaScript` calling
`window.__orionNative?.requestShelfConnect()`): ask the page for a Shelf
connect code.

**Notification events** — the web app calls `notify` when:
the `RoomTaskStatusProvider` sees a task transition to completed, for the task
types `room_reply`, `design_screen_generate` and `user_flow_generate`. (There
are no separate hooks in the two generation features.)
Titles/bodies are short and plain ("Screens ready — 4 screens in *Room name*").
`path` is the same-origin path to open.

Native shows a `UNUserNotification` **only if the app is not active or the
window is not key**. Clicking it shows the window and loads `path` (validated by
`RestorableURL` rules). Permission is requested on the first `notify`, not at
launch.

### B8. Shelf connects itself

When the app has no Shelf token in the keychain and receives `ready` with a
workspace id, it calls `requestShelfConnect()`. The page calls the existing
`createShelfConnectCode(workspaceId)` server action and replies with
`shelfConnectCode`. Native redeems it through the existing
`POST /api/shelf/connect` (`URLSessionOrionClient`), stores the token with the
existing `KeychainTokenStore` (service name updated to `com.orion.app`). Device
name: "Orion on <Mac name>". Failure → retried on the next `ready`; Shelf panel
shows its existing "Not connected" state meanwhile. The manual code entry stays
in Settings as a fallback. No new server endpoint, no schema change.

### B9. Updates

- **Signing identity:** a self-signed code-signing certificate "Orion
  Self-Signed" (created once, stored as base64 `.p12` + password in GitHub
  secrets `ORION_MAC_CERT_P12`, `ORION_MAC_CERT_PASSWORD`). Every build is
  signed with it so the designated requirement is stable → Keychain items and
  notification permission survive updates.
- **Build details:** Sparkle 2.10.1 on the `macos-26` runner (tarball pinned by
  SHA-256). The app carries the `disable-library-validation` entitlement so the
  self-signed app can load Sparkle's framework.
- **Sparkle EdDSA key:** private key in GitHub secret `SPARKLE_ED_PRIVATE_KEY`;
  public key in Info.plist `SUPublicEDKey`. Updates without a valid signature
  are rejected by Sparkle.
- **Workflow** `.github/workflows/mac-release.yml`: on push to `main` touching
  `apps/mac/**`, `packages/orion-design-system/**` or the workflow itself
  (and `workflow_dispatch`). macOS runner: `swift test` → `scripts/build-app.sh
  --release` (version = `1.0.<run_number>`) → zip → `sign_update` →
  generate `appcast.xml` → publish GitHub Release `mac-v1.0.<n>` with zip +
  appcast. `SUFeedURL` =
  `https://github.com/NicholasOdunsi/meld/releases/latest/download/appcast.xml`.
  Mac releases are marked "latest"; no other workflow publishes GitHub
  Releases today (checked 2026-11-08), so `latest` is always the Mac app.
- The repo is public, so releases are public. The app contains **no secrets**
  (base URL and anon-level config only); that's acceptable.
- App checks on launch and every 6 h, downloads automatically, and uses
  Sparkle's standard "Install and Relaunch" prompt; also **Check for
  Updates…** in Settings.
- **First install:** `apps/mac/scripts/install.sh` downloads the latest release
  zip with `curl` over HTTPS (no quarantine flag), unzips it, checks with
  `codesign --verify --strict` that it is signed by the "Orion Self-Signed"
  certificate (leaf SHA-256 pinned in the script), moves it to
  `~/Applications/Orion.app`, and opens it. Run by an agent.
- `build-app.sh` keeps a local mode (ad-hoc/self-signed, installs to
  `~/Applications`) for development.

### B10. Retiring Orion Shelf

During acceptance, after the owner confirms Orion works: quit and delete
`~/Applications/Orion Shelf.app`, unregister its login item, revoke its token
in Settings → Shelf, and delete its old keychain item (service
`com.orion.shelf`). The outbox needs no move: Orion keeps the same directory
(`~/Library/Application Support/Orion/shelf-outbox`), so any images still
waiting upload from Orion. Update `apps/mac/README.md`.

### B11. Testing

- **OrionAppCore unit tests:** LinkPolicy, RestorableURL, BridgeMessage
  decoding (valid, unknown type, malformed), notification routing (active vs
  inactive), ConnectionState transitions.
- **Existing** ShelfCore / Shelf tests stay green after the move.
- **Web (vitest):** `verifyEmailCode` (success, bad code, bad `next`), bridge
  no-op outside the app, `notify` called at each of the three completion points,
  Google button hidden for `OrionMac/` UA.
- **Sign-in page (vitest + Testing Library):** code field appears after the
  email is sent; Google hidden in the app. (No Playwright test: e2e runs in
  fake-auth mode, which can't exercise a real Supabase code.)
- **Release spike (task 1):** prove on this Mac that a self-signed, Sparkle
  update installs over the previous version with no Keychain or notification
  prompt. If it fails, stop and report before building the rest.
- **Manual acceptance:** the "What done means" list in Part A, recorded in
  `.context` and then committed to the runbook.

### B12. Delivery order

Steps on the same line can run in parallel (subagents).

1. **Spike:** self-signed cert + Sparkle update round-trip on this Mac (gate).
2. **Move** `apps/shelf` → `apps/mac`, rename to Orion, new bundle id; all
   tests green. ‖ **Web:** email-code sign-in (B6). ‖ **Web:** bridge module +
   three notify points + `requestShelfConnect` (B7).
3. **Native:** window, web view, link policy, file panel/downloads, offline
   view, restoration (B2, B3, B5).
4. **Native:** bridge handler, notifications, Shelf auto-connect (B7, B8). ‖
   **Native:** Dock/menu-bar behaviour, launch at login (B4).
5. **Release:** workflow, secrets, appcast, `install.sh`, Supabase template
   online (B9, B6).
6. **Acceptance with owner** + retire Shelf (B10).

### B13. Risks

- **macOS runner availability** for the required SDK (macOS 26). If GitHub's
  hosted runners lack it, fall back to `apps/mac/scripts/release-local.sh`,
  which does the same build/sign/appcast steps on the owner's Mac and uploads
  the release with `gh` — flag to owner before choosing (it means updates are
  published by hand, not automatically).
- **Sparkle with a non-Apple certificate** — covered by the task-1 spike.
- **Hidden Google button** — if the owner later wants Google in the app, use
  `ASWebAuthenticationSession`; out of scope now.
