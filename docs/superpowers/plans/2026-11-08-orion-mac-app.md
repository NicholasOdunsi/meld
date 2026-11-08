# Orion Mac App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one Mac app, **Orion**, that shows Orion Online in a native window, absorbs the Orion Shelf menu-bar app, signs in with an email code, sends Mac notifications, remembers where you were, and updates itself.

**Architecture:** `apps/shelf` becomes `apps/mac` (Swift package `OrionMac`). A new UI-free library `OrionAppCore` holds every decision as pure, unit-tested code; the `Orion` executable wires those decisions to AppKit/WebKit (`WKWebView` window, status item, Shelf panel, Sparkle). The web app gains an email-code sign-in step and a tiny versioned bridge (`window.webkit.messageHandlers.orion`) for notifications and Shelf auto-connect. GitHub Actions builds, signs (self-signed cert + Sparkle EdDSA) and publishes releases.

**Tech Stack:** Swift 6.2, SwiftUI + AppKit, WebKit, UserNotifications, Sparkle 2, Swift Testing · Next.js 15 / React 19, Astryx, Supabase Auth, Vitest · GitHub Actions (macOS runner).

**Spec:** `docs/superpowers/specs/2026-11-08-orion-mac-app-design.md` (read Part A before starting any task).

## Global Constraints

- macOS deployment target **26** (`.macOS(.v26)`), Swift tools **6.2**, Swift 6 language mode on every target.
- All Swift follows `.claude/skills/swiftui-pro` — read its `SKILL.md` before writing Swift. No force unwraps, no `DispatchQueue`, `@MainActor` for UI types, `@Observable` not `ObservableObject`, `String(localized:)` for user-facing text.
- Swift tests use **Swift Testing** (`import Testing`, `@Test`, `#expect`), matching `apps/shelf/Tests`.
- App name **Orion**; bundle id **`com.orion.app`**; executable `Orion`; Keychain service **`com.orion.app`**.
- Base URL **`https://orion-workspace-phi.vercel.app`** (Info.plist key `OrionBaseURL`).
- User agent suffix **`OrionMac/<CFBundleShortVersionString>`**.
- Bridge handler name **`orion`**; every message carries **`v: 1`** and a `type`.
- Brand: native UI uses `OrionDesignSystem` (`OrionColor`, `OrionLogo`, fonts); web UI uses Astryx components and tokens only (no raw `<div>`, hex or px — see `AGENTS.md`).
- Copy is plain and short. Exact strings are given in tasks; don't invent others.
- GitHub repo is **public**: never commit certificates, `.p12` files, Sparkle private keys, or tokens. Scratch secrets live in `.context/` (gitignored) and are deleted once stored in GitHub secrets.
- Do not touch the unrelated Vercel project named `orion`. The real one is `orion-workspace`.
- Supabase online project ref: `edpqfigqmtbqzaauhquc`.

## Delivery order (subagents)

| Wave | Tasks | Notes |
|---|---|---|
| 1 | Task 1 (spike, **gate**) | Stop and report to owner if it fails |
| 2 | Task 2 | The rename touches every Swift file; run alone |
| 3 | Task 3 ‖ Task 4 ‖ Task 5 | Web, web, Swift core — no shared files |
| 4 | Task 6 | Needs Task 5 |
| 5 | Task 7 ‖ Task 8 | 7 needs 4+6; 8 needs 6. They touch different files except `AppDelegate.swift` — run 8 after 7 if a subagent can't merge cleanly |
| 6 | Task 9 | Needs 1, 2, 8 |
| 7 | Task 10 | With the owner |

## File map

```
apps/mac/                                  (git mv from apps/shelf)
  Package.swift                            OrionMac: ShelfCore, OrionAppCore, Orion, tests; Sparkle dep
  AppBundle/Info.plist                     Orion bundle; OrionBaseURL; SUFeedURL; SUPublicEDKey
  scripts/build-app.sh                     local + --release builds, signing, Sparkle.framework embed
  scripts/make-signing-cert.sh             one-time self-signed cert → .context
  scripts/install.sh                       first install from GitHub Releases
  Sources/ShelfCore/…                      unchanged (KeychainTokenStore default service → com.orion.app)
  Sources/OrionAppCore/AppConfig.swift
  Sources/OrionAppCore/Origin.swift
  Sources/OrionAppCore/LinkPolicy.swift
  Sources/OrionAppCore/RestorableURL.swift
  Sources/OrionAppCore/BridgeMessage.swift
  Sources/OrionAppCore/NotificationGate.swift
  Sources/OrionAppCore/SiteReachability.swift
  Sources/Orion/App/…                      OrionApp, AppDelegate, AppModel, AppDependencies, LaunchAtLogin*
  Sources/Orion/Shelf/…                    old OrionShelf Connect/Design/Hotkey/Panel/Settings/StatusItem
  Sources/Orion/Window/MainWindowController.swift
  Sources/Orion/Window/WindowModel.swift
  Sources/Orion/Window/WebViewController.swift
  Sources/Orion/Window/OrionRootView.swift
  Sources/Orion/Window/UnreachableView.swift
  Sources/Orion/Bridge/NativeBridge.swift
  Sources/Orion/Bridge/NotificationPresenter.swift
  Sources/Orion/Updates/Updater.swift
  Tests/OrionAppCoreTests/…
  Tests/OrionTests/…                       (renamed from OrionShelfTests)
apps/web/src/features/auth/actions.ts                    + verifyEmailCode
apps/web/src/features/auth/components/email-code-form.tsx
apps/web/src/app/(auth)/sign-in/page.tsx                 code step, hide Google in app
apps/web/src/features/native/bridge.ts
apps/web/src/features/native/task-notices.ts
apps/web/src/features/native/use-native-task-notifications.ts
apps/web/src/features/native/native-bridge.tsx
apps/web/src/features/prd/components/room-task-status-provider.tsx   + roomName, notices
apps/web/src/app/(app)/[workspaceId]/layout.tsx          + <NativeBridge>
apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx  pass roomName
supabase/templates/magic-link.html, supabase/config.toml
.github/workflows/mac-release.yml
docs/runbooks/orion-mac.md
```

---

### Task 1: Spike — self-signed Sparkle update round-trip (GATE)

Proves the riskiest assumption before anything else is built: a Sparkle update, signed with a home-made certificate, installs over the previous version **without** Keychain or notification prompts. Throwaway code lives in `.context/sparkle-spike/`; the only lasting outputs are the cert script, the cert/keys in `.context/orion-mac-signing/`, and `REPORT.md`.

**Files:**
- Create: `apps/shelf/scripts/make-signing-cert.sh` (moves with the folder in Task 2)
- Create (scratch, not committed): `.context/sparkle-spike/**`, `.context/orion-mac-signing/**`, `.context/sparkle-spike/REPORT.md`

**Interfaces:**
- Produces: certificate common name **`Orion Self-Signed`** in the login keychain; `.context/orion-mac-signing/orion-signing.p12` + `p12-password.txt`; `.context/orion-mac-signing/cert-sha256.txt` (uppercase hex, no colons); Sparkle EdDSA keys (`sparkle-private.txt`, `sparkle-public.txt`); `REPORT.md` with: PASS/FAIL, macOS runner label to use (Task 9), Sparkle version used, and any build-script lessons (rpath, framework signing).

- [ ] **Step 1: Write the cert script**

```bash
#!/bin/bash
# Creates the free, home-made code-signing certificate "Orion Self-Signed".
# No Apple account. Run once; the .p12 goes into GitHub secrets, never git.
set -euo pipefail
OUT="${1:-$(git rev-parse --show-toplevel)/.context/orion-mac-signing}"
mkdir -p "$OUT"
cd "$OUT"
NAME="Orion Self-Signed"
PASSWORD="$(openssl rand -hex 24)"
cat > cert.cnf <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
openssl req -x509 -newkey rsa:3072 -nodes -keyout key.pem -out cert.pem -days 3650 -config cert.cnf
openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem -name "$NAME" -out orion-signing.p12 -passout "pass:$PASSWORD"
printf '%s' "$PASSWORD" > p12-password.txt
openssl x509 -in cert.pem -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' > cert-sha256.txt
security import orion-signing.p12 -k "$HOME/Library/Keychains/login.keychain-db" -P "$PASSWORD" -T /usr/bin/codesign
rm -f key.pem cert.cnf
echo "Created $NAME. Fingerprint: $(cat cert-sha256.txt)"
```

- [ ] **Step 2: Run it and confirm the identity is usable**

Run: `bash apps/shelf/scripts/make-signing-cert.sh && security find-identity -p codesigning | grep "Orion Self-Signed"`
Expected: one line containing `"Orion Self-Signed"` (it may say `CSSMERR_TP_NOT_TRUSTED` — that's fine; codesign doesn't need trust). If it doesn't appear under `-v`-less listing, run `security find-certificate -c "Orion Self-Signed"` and record what you saw in REPORT.md.

- [ ] **Step 3: Generate Sparkle keys**

Download the latest Sparkle 2 release tarball (`https://github.com/sparkle-project/Sparkle/releases`) into `.context/sparkle-spike/sparkle-tools/` (its own empty directory). Run `./bin/generate_keys --account orion-spike` then `./bin/generate_keys --account orion-spike -x .context/orion-mac-signing/sparkle-private.txt` and `./bin/generate_keys --account orion-spike -p > .context/orion-mac-signing/sparkle-public.txt`.
Expected: two non-empty files.

- [ ] **Step 4: Build a two-version spike app**

In `.context/sparkle-spike/app/` create a minimal SwiftPM executable `SparkleSpike` (macOS 26) depending on Sparkle (`.package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0")`) with an `NSApplicationDelegate` that creates `SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)`, stores one Keychain generic password (service `spike.orion`) on first launch and reads it on later launches (log result to `~/Library/Logs/sparkle-spike.log`), and requests notification authorization. Bundle it by hand like `apps/shelf/scripts/build-app.sh` does, plus:

```bash
mkdir -p "$APP/Contents/Frameworks"
cp -R "$BIN_DIR/Sparkle.framework" "$APP/Contents/Frameworks/"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$APP/Contents/MacOS/SparkleSpike"
codesign --force --options runtime --sign "Orion Self-Signed" "$APP/Contents/Frameworks/Sparkle.framework/Versions/B/XPCServices/"*.xpc
codesign --force --options runtime --sign "Orion Self-Signed" "$APP/Contents/Frameworks/Sparkle.framework/Versions/B/Autoupdate"
codesign --force --options runtime --sign "Orion Self-Signed" "$APP/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app"
codesign --force --options runtime --sign "Orion Self-Signed" "$APP/Contents/Frameworks/Sparkle.framework"
codesign --force --options runtime --sign "Orion Self-Signed" "$APP"
```

Info.plist: `CFBundleVersion` 1 (then 2), `SUFeedURL` = `http://127.0.0.1:8765/appcast.xml`, `SUPublicEDKey` = contents of `sparkle-public.txt`, and `NSAppTransportSecurity › NSAllowsLocalNetworking = true`.

- [ ] **Step 5: Serve version 2 and update**

Build version 1 → install to `~/Applications/SparkleSpike.app`, launch, allow notifications, confirm the log says "keychain write ok". Build version 2 → zip with `ditto -c -k --keepParent` → `./bin/generate_appcast --ed-key-file .context/orion-mac-signing/sparkle-private.txt <dir>` → `python3 -m http.server 8765 -d <dir>`. In the running v1 app trigger "Check for Updates" (or relaunch), install, relaunch.
Expected PASS, all of: app now reports `CFBundleVersion` 2; log says "keychain read ok" with **no** Keychain password dialog; System Settings › Notifications still lists the app as allowed; no Gatekeeper "can't be opened" dialog.

- [ ] **Step 6: Check the runner label**

Run: `gh api repos/actions/runner-images/contents/README.md --jq .content | base64 -d | grep -i "macos-26"`
Record in REPORT.md whether `macos-26` (or `macos-latest` with the macOS 26 SDK) is available. If not, Task 9 uses the local-release fallback (spec B13) — **ask the owner first**.

- [ ] **Step 7: Write REPORT.md, then commit the script only**

```bash
git add apps/shelf/scripts/make-signing-cert.sh
git commit -m "chore(mac): script for the self-signed Orion code-signing certificate"
```

**If Step 5 fails: stop. Report what failed (exact dialog text, log lines) to the owner. Do not start Task 2.** Uninstall the spike app and delete `~/Library/Logs/sparkle-spike.log` either way.

---

### Task 2: Move Shelf into `apps/mac` and rename it Orion

Pure restructuring; behaviour is unchanged except the name, bundle id, Keychain service and base URL source. All existing tests must stay green.

**Files:**
- Move: `apps/shelf` → `apps/mac` (`git mv`)
- Move: `apps/mac/Sources/OrionShelf/App/*` → `apps/mac/Sources/Orion/App/`; every other `Sources/OrionShelf/<Dir>` → `apps/mac/Sources/Orion/Shelf/<Dir>`; `OrionShelfApp.swift` → `OrionApp.swift`
- Move: `Tests/OrionShelfTests` → `Tests/OrionTests`
- Create: `apps/mac/Sources/OrionAppCore/AppConfig.swift`, `apps/mac/Tests/OrionAppCoreTests/AppConfigTests.swift`
- Modify: `Package.swift`, `AppBundle/Info.plist`, `scripts/build-app.sh`, `README.md`, `Sources/ShelfCore/Auth/KeychainTokenStore.swift:10`, `Sources/Orion/App/AppModel.swift`, `Sources/Orion/App/AppDependencies.swift`, `Tests/OrionTests/TestDependencies.swift`, repo-wide references to `apps/shelf` (`grep -rn "apps/shelf" --exclude-dir=node_modules --exclude-dir=.git .` — update docs, CI, `.claude` skills references, `pnpm-workspace`/turbo configs if any)

**Interfaces:**
- Produces: `public enum AppConfig { public static func baseURL(info: [String: Any]?, defaults: UserDefaults) -> URL }` in `OrionAppCore`; `AppDependencies.defaultBaseURL: URL`; test helper `TestDependencies(...)` unchanged signature; executable target `Orion`; library target `OrionAppCore`.

- [ ] **Step 1: Move the folders**

```bash
git mv apps/shelf apps/mac
mkdir -p apps/mac/Sources/Orion/Shelf
git mv apps/mac/Sources/OrionShelf/App apps/mac/Sources/Orion/App
for d in Connect Design Hotkey Panel Settings StatusItem; do git mv "apps/mac/Sources/OrionShelf/$d" "apps/mac/Sources/Orion/Shelf/$d"; done
git mv apps/mac/Sources/Orion/App/OrionShelfApp.swift apps/mac/Sources/Orion/App/OrionApp.swift
git mv apps/mac/Tests/OrionShelfTests apps/mac/Tests/OrionTests
```

In `OrionApp.swift` rename `struct OrionShelfApp` → `struct OrionApp`. In every test file replace `@testable import OrionShelf` with `@testable import Orion`.

- [ ] **Step 2: Rewrite `Package.swift`**

```swift
// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "OrionMac",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "ShelfCore", targets: ["ShelfCore"]),
        .library(name: "OrionAppCore", targets: ["OrionAppCore"]),
        .executable(name: "Orion", targets: ["Orion"]),
    ],
    dependencies: [
        .package(path: "../../packages/orion-design-system"),
    ],
    targets: [
        .target(name: "ShelfCore", swiftSettings: [.swiftLanguageMode(.v6)]),
        .target(name: "OrionAppCore", swiftSettings: [.swiftLanguageMode(.v6)]),
        .executableTarget(
            name: "Orion",
            dependencies: [
                "ShelfCore",
                "OrionAppCore",
                .product(name: "OrionDesignSystem", package: "orion-design-system"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "ShelfTestSupport",
            dependencies: ["ShelfCore"],
            path: "Tests/ShelfTestSupport",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(name: "ShelfCoreTests", dependencies: ["ShelfCore", "ShelfTestSupport"], swiftSettings: [.swiftLanguageMode(.v6)]),
        .testTarget(name: "OrionAppCoreTests", dependencies: ["OrionAppCore"], swiftSettings: [.swiftLanguageMode(.v6)]),
        .testTarget(name: "OrionTests", dependencies: ["Orion", "ShelfCore", "ShelfTestSupport"], swiftSettings: [.swiftLanguageMode(.v6)]),
    ]
)
```

(Sparkle is added in Task 9, not now.)

- [ ] **Step 3: Write the failing AppConfig test**

`apps/mac/Tests/OrionAppCoreTests/AppConfigTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct AppConfigTests {
    private func defaults() -> UserDefaults {
        UserDefaults(suiteName: "orion-config-\(UUID().uuidString)") ?? .standard
    }

    @Test func readsTheBaseURLFromInfoPlist() {
        let url = AppConfig.baseURL(info: ["OrionBaseURL": "https://orion-workspace-phi.vercel.app"], defaults: defaults())
        #expect(url.absoluteString == "https://orion-workspace-phi.vercel.app")
    }

    @Test func aDebugOverrideWins() {
        let store = defaults()
        store.set("http://127.0.0.1:3000", forKey: AppConfig.overrideKey)
        let url = AppConfig.baseURL(info: ["OrionBaseURL": "https://orion-workspace-phi.vercel.app"], defaults: store)
        #expect(url.absoluteString == "http://127.0.0.1:3000")
    }

    @Test func ignoresNonWebOverridesAndFallsBack() {
        let store = defaults()
        store.set("file:///etc/passwd", forKey: AppConfig.overrideKey)
        #expect(AppConfig.baseURL(info: nil, defaults: store) == AppConfig.fallbackBaseURL)
    }
}
```

- [ ] **Step 4: Run it to see it fail**

Run: `cd apps/mac && swift test --filter OrionAppCoreTests`
Expected: FAIL — `cannot find 'AppConfig' in scope`.

- [ ] **Step 5: Implement AppConfig**

`apps/mac/Sources/OrionAppCore/AppConfig.swift`:

```swift
import Foundation

/// Where Orion Online lives. Info.plist sets it; a UserDefaults override lets
/// developers point a local build at `pnpm dev`.
public enum AppConfig {
    public static let infoKey = "OrionBaseURL"
    public static let overrideKey = "OrionBaseURLOverride"
    public static let fallbackBaseURL: URL = {
        guard let url = URL(string: "https://orion-workspace-phi.vercel.app") else {
            preconditionFailure("The built-in Orion address is invalid")
        }
        return url
    }()

    public static func baseURL(info: [String: Any]?, defaults: UserDefaults) -> URL {
        if let override = defaults.string(forKey: overrideKey).flatMap(webURL) { return override }
        if let configured = (info?[infoKey] as? String).flatMap(webURL) { return configured }
        return fallbackBaseURL
    }

    private static func webURL(_ text: String) -> URL? {
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http", url.host() != nil else { return nil }
        return url
    }
}
```

- [ ] **Step 6: Point the Shelf model at the configured base URL**

In `AppDependencies.swift` add `let defaultBaseURL: URL` (after `deviceName`) and in `live`:

```swift
defaultBaseURL: AppConfig.baseURL(info: Bundle.main.infoDictionary, defaults: .standard),
```

and change `deviceName` to `String(localized: "Orion on \(Host.current().localizedName ?? String(localized: "Mac"))")`. Add `import OrionAppCore`.

In `AppModel.swift`: delete `static let defaultBaseURL`, and in `init` replace `?? Self.defaultBaseURL` with `?? dependencies.defaultBaseURL`. Change the launch-at-login failure text to `"Couldn't turn on launch at login. Add Orion in System Settings → General → Login Items."`.

In `TestDependencies.makeModel` pass the new parameter. Add at file top (no force unwraps):

```swift
private let testBaseURL: URL = {
    guard let url = URL(string: "https://orion.test") else { preconditionFailure("bad test URL") }
    return url
}()
```

and pass `defaultBaseURL: testBaseURL`. Fix any test that asserted on `AppModel.defaultBaseURL` to use `testBaseURL`.

- [ ] **Step 7: Keychain service and bundle**

`KeychainTokenStore.swift:10`: `service: String = "com.orion.app"`.

`AppBundle/Info.plist`: `CFBundleIdentifier` → `com.orion.app`; `CFBundleName`/`CFBundleDisplayName` → `Orion`; `CFBundleExecutable` → `Orion`; add `<key>OrionBaseURL</key><string>https://orion-workspace-phi.vercel.app</string>`. Keep `LSUIElement` **for now** (Task 8 removes it).

`scripts/build-app.sh`: product `Orion`, app `build/Orion.app`, executable `Orion`, install path `$HOME/Applications/Orion.app`, comment "Builds Orion.app". Keep ad-hoc signing for now (Task 9 changes it).

- [ ] **Step 8: README and references**

Rewrite `apps/mac/README.md` title to "Orion (Mac app)", install command `cd apps/mac && ./scripts/build-app.sh`, app path `~/Applications/Orion.app`. Update every `apps/shelf` reference found by the grep in **Files**.

- [ ] **Step 9: Run everything**

Run: `cd apps/mac && swift build && swift test`
Expected: build succeeds; all ShelfCore, OrionAppCore and Orion tests PASS (same count as before plus 3).

- [ ] **Step 10: Commit**

```bash
git add -A apps/mac apps/shelf
git add -u .
git commit -m "refactor(mac): move Shelf into apps/mac as the Orion app"
```

---

### Task 3: Web — sign in with a 6-digit email code

**Files:**
- Modify: `apps/web/src/features/auth/actions.ts` (add `verifyEmailCode`)
- Test: `apps/web/src/features/auth/actions.test.ts`
- Create: `apps/web/src/features/auth/components/email-code-form.tsx`
- Modify: `apps/web/src/app/(auth)/sign-in/page.tsx`
- Test: `apps/web/src/app/(auth)/sign-in/page.test.tsx`
- Create: `apps/web/src/features/native/user-agent.ts`, test `apps/web/src/features/native/user-agent.test.ts`
- Create: `supabase/templates/magic-link.html`; Modify: `supabase/config.toml`

**Interfaces:**
- Produces: `export async function verifyEmailCode(prev: AuthActionState, formData: FormData): Promise<AuthActionState>` (fields `email`, `code`, `next`); `export function isOrionMacUserAgent(userAgent: string): boolean` in `features/native/user-agent.ts` (Task 4 reuses it).

- [ ] **Step 1: Failing action tests**

Append to `actions.test.ts` — extend the hoisted mocks with `verifyOtp: vi.fn()` and the `createClient` resolved value with `verifyOtp: mocks.verifyOtp`, import `verifyEmailCode`, then:

```ts
describe("verifyEmailCode", () => {
  function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  it("signs in with a valid code and redirects to a safe next path", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: " Person@Example.com ", code: "123456", next: "/abc" }));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "person@example.com", token: "123456", type: "email" });
    expect(mocks.redirect).toHaveBeenCalledWith("/abc");
  });

  it("falls back to / for an unsafe next path", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: "person@example.com", code: "123456", next: "https://evil.example" }));
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it.each(["12345", "1234567", "abcdef", ""])("rejects malformed code %s without calling Supabase", async (code) => {
    const result = await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: "person@example.com", code }));
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "error", message: "Enter the 6-digit code from the email." });
  });

  it("explains a wrong or expired code", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const result = await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: "person@example.com", code: "654321" }));
    expect(result).toEqual({
      status: "error",
      message: "That code didn't work. Check the latest email or send a new one.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter web exec vitest run src/features/auth/actions.test.ts`
Expected: FAIL — `verifyEmailCode is not a function` (or not exported).

- [ ] **Step 3: Implement `verifyEmailCode`** (append to `actions.ts`)

```ts
const CODE_PATTERN = /^\d{6}$/;

export async function verifyEmailCode(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readEmail(formData);
  const codeValue = formData.get("code");
  const code = typeof codeValue === "string" ? codeValue.trim() : "";

  if (!EMAIL_PATTERN.test(email) || !CODE_PATTERN.test(code)) {
    return { status: "error", message: "Enter the 6-digit code from the email." };
  }

  noStore();
  const supabase = await createClient(new Headers());
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error) {
    return {
      status: "error",
      message: "That code didn't work. Check the latest email or send a new one.",
    };
  }

  redirect(getSafeRedirectPath(formData.get("next")));
}
```

Also change the `requestMagicLink` success message to `"Check your email for a sign-in link and code."`, and update the existing test that asserts the old text.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm --filter web exec vitest run src/features/auth/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: User-agent helper, test first**

`apps/web/src/features/native/user-agent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isOrionMacUserAgent } from "./user-agent";

describe("isOrionMacUserAgent", () => {
  it("recognises the Orion Mac app", () => {
    expect(isOrionMacUserAgent("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 OrionMac/1.0.12")).toBe(true);
  });
  it.each(["Mozilla/5.0 Safari/605.1.15", "NotOrionMac/1.0", ""])("ignores %s", (ua) => {
    expect(isOrionMacUserAgent(ua)).toBe(false);
  });
});
```

`apps/web/src/features/native/user-agent.ts`:

```ts
const ORION_MAC = /(?:^|\s)OrionMac\/\S+/;

export function isOrionMacUserAgent(userAgent: string): boolean {
  return ORION_MAC.test(userAgent);
}
```

Run: `pnpm --filter web exec vitest run src/features/native/user-agent.test.ts` → PASS.

- [ ] **Step 6: Failing page tests**

Add to `page.test.tsx` (follow the file's existing mock setup for `@/features/auth/actions`; add `verifyEmailCode: vi.fn()` to that mock):

```tsx
describe("MagicLinkForm code step", () => {
  it("asks for the 6-digit code once the email is sent", () => {
    render(
      <MagicLinkForm state={{ status: "success", message: "sent" }} action={vi.fn()} nextPath="/" />,
    );
    expect(screen.getByLabelText("6-digit code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not show the code field before the email is sent", () => {
    render(<MagicLinkForm state={{ status: "idle" }} action={vi.fn()} nextPath="/" />);
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });
});

describe("SignInPage inside the Orion Mac app", () => {
  it("hides Continue with Google", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 OrionMac/1.0.3");
    await act(async () => {
      render(<SignInPage searchParams={Promise.resolve({})} />);
    });
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
```

Run: `pnpm --filter web exec vitest run "src/app/(auth)/sign-in/page.test.tsx"` → FAIL.

- [ ] **Step 7: Code form component**

`apps/web/src/features/auth/components/email-code-form.tsx`:

```tsx
"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { verifyEmailCode } from "@/features/auth/actions";

function SignInButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" label="Sign in" variant="primary" size="lg" width="100%" isLoading={pending} />;
}

export function EmailCodeForm({ email, nextPath }: { email: string; nextPath: string }) {
  const [state, action] = useActionState(verifyEmailCode, { status: "idle" as const });
  const [code, setCode] = useState("");

  return (
    <form action={action}>
      <FormLayout>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={nextPath} />
        <TextInput
          label="6-digit code"
          size="lg"
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          htmlName="code"
          placeholder="123456"
          autoComplete="one-time-code"
          inputMode="numeric"
        />
        {state.status === "error" && state.message ? <Banner status="error" title={state.message} /> : null}
        <SignInButton />
      </FormLayout>
    </form>
  );
}
```

Before writing: run `pnpm exec astryx component TextInput` and confirm `autoComplete` / `inputMode` prop names; if TextInput lacks them, drop those two props (don't hand-roll an input). Hidden `<input type="hidden">` elements are form plumbing, not layout — allowed.

- [ ] **Step 8: Wire into the sign-in page**

In `page.tsx`:
1. Import `EmailCodeForm` and `isOrionMacUserAgent`, and `useSyncExternalStore` from React.
2. Inside `MagicLinkForm`, change the return to render the code form after the email form when `linkSent`:

```tsx
return (
  <VStack gap={4}>
    <form action={action}>
      {/* existing FormLayout unchanged */}
    </form>
    {linkSent ? <EmailCodeForm email={email.trim().toLowerCase()} nextPath={nextPath} /> : null}
  </VStack>
);
```

3. In `SignInPage`:

```tsx
const inOrionApp = useSyncExternalStore(
  () => () => {},
  () => isOrionMacUserAgent(navigator.userAgent),
  () => false,
);
```

and wrap the `<Divider label="or continue with" />` and Google `<form>` in `{inOrionApp ? null : (<>…</>)}`.

- [ ] **Step 9: Run page tests**

Run: `pnpm --filter web exec vitest run "src/app/(auth)/sign-in/page.test.tsx"`
Expected: PASS (all old tests still pass).

- [ ] **Step 10: Email template carries the code**

`supabase/templates/magic-link.html`:

```html
<h2>Sign in to Orion</h2>
<p>Your code is <strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .ConfirmationURL }}">click here to sign in</a>.</p>
<p>The code and link work once and expire in an hour.</p>
```

`supabase/config.toml`, after the `[auth.email]` block:

```toml
[auth.email.template.magic_link]
subject = "Your Orion sign-in code"
content_path = "./supabase/templates/magic-link.html"
```

(The online project is updated in Task 9.)

- [ ] **Step 11: Full web checks and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: all pass.

```bash
git add apps/web/src/features/auth apps/web/src/features/native/user-agent.ts apps/web/src/features/native/user-agent.test.ts "apps/web/src/app/(auth)/sign-in" supabase/templates/magic-link.html supabase/config.toml
git commit -m "feat(auth): sign in with a 6-digit email code; hide Google in the Mac app"
```

---

### Task 4: Web — native bridge, AI-finished notices, Shelf connect

**Files:**
- Create: `apps/web/src/features/native/bridge.ts` + `bridge.test.ts`
- Create: `apps/web/src/features/native/task-notices.ts` + `task-notices.test.ts`
- Create: `apps/web/src/features/native/use-native-task-notifications.ts`
- Create: `apps/web/src/features/native/native-bridge.tsx` + `native-bridge.test.tsx`
- Modify: `apps/web/src/features/prd/components/room-task-status-provider.tsx` (add `roomName?: string` prop; call the hook after `statuses` state at line ~95)
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx:189` (pass `roomName={data.room.name}`)
- Modify: `apps/web/src/app/(app)/[workspaceId]/layout.tsx` (render `<NativeBridge workspaceId={workspaceId} />` just before `{children}` inside `<AppFrame>`)

**Interfaces:**
- Consumes: `RoomTaskStatus`, `isTerminalTaskStatus` from `@/features/ai/room-task-status`; `createShelfConnectCode(workspaceId)` from `@/features/inspiration/shelf-connection`.
- Produces (the wire contract Task 7 decodes — **exact keys**):
  - `{ v: 1, type: "ready", workspaceId: string | null }`
  - `{ v: 1, type: "notify", title: string, body: string, path: string }`
  - `{ v: 1, type: "shelfConnectCode", code: string }`
  - `{ v: 1, type: "shelfConnectFailed", message: string }`
  - Global `window.__orionNative = { requestShelfConnect(): void }` (native calls it).

- [ ] **Step 1: Bridge tests**

`bridge.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { postToNative, registerNativeHandlers } from "./bridge";

type OrionWindow = Window & { webkit?: unknown; __orionNative?: unknown };

afterEach(() => {
  delete (window as OrionWindow).webkit;
  delete (window as OrionWindow).__orionNative;
});

describe("native bridge", () => {
  it("does nothing outside the Mac app", () => {
    expect(() => postToNative({ v: 1, type: "ready", workspaceId: null })).not.toThrow();
  });

  it("posts messages to the orion handler inside the app", () => {
    const postMessage = vi.fn();
    (window as OrionWindow).webkit = { messageHandlers: { orion: { postMessage } } };
    postToNative({ v: 1, type: "notify", title: "Screens ready", body: "In Home", path: "/w/rooms/r" });
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "notify", title: "Screens ready", body: "In Home", path: "/w/rooms/r" });
  });

  it("swallows handler errors", () => {
    (window as OrionWindow).webkit = { messageHandlers: { orion: { postMessage: () => { throw new Error("gone"); } } } };
    expect(() => postToNative({ v: 1, type: "ready", workspaceId: null })).not.toThrow();
  });

  it("registers and unregisters handlers the app can call", () => {
    const requestShelfConnect = vi.fn();
    const unregister = registerNativeHandlers({ requestShelfConnect });
    (window as OrionWindow & { __orionNative: { requestShelfConnect: () => void } }).__orionNative.requestShelfConnect();
    expect(requestShelfConnect).toHaveBeenCalledOnce();
    unregister();
    expect((window as OrionWindow).__orionNative).toBeUndefined();
  });
});
```

Run: `pnpm --filter web exec vitest run src/features/native/bridge.test.ts` → FAIL (module missing).

- [ ] **Step 2: Bridge implementation**

`bridge.ts`:

```ts
export type NativeMessage =
  | { v: 1; type: "ready"; workspaceId: string | null }
  | { v: 1; type: "notify"; title: string; body: string; path: string }
  | { v: 1; type: "shelfConnectCode"; code: string }
  | { v: 1; type: "shelfConnectFailed"; message: string };

export type NativeHandlers = { requestShelfConnect: () => void };

type MessageHandler = { postMessage: (message: NativeMessage) => void };
type BridgeWindow = Window & {
  webkit?: { messageHandlers?: { orion?: MessageHandler } };
  __orionNative?: NativeHandlers;
};

function bridgeWindow(): BridgeWindow | null {
  return typeof window === "undefined" ? null : (window as BridgeWindow);
}

export function postToNative(message: NativeMessage): void {
  try {
    bridgeWindow()?.webkit?.messageHandlers?.orion?.postMessage(message);
  } catch {
    // The app may be mid-reload; a lost notice is harmless.
  }
}

export function registerNativeHandlers(handlers: NativeHandlers): () => void {
  const target = bridgeWindow();
  if (!target) return () => {};
  target.__orionNative = handlers;
  return () => {
    if (target.__orionNative === handlers) delete target.__orionNative;
  };
}
```

Run the test → PASS.

- [ ] **Step 3: Task-notice tests (pure function)**

`task-notices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { taskCompletionNotices } from "./task-notices";

function task(taskId: string, kind: RoomTaskStatus["kind"], status: RoomTaskStatus["status"]): RoomTaskStatus {
  return {
    taskId, kind, status,
    sourceMessageId: null, initiatingUserId: "u", provider: "claude", agentKind: "product",
    createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z",
  } as RoomTaskStatus;
}

describe("taskCompletionNotices", () => {
  it("says nothing on the first read (baseline)", () => {
    expect(taskCompletionNotices(null, [task("a", "room_reply", "completed")], "Home")).toEqual([]);
  });

  it("announces a reply that finished since the last read", () => {
    const previous = new Map([["a", "running" as const]]);
    expect(taskCompletionNotices(previous, [task("a", "room_reply", "completed")], "Home")).toEqual([
      { title: "Orion replied", body: "In Home" },
    ]);
  });

  it("announces screens and user flows", () => {
    const previous = new Map([["s", "queued" as const], ["f", "running" as const]]);
    const notices = taskCompletionNotices(
      previous,
      [task("s", "design_screen_generate", "completed"), task("f", "user_flow_generate", "completed")],
      "Home",
    );
    expect(notices).toEqual([
      { title: "Screens ready", body: "New screens in Home" },
      { title: "User flow ready", body: "In Home" },
    ]);
  });

  it("ignores failures, other kinds, and tasks first seen already completed", () => {
    const previous = new Map([["a", "running" as const], ["p", "running" as const]]);
    expect(
      taskCompletionNotices(
        previous,
        [task("a", "room_reply", "failed"), task("p", "prd_generate", "completed"), task("new", "room_reply", "completed")],
        "Home",
      ),
    ).toEqual([]);
  });

  it("uses a neutral body when the room name is unknown", () => {
    const previous = new Map([["a", "running" as const]]);
    expect(taskCompletionNotices(previous, [task("a", "room_reply", "completed")], undefined)).toEqual([
      { title: "Orion replied", body: "In your room" },
    ]);
  });
});
```

Before running, check `RoomTaskStatus["provider"]`/`agentKind` literal values in `packages/contracts/src/ai.ts` and fix the fixture literals if `"claude"`/`"product"` aren't valid members (keep the `as RoomTaskStatus` cast out if they are).

Run → FAIL.

- [ ] **Step 4: Task-notice implementation**

`task-notices.ts`:

```ts
import type { AITaskStatus } from "@meld/contracts";
import { isTerminalTaskStatus, type RoomTaskStatus } from "@/features/ai/room-task-status";

export type TaskNotice = { title: string; body: string };

function noticeFor(kind: RoomTaskStatus["kind"], where: string): TaskNotice | null {
  switch (kind) {
    case "room_reply":
      return { title: "Orion replied", body: `In ${where}` };
    case "design_screen_generate":
      return { title: "Screens ready", body: `New screens in ${where}` };
    case "user_flow_generate":
      return { title: "User flow ready", body: `In ${where}` };
    default:
      return null;
  }
}

/** Tasks that went from in-flight to completed between two reads. `previous === null` is the first read. */
export function taskCompletionNotices(
  previous: ReadonlyMap<string, AITaskStatus> | null,
  next: readonly RoomTaskStatus[],
  roomName: string | undefined,
): TaskNotice[] {
  if (previous === null) return [];
  const where = roomName?.trim() ? roomName.trim() : "your room";
  const notices: TaskNotice[] = [];
  for (const task of next) {
    const before = previous.get(task.taskId);
    if (before === undefined || isTerminalTaskStatus(before) || task.status !== "completed") continue;
    const notice = noticeFor(task.kind, where);
    if (notice) notices.push(notice);
  }
  return notices;
}
```

Run → PASS.

- [ ] **Step 5: Hook + provider wiring**

`use-native-task-notifications.ts`:

```ts
"use client";

import type { AITaskStatus } from "@meld/contracts";
import { useEffect, useRef } from "react";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { postToNative } from "./bridge";
import { taskCompletionNotices } from "./task-notices";

export function useNativeTaskNotifications(statuses: readonly RoomTaskStatus[], roomName: string | undefined, hasCompletedInitialRead: boolean) {
  const previous = useRef<Map<string, AITaskStatus> | null>(null);

  useEffect(() => {
    if (!hasCompletedInitialRead) return;
    const notices = taskCompletionNotices(previous.current, statuses, roomName);
    const path = `${window.location.pathname}${window.location.search}`;
    for (const notice of notices) postToNative({ v: 1, type: "notify", ...notice, path });
    previous.current = new Map(statuses.map((task) => [task.taskId, task.status]));
  }, [statuses, roomName, hasCompletedInitialRead]);
}
```

In `room-task-status-provider.tsx`: add `roomName?: string` to the props type and destructuring; after the existing `hasCompletedInitialRead` value is available (search the file for it), call `useNativeTaskNotifications(statuses, roomName, hasCompletedInitialRead);`. In the room `page.tsx`, add `roomName={data.room.name}` to `<RoomTaskStatusProvider …>`.

Add one provider test to `room-task-status-provider.test.tsx` following its existing fetch-mock pattern: first fetch returns a `room_reply` `running`, second returns it `completed`; with `window.webkit.messageHandlers.orion.postMessage` mocked, advance the poll and expect a call with `{ v: 1, type: "notify", title: "Orion replied", body: "In Home", path: expect.any(String) }`.

Run: `pnpm --filter web exec vitest run src/features/prd/components/room-task-status-provider.test.tsx` → PASS.

- [ ] **Step 6: `<NativeBridge>` component, test first**

`native-bridge.test.tsx`:

```tsx
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createShelfConnectCode = vi.hoisted(() => vi.fn());
vi.mock("@/features/inspiration/shelf-connection", () => ({ createShelfConnectCode }));

import { NativeBridge } from "./native-bridge";

type TestWindow = Window & { webkit?: unknown; __orionNative?: { requestShelfConnect: () => void } };

afterEach(() => {
  delete (window as TestWindow).webkit;
  vi.clearAllMocks();
});

describe("NativeBridge", () => {
  it("tells the app it is ready, then hands over a Shelf code on request", async () => {
    const postMessage = vi.fn();
    (window as TestWindow).webkit = { messageHandlers: { orion: { postMessage } } };
    createShelfConnectCode.mockResolvedValue({ status: "created", code: "ABCD-1234", expiresAt: "x" });

    render(<NativeBridge workspaceId="11111111-1111-1111-1111-111111111111" />);
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "ready", workspaceId: "11111111-1111-1111-1111-111111111111" });

    await act(async () => {
      (window as TestWindow).__orionNative?.requestShelfConnect();
    });
    expect(createShelfConnectCode).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "shelfConnectCode", code: "ABCD-1234" });
  });

  it("reports a failed code", async () => {
    const postMessage = vi.fn();
    (window as TestWindow).webkit = { messageHandlers: { orion: { postMessage } } };
    createShelfConnectCode.mockResolvedValue({ status: "error", message: "Couldn't make a code. Try again." });
    render(<NativeBridge workspaceId="11111111-1111-1111-1111-111111111111" />);
    await act(async () => {
      (window as TestWindow).__orionNative?.requestShelfConnect();
    });
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "shelfConnectFailed", message: "Couldn't make a code. Try again." });
  });

  it("renders nothing and posts nothing in a normal browser", () => {
    const { container } = render(<NativeBridge workspaceId="11111111-1111-1111-1111-111111111111" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

`native-bridge.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { createShelfConnectCode } from "@/features/inspiration/shelf-connection";
import { postToNative, registerNativeHandlers } from "./bridge";

/** Invisible. Lets the Orion Mac app know who is signed in and lets it ask for a Shelf code. */
export function NativeBridge({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    const unregister = registerNativeHandlers({
      requestShelfConnect: () => {
        void createShelfConnectCode(workspaceId)
          .then((result) =>
            postToNative(
              result.status === "created"
                ? { v: 1, type: "shelfConnectCode", code: result.code }
                : { v: 1, type: "shelfConnectFailed", message: result.message },
            ),
          )
          .catch(() => postToNative({ v: 1, type: "shelfConnectFailed", message: "Couldn't make a code. Try again." }));
      },
    });
    postToNative({ v: 1, type: "ready", workspaceId });
    return unregister;
  }, [workspaceId]);

  return null;
}
```

In `[workspaceId]/layout.tsx` import `NativeBridge` and render `<NativeBridge workspaceId={workspaceId} />` immediately before `{children}`. Update `layout.test.tsx` only if it snapshots children.

- [ ] **Step 7: Full web checks and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

```bash
git add apps/web/src/features/native apps/web/src/features/prd/components "apps/web/src/app/(app)/[workspaceId]"
git commit -m "feat(native): bridge for the Orion Mac app — AI-finished notices and Shelf connect codes"
```

---

### Task 5: OrionAppCore — link policy, restorable URL, bridge decoding, notification gate, reachability

All pure logic, all unit-tested. No AppKit/WebKit imports in this target.

**Files:**
- Create: `apps/mac/Sources/OrionAppCore/{Origin,LinkPolicy,RestorableURL,BridgeMessage,NotificationGate,SiteReachability}.swift`
- Test: `apps/mac/Tests/OrionAppCoreTests/{LinkPolicyTests,RestorableURLTests,BridgeMessageTests,NotificationGateTests,SiteReachabilityTests}.swift`

**Interfaces:**
- Produces:
  - `public func isSameOrigin(_ a: URL, _ b: URL) -> Bool`
  - `public enum LinkDecision: Equatable, Sendable { case loadInApp, openExternally, ignore }`; `public struct LinkPolicy: Sendable { public init(appOrigin: URL); public func decide(_ url: URL) -> LinkDecision }`
  - `public enum RestorableURL { public static func restorable(_ url: URL?, appOrigin: URL) -> URL?; public static func resolve(path: String, appOrigin: URL) -> URL? }`
  - `public enum BridgeMessage: Equatable, Sendable { case ready(workspaceID: UUID?); case notify(title: String, body: String, path: String); case shelfConnectCode(String); case shelfConnectFailed(String); public static func decode(_ body: Any) -> BridgeMessage? }`
  - `public enum NotificationGate { public static func shouldPresent(appIsActive: Bool, windowIsKey: Bool) -> Bool }`
  - `public enum SiteProblem: Equatable, Sendable { case offline, serverError }`; `public enum SiteReachability { public static func problem(for error: any Error) -> SiteProblem?; public static func problem(forHTTPStatus status: Int) -> SiteProblem? }`

- [ ] **Step 1: Write all five test files**

`LinkPolicyTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct LinkPolicyTests {
    private let policy = LinkPolicy(appOrigin: URL(string: "https://orion-workspace-phi.vercel.app")!)

    @Test(arguments: [
        ("https://orion-workspace-phi.vercel.app/abc/rooms/1", LinkDecision.loadInApp),
        ("https://orion-workspace-phi.vercel.app:443/x", .loadInApp),
        ("about:blank", .loadInApp),
        ("blob:https://orion-workspace-phi.vercel.app/123", .loadInApp),
        ("http://orion-workspace-phi.vercel.app/x", .openExternally),
        ("https://www.pinterest.com/pin/1", .openExternally),
        ("https://evil.vercel.app/x", .openExternally),
        ("mailto:me@example.com", .openExternally),
        ("javascript:alert(1)", .ignore),
        ("file:///etc/passwd", .ignore),
    ])
    func decides(_ link: String, _ expected: LinkDecision) throws {
        let url = try #require(URL(string: link))
        #expect(policy.decide(url) == expected)
    }
}
```

(Force-unwrap of a literal URL inside a test property is the one exception; if the swiftui-pro review objects, replace with `try #require` in each test.)

`RestorableURLTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct RestorableURLTests {
    private let origin = URL(string: "https://orion-workspace-phi.vercel.app")!

    @Test func keepsSameOriginPages() throws {
        let url = try #require(URL(string: "https://orion-workspace-phi.vercel.app/w/rooms/r?tab=canvas"))
        #expect(RestorableURL.restorable(url, appOrigin: origin) == url)
    }

    @Test(arguments: [
        "https://orion-workspace-phi.vercel.app/sign-in?next=%2F",
        "https://orion-workspace-phi.vercel.app/auth/callback?code=1",
        "https://www.pinterest.com/",
    ])
    func dropsAuthAndForeignPages(_ link: String) throws {
        #expect(RestorableURL.restorable(try #require(URL(string: link)), appOrigin: origin) == nil)
    }

    @Test func dropsNil() {
        #expect(RestorableURL.restorable(nil, appOrigin: origin) == nil)
    }

    @Test func resolvesPathsFromNotifications() {
        #expect(RestorableURL.resolve(path: "/w/rooms/r", appOrigin: origin)?.absoluteString == "https://orion-workspace-phi.vercel.app/w/rooms/r")
    }

    @Test(arguments: ["//evil.example/x", "https://evil.example/x", "rooms", "/sign-in"])
    func refusesUnsafePaths(_ path: String) {
        #expect(RestorableURL.resolve(path: path, appOrigin: origin) == nil)
    }
}
```

`BridgeMessageTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct BridgeMessageTests {
    @Test func decodesReady() {
        let id = UUID()
        #expect(BridgeMessage.decode(["v": 1, "type": "ready", "workspaceId": id.uuidString.lowercased()]) == .ready(workspaceID: id))
        #expect(BridgeMessage.decode(["v": 1, "type": "ready", "workspaceId": NSNull()]) == .ready(workspaceID: nil))
    }

    @Test func decodesNotifyAndTrimsLongText() {
        let long = String(repeating: "a", count: 500)
        let message = BridgeMessage.decode(["v": 1, "type": "notify", "title": long, "body": long, "path": "/w"])
        #expect(message == .notify(title: String(long.prefix(120)), body: String(long.prefix(300)), path: "/w"))
    }

    @Test func decodesShelfMessages() {
        #expect(BridgeMessage.decode(["v": 1, "type": "shelfConnectCode", "code": "ABCD-1234"]) == .shelfConnectCode("ABCD-1234"))
        #expect(BridgeMessage.decode(["v": 1, "type": "shelfConnectFailed", "message": "nope"]) == .shelfConnectFailed("nope"))
    }

    @Test(arguments: [
        ["v": 2, "type": "ready"] as [String: Any],
        ["v": 1, "type": "explode"],
        ["v": 1, "type": "notify", "title": "x"],
        ["v": 1, "type": "shelfConnectCode", "code": ""],
    ])
    func ignoresUnknownOrMalformed(_ body: [String: Any]) {
        #expect(BridgeMessage.decode(body) == nil)
    }

    @Test func ignoresNonDictionaries() {
        #expect(BridgeMessage.decode("ready") == nil)
        #expect(BridgeMessage.decode(42) == nil)
    }
}
```

(If Swift Testing rejects `[String: Any]` as a non-Sendable argument, turn that parameterized test into four plain `#expect` lines in one test.)

`NotificationGateTests.swift`:

```swift
import Testing
@testable import OrionAppCore

struct NotificationGateTests {
    @Test func staysQuietWhileYouAreLookingAtOrion() {
        #expect(NotificationGate.shouldPresent(appIsActive: true, windowIsKey: true) == false)
    }

    @Test(arguments: [(false, false), (false, true), (true, false)])
    func notifiesWhenYouAreElsewhere(_ active: Bool, _ key: Bool) {
        #expect(NotificationGate.shouldPresent(appIsActive: active, windowIsKey: key))
    }
}
```

`SiteReachabilityTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct SiteReachabilityTests {
    @Test(arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost, .timedOut, .dnsLookupFailed])
    func networkErrorsMeanOffline(_ code: URLError.Code) {
        #expect(SiteReachability.problem(for: URLError(code)) == .offline)
    }

    @Test func cancellationIsNotAProblem() {
        #expect(SiteReachability.problem(for: URLError(.cancelled)) == nil)
    }

    @Test func webKitInterruptionIsNotAProblem() {
        #expect(SiteReachability.problem(for: NSError(domain: "WebKitErrorDomain", code: 102)) == nil)
    }

    @Test(arguments: [500, 502, 503, 599])
    func serverErrors(_ status: Int) {
        #expect(SiteReachability.problem(forHTTPStatus: status) == .serverError)
    }

    @Test(arguments: [200, 304, 404])
    func otherStatusesAreFine(_ status: Int) {
        #expect(SiteReachability.problem(forHTTPStatus: status) == nil)
    }
}
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/mac && swift test --filter OrionAppCoreTests`
Expected: FAIL — missing types.

- [ ] **Step 3: Implement**

`Origin.swift`:

```swift
import Foundation

public func isSameOrigin(_ a: URL, _ b: URL) -> Bool {
    guard let schemeA = a.scheme?.lowercased(), let schemeB = b.scheme?.lowercased(),
          let hostA = a.host()?.lowercased(), let hostB = b.host()?.lowercased() else { return false }
    return schemeA == schemeB && hostA == hostB && effectivePort(a, scheme: schemeA) == effectivePort(b, scheme: schemeB)
}

private func effectivePort(_ url: URL, scheme: String) -> Int? {
    url.port ?? (scheme == "https" ? 443 : scheme == "http" ? 80 : nil)
}
```

`LinkPolicy.swift`:

```swift
import Foundation

public enum LinkDecision: Equatable, Sendable {
    case loadInApp, openExternally, ignore
}

/// Decides where a main-frame navigation goes. Only Orion itself loads in the window.
public struct LinkPolicy: Sendable {
    public let appOrigin: URL

    public init(appOrigin: URL) {
        self.appOrigin = appOrigin
    }

    public func decide(_ url: URL) -> LinkDecision {
        switch url.scheme?.lowercased() {
        case "about", "blob", "data": .loadInApp
        case "http", "https": isSameOrigin(url, appOrigin) ? .loadInApp : .openExternally
        case "javascript", "file", nil: .ignore
        default: .openExternally
        }
    }
}
```

`RestorableURL.swift`:

```swift
import Foundation

/// Which pages are safe to reopen at launch or from a notification click.
public enum RestorableURL {
    public static func restorable(_ url: URL?, appOrigin: URL) -> URL? {
        guard let url, isSameOrigin(url, appOrigin) else { return nil }
        let path = url.path()
        let isAuth = path == "/sign-in" || path.hasPrefix("/sign-in/") || path == "/auth" || path.hasPrefix("/auth/")
        return isAuth ? nil : url
    }

    public static func resolve(path: String, appOrigin: URL) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"),
              let url = URL(string: path, relativeTo: appOrigin)?.absoluteURL else { return nil }
        return restorable(url, appOrigin: appOrigin)
    }
}
```

`BridgeMessage.swift`:

```swift
import Foundation

/// Messages the Orion website sends to the app (wire format v1, see apps/web/src/features/native/bridge.ts).
public enum BridgeMessage: Equatable, Sendable {
    case ready(workspaceID: UUID?)
    case notify(title: String, body: String, path: String)
    case shelfConnectCode(String)
    case shelfConnectFailed(String)

    static let titleLimit = 120
    static let bodyLimit = 300

    public static func decode(_ body: Any) -> BridgeMessage? {
        guard let fields = body as? [String: Any], (fields["v"] as? Int) == 1, let type = fields["type"] as? String else { return nil }
        switch type {
        case "ready":
            return .ready(workspaceID: (fields["workspaceId"] as? String).flatMap(UUID.init(uuidString:)))
        case "notify":
            guard let title = nonEmpty(fields["title"]), let body = nonEmpty(fields["body"]), let path = nonEmpty(fields["path"]) else { return nil }
            return .notify(title: String(title.prefix(titleLimit)), body: String(body.prefix(bodyLimit)), path: path)
        case "shelfConnectCode":
            return nonEmpty(fields["code"]).map(BridgeMessage.shelfConnectCode)
        case "shelfConnectFailed":
            return nonEmpty(fields["message"]).map(BridgeMessage.shelfConnectFailed)
        default:
            return nil
        }
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let text = value as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }
}
```

`NotificationGate.swift`:

```swift
/// A notification is only useful when you aren't already looking at Orion.
public enum NotificationGate {
    public static func shouldPresent(appIsActive: Bool, windowIsKey: Bool) -> Bool {
        !(appIsActive && windowIsKey)
    }
}
```

`SiteReachability.swift`:

```swift
import Foundation

public enum SiteProblem: Equatable, Sendable {
    case offline, serverError
}

/// Turns load failures into the one of two screens the user sees, or nil when nothing is wrong.
public enum SiteReachability {
    private static let frameLoadInterrupted = 102

    public static func problem(for error: any Error) -> SiteProblem? {
        let error = error as NSError
        if error.domain == NSURLErrorDomain, error.code == NSURLErrorCancelled { return nil }
        if error.domain == "WebKitErrorDomain", error.code == frameLoadInterrupted { return nil }
        return .offline
    }

    public static func problem(forHTTPStatus status: Int) -> SiteProblem? {
        (500...599).contains(status) ? .serverError : nil
    }
}
```

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/mac && swift test --filter OrionAppCoreTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/OrionAppCore apps/mac/Tests/OrionAppCoreTests
git commit -m "feat(mac): OrionAppCore decisions — links, restore, bridge, notifications, reachability"
```

---

### Task 6: The Orion window

A single AppKit-managed window hosting SwiftUI, with a `WKWebView` inside. (AppKit `NSWindowController` instead of a SwiftUI `Window` scene, because the window must be shown/hidden from the status item and the activation policy must follow it — this is the implementation of spec B2/B4.)

**Files:**
- Create: `apps/mac/Sources/Orion/Window/WindowModel.swift`, `WebViewController.swift`, `OrionRootView.swift`, `UnreachableView.swift`, `MainWindowController.swift`
- Modify: `apps/mac/Sources/Orion/App/AppDelegate.swift`
- Test: `apps/mac/Tests/OrionTests/WindowModelTests.swift`

**Interfaces:**
- Consumes: `AppConfig`, `LinkPolicy`, `RestorableURL`, `SiteReachability`, `SiteProblem` (Tasks 2, 5).
- Produces:
  - `@MainActor @Observable final class WindowModel { enum Phase: Equatable { case loading, ready, unreachable(SiteProblem) }; private(set) var phase: Phase; init(defaults: UserDefaults, appOrigin: URL); var launchURL: URL; func didStartLoading(); func didFinishLoading(); func didFail(_ error: any Error); func didReceiveMainFrameStatus(_ status: Int); func remember(_ url: URL?); static let lastURLKey = "lastPageURL" }`
  - `@MainActor final class WebViewController: NSObject { let webView: WKWebView; init(model: WindowModel, policy: LinkPolicy, version: String, messageHandler: (any WKScriptMessageHandler)?); func load(_ url: URL); func reload(); func evaluate(_ script: String) }`
  - `@MainActor final class MainWindowController: NSWindowController, NSWindowDelegate { init(model: WindowModel, web: WebViewController); func show(); func show(loading url: URL); var isKeyWindow: Bool; var onVisibilityChange: ((Bool) -> Void)? }`

- [ ] **Step 1: Failing WindowModel tests**

```swift
import Foundation
import OrionAppCore
import Testing
@testable import Orion

@MainActor
struct WindowModelTests {
    private let origin = URL(string: "https://orion.test")!
    private func defaults() -> UserDefaults { UserDefaults(suiteName: "orion-window-\(UUID().uuidString)") ?? .standard }

    @Test func startsAtTheSiteWhenNothingWasRemembered() {
        #expect(WindowModel(defaults: defaults(), appOrigin: origin).launchURL == origin)
    }

    @Test func reopensTheLastPage() throws {
        let store = defaults()
        let page = try #require(URL(string: "https://orion.test/w/rooms/r"))
        WindowModel(defaults: store, appOrigin: origin).remember(page)
        #expect(WindowModel(defaults: store, appOrigin: origin).launchURL == page)
    }

    @Test func neverRemembersSignInOrForeignPages() throws {
        let store = defaults()
        let model = WindowModel(defaults: store, appOrigin: origin)
        model.remember(try #require(URL(string: "https://orion.test/w")))
        model.remember(try #require(URL(string: "https://orion.test/sign-in")))
        model.remember(try #require(URL(string: "https://example.com")))
        #expect(WindowModel(defaults: store, appOrigin: origin).launchURL.absoluteString == "https://orion.test/w")
    }

    @Test func phasesFollowLoading() {
        let model = WindowModel(defaults: defaults(), appOrigin: origin)
        #expect(model.phase == .loading)
        model.didFinishLoading()
        #expect(model.phase == .ready)
        model.didFail(URLError(.notConnectedToInternet))
        #expect(model.phase == .unreachable(.offline))
        model.didStartLoading()
        #expect(model.phase == .loading)
        model.didReceiveMainFrameStatus(503)
        #expect(model.phase == .unreachable(.serverError))
    }

    @Test func cancelledLoadsDoNotShowAnError() {
        let model = WindowModel(defaults: defaults(), appOrigin: origin)
        model.didFinishLoading()
        model.didFail(URLError(.cancelled))
        #expect(model.phase == .ready)
    }
}
```

Run: `cd apps/mac && swift test --filter WindowModelTests` → FAIL.

- [ ] **Step 2: WindowModel**

```swift
import Foundation
import Observation
import OrionAppCore

/// What the Orion window should show, and which page to reopen next time.
@MainActor
@Observable
final class WindowModel {
    enum Phase: Equatable {
        case loading, ready, unreachable(SiteProblem)
    }

    static let lastURLKey = "lastPageURL"

    private(set) var phase: Phase = .loading
    let appOrigin: URL
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults, appOrigin: URL) {
        self.defaults = defaults
        self.appOrigin = appOrigin
    }

    var launchURL: URL {
        RestorableURL.restorable(defaults.url(forKey: Self.lastURLKey), appOrigin: appOrigin) ?? appOrigin
    }

    func didStartLoading() { phase = .loading }
    func didFinishLoading() { phase = .ready }

    func didFail(_ error: any Error) {
        if let problem = SiteReachability.problem(for: error) { phase = .unreachable(problem) }
    }

    func didReceiveMainFrameStatus(_ status: Int) {
        if let problem = SiteReachability.problem(forHTTPStatus: status) { phase = .unreachable(problem) }
    }

    func remember(_ url: URL?) {
        guard let url = RestorableURL.restorable(url, appOrigin: appOrigin) else { return }
        defaults.set(url, forKey: Self.lastURLKey)
    }
}
```

Run tests → PASS.

- [ ] **Step 3: WebViewController**

```swift
import AppKit
import OrionAppCore
import WebKit

/// Owns the WKWebView: where links go, file pickers, downloads, and load state.
@MainActor
final class WebViewController: NSObject {
    let webView: WKWebView
    private let model: WindowModel
    private let policy: LinkPolicy
    private var urlObservation: NSKeyValueObservation?

    init(model: WindowModel, policy: LinkPolicy, version: String, messageHandler: (any WKScriptMessageHandler)?) {
        self.model = model
        self.policy = policy
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.applicationNameForUserAgent = "OrionMac/\(version)"
        if let messageHandler {
            configuration.userContentController.add(messageHandler, name: "orion")
        }
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Fires on Next.js client-side navigations too, which the navigation delegate doesn't see.
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
            MainActor.assumeIsolated { self?.model.remember(webView.url) }
        }
    }

    func load(_ url: URL) {
        model.didStartLoading()
        webView.load(URLRequest(url: url))
    }

    func reload() {
        if webView.url == nil { load(model.launchURL) } else { model.didStartLoading(); webView.reload() }
    }

    func evaluate(_ script: String) {
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func openExternally(_ url: URL) {
        NSWorkspace.shared.open(url)
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        // Images, iframes and other sub-frames always load; only top-level navigations are policed.
        guard action.targetFrame?.isMainFrame ?? true else { return .allow }
        if action.shouldPerformDownload { return .download }
        switch policy.decide(url) {
        case .loadInApp: return .allow
        case .openExternally: openExternally(url); return .cancel
        case .ignore: return .cancel
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if !response.canShowMIMEType { return .download }
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse {
            model.didReceiveMainFrameStatus(http.statusCode)
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if case .unreachable = model.phase { return }
        model.didFinishLoading()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        model.didFail(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        model.didFail(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        model.didFail(URLError(.networkConnectionLost))
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }
}

extension WebViewController: WKUIDelegate {
    /// target=_blank: Orion pages open in this window, everything else in the browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            switch policy.decide(url) {
            case .loadInApp: webView.load(action.request)
            case .openExternally: openExternally(url)
            case .ignore: break
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo) async -> [URL]? {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        return await panel.begin() == .OK ? panel.urls : nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: String(localized: "OK"))
        alert.addButton(withTitle: String(localized: "Cancel"))
        return alert.runModal() == .alertFirstButtonReturn
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo) async -> String? {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(string: defaultText ?? "")
        field.frame.size.width = 280
        alert.accessoryView = field
        alert.addButton(withTitle: String(localized: "OK"))
        alert.addButton(withTitle: String(localized: "Cancel"))
        return alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil
    }
}

extension WebViewController: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let downloads = URL.downloadsDirectory
        let base = (suggestedFilename as NSString).deletingPathExtension
        let ext = (suggestedFilename as NSString).pathExtension
        var candidate = downloads.appending(path: suggestedFilename)
        var counter = 2
        while FileManager.default.fileExists(atPath: candidate.path()) {
            candidate = downloads.appending(path: ext.isEmpty ? "\(base) \(counter)" : "\(base) \(counter).\(ext)")
            counter += 1
        }
        return candidate
    }
}
```

If the compiler flags `@MainActor` isolation conflicts on WebKit delegate methods, mark the conformances `@preconcurrency` (WebKit's delegates are main-thread) — don't add `nonisolated` + `DispatchQueue`.

- [ ] **Step 4: Views**

`UnreachableView.swift`:

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

struct UnreachableView: View {
    let problem: SiteProblem
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            OrionLogo(form: .mark, decorative: true)
                .frame(height: 48)
            Text(title)
                .font(OrionFont.font(for: .title, size: 24, emphasized: true))
            Text(detail)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Try again", action: retry)
                .keyboardShortcut(.defaultAction)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }

    private var title: String {
        switch problem {
        case .offline: String(localized: "Can't reach Orion")
        case .serverError: String(localized: "Orion is having trouble")
        }
    }

    private var detail: String {
        switch problem {
        case .offline: String(localized: "Check your internet connection. Orion will try again by itself when you're back online.")
        case .serverError: String(localized: "Something went wrong on Orion's side. Try again in a moment.")
        }
    }
}
```

`OrionLogo(form:decorative:)` and `OrionFont.font(for:size:emphasized:)` are the design-system APIs in `packages/orion-design-system/Sources/OrionDesignSystem`; never redraw the logo or hard-code a font name.

`OrionRootView.swift`:

```swift
import AppKit
import OrionDesignSystem
import SwiftUI
import WebKit

struct OrionRootView: View {
    let model: WindowModel
    let webView: WKWebView
    let retry: () -> Void

    var body: some View {
        ZStack {
            WebViewHost(webView: webView)
            switch model.phase {
            case .loading where webView.url == nil:
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.background)
            case .unreachable(let problem):
                UnreachableView(problem: problem, retry: retry)
            default:
                EmptyView()
            }
        }
        .frame(minWidth: 900, minHeight: 600)
    }
}

private struct WebViewHost: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
```

(`900×600` minimum — if swiftui-pro or the design system defines window size constants, use them.)

- [ ] **Step 5: MainWindowController**

```swift
import AppKit
import Network
import SwiftUI

@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate {
    private let model: WindowModel
    private let web: WebViewController
    private let pathMonitor = NWPathMonitor()
    private var hasLoaded = false
    var onVisibilityChange: ((Bool) -> Void)?

    init(model: WindowModel, web: WebViewController) {
        self.model = model
        self.web = web
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Orion"
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("OrionMain")
        super.init(window: window)
        window.delegate = self
        window.contentView = NSHostingView(rootView: OrionRootView(model: model, webView: web.webView, retry: { [weak web] in web?.reload() }))
        startWatchingNetwork()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Not used") }

    var isKeyWindow: Bool { window?.isKeyWindow ?? false }

    func show() {
        if !hasLoaded {
            hasLoaded = true
            web.load(model.launchURL)
        }
        onVisibilityChange?(true)
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    func show(loading url: URL) {
        hasLoaded = true
        web.load(url)
        show()
    }

    func windowWillClose(_ notification: Notification) {
        onVisibilityChange?(false)
    }

    private func startWatchingNetwork() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                guard let self, case .unreachable(.offline) = self.model.phase else { return }
                self.web.reload()
            }
        }
        pathMonitor.start(queue: .main)
    }
}
```

(`pathMonitor.start(queue: .main)` is NWPathMonitor's required API, not a dispatch pattern you're introducing.)

- [ ] **Step 6: Wire into AppDelegate (temporary: show window at launch)**

```swift
import AppKit
import OrionAppCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appModel = AppModel(dependencies: .live)
    private var statusItemController: StatusItemController?
    private var hotkey: GlobalHotkey?
    private(set) var mainWindow: MainWindowController?
    private(set) var webController: WebViewController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let baseURL = AppConfig.baseURL(info: Bundle.main.infoDictionary, defaults: .standard)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let windowModel = WindowModel(defaults: .standard, appOrigin: baseURL)
        let web = WebViewController(model: windowModel, policy: LinkPolicy(appOrigin: baseURL), version: version, messageHandler: nil)
        webController = web
        mainWindow = MainWindowController(model: windowModel, web: web)

        statusItemController = StatusItemController(appModel: appModel)
        let hotkey = GlobalHotkey { [appModel] in
            Task { await appModel.captureClipboard() }
        }
        hotkey.register()
        self.hotkey = hotkey
        Task { await appModel.start() }
        mainWindow?.show()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}
```

- [ ] **Step 7: Run tests, build, and check by hand**

Run: `cd apps/mac && swift test && ./scripts/build-app.sh && open ~/Applications/Orion.app`
Expected: tests PASS; the Orion window opens on the sign-in page (or your workspace). Verify by hand and note results in the task report:
1. A Pinterest link in a room opens in your browser, not the window.
2. Choosing a file (e.g. Inspiration upload) opens a Mac file picker.
3. Turn Wi-Fi off and reload (⌘R is not wired; quit and relaunch) → "Can't reach Orion". Turn Wi-Fi on → it reloads by itself.
4. Navigate to a room, quit, relaunch → same room; window same size/place.
Take a screenshot of the window to `.context/mac-window.png`.

- [ ] **Step 8: Commit**

```bash
git add apps/mac/Sources/Orion/Window apps/mac/Sources/Orion/App/AppDelegate.swift apps/mac/Tests/OrionTests/WindowModelTests.swift
git commit -m "feat(mac): Orion window — web view, link policy, offline screen, remembers last page"
```

---

### Task 7: Bridge in the app — notifications and Shelf connects itself

**Files:**
- Create: `apps/mac/Sources/Orion/Bridge/NativeBridge.swift`, `apps/mac/Sources/Orion/Bridge/NotificationPresenter.swift`
- Modify: `apps/mac/Sources/Orion/App/AppDelegate.swift`, `apps/mac/Sources/Orion/App/AppModel.swift` (add `connectAutomatically(code:)`), `apps/mac/Tests/ShelfTestSupport/FakeOrionClient.swift` (record connect codes)
- Test: `apps/mac/Tests/OrionTests/NativeBridgeTests.swift`, extend `apps/mac/Tests/OrionTests/AppModelTests.swift`

**Interfaces:**
- Consumes: `BridgeMessage`, `NotificationGate`, `RestorableURL` (Task 5); `WebViewController.evaluate(_:)`, `MainWindowController.show(loading:)`, `.isKeyWindow` (Task 6); `AppModel.connect(baseURLString:code:)`, `AppModel.connection` (existing).
- Produces:
  - `protocol NotificationPresenting: AnyObject { func present(title: String, body: String, url: URL) async }`
  - `@MainActor final class NativeBridge: NSObject, WKScriptMessageHandler { init(appOrigin: URL, isLookingAtOrion: @escaping () -> Bool, presenter: any NotificationPresenting, shelf: any ShelfAutoConnecting, askForShelfCode: @escaping () -> Void); func handle(_ message: BridgeMessage) async }`
  - `@MainActor protocol ShelfAutoConnecting: AnyObject { var needsConnection: Bool { get }; func connectAutomatically(code: String) async }` — `AppModel` conforms.

- [ ] **Step 1: Failing tests**

`NativeBridgeTests.swift`:

```swift
import Foundation
import OrionAppCore
import Testing
@testable import Orion

@MainActor
final class RecordingPresenter: NotificationPresenting {
    var shown: [(String, String, URL)] = []
    func present(title: String, body: String, url: URL) async { shown.append((title, body, url)) }
}

@MainActor
final class FakeShelf: ShelfAutoConnecting {
    var needsConnection = true
    var codes: [String] = []
    func connectAutomatically(code: String) async { codes.append(code); needsConnection = false }
}

@MainActor
struct NativeBridgeTests {
    private let origin = URL(string: "https://orion.test")!

    private func make(looking: Bool = false, shelf: FakeShelf = FakeShelf(), asks: @escaping () -> Void = {}) -> (NativeBridge, RecordingPresenter) {
        let presenter = RecordingPresenter()
        return (NativeBridge(appOrigin: origin, isLookingAtOrion: { looking }, presenter: presenter, shelf: shelf, askForShelfCode: asks), presenter)
    }

    @Test func notifiesWhenYouAreElsewhere() async {
        let (bridge, presenter) = make(looking: false)
        await bridge.handle(.notify(title: "Screens ready", body: "In Home", path: "/w/rooms/r"))
        #expect(presenter.shown.count == 1)
        #expect(presenter.shown.first?.2.absoluteString == "https://orion.test/w/rooms/r")
    }

    @Test func staysQuietWhileYouAreLooking() async {
        let (bridge, presenter) = make(looking: true)
        await bridge.handle(.notify(title: "Screens ready", body: "In Home", path: "/w/rooms/r"))
        #expect(presenter.shown.isEmpty)
    }

    @Test func dropsNotificationsWithUnsafePaths() async {
        let (bridge, presenter) = make()
        await bridge.handle(.notify(title: "x", body: "y", path: "https://evil.example"))
        #expect(presenter.shown.isEmpty)
    }

    @Test func asksForAShelfCodeOnceWhenNotConnected() async {
        var asked = 0
        let (bridge, _) = make(asks: { asked += 1 })
        await bridge.handle(.ready(workspaceID: UUID()))
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 1)
    }

    @Test func doesNotAskWhenSignedOutOrAlreadyConnected() async {
        var asked = 0
        let shelf = FakeShelf()
        let (bridge, _) = make(shelf: shelf, asks: { asked += 1 })
        await bridge.handle(.ready(workspaceID: nil))
        shelf.needsConnection = false
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 0)
    }

    @Test func redeemsTheCodeAndAllowsARetryAfterFailure() async {
        var asked = 0
        let shelf = FakeShelf()
        let (bridge, _) = make(shelf: shelf, asks: { asked += 1 })
        await bridge.handle(.ready(workspaceID: UUID()))
        await bridge.handle(.shelfConnectFailed("nope"))
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 2)
        await bridge.handle(.shelfConnectCode("ABCD-1234"))
        #expect(shelf.codes == ["ABCD-1234"])
    }
}
```

In `AppModelTests.swift` add (using the file's existing `TestDependencies` pattern and `FakeOrionClient` connect stub — read `FakeOrionClient` for how to script a connect response):

```swift
@Test func connectsAutomaticallyToTheConfiguredSite() async throws {
    let deps = TestDependencies(token: nil, connectedTo: nil)
    let model = deps.makeModel()
    #expect(model.needsConnection)
    await model.connectAutomatically(code: "ABCD-1234")
    #expect(model.needsConnection == false)
    #expect(await deps.client.connectCodes == ["ABCD-1234"])
}
```

To support that, give `FakeOrionClient` (`Tests/ShelfTestSupport/FakeOrionClient.swift`) a recorder: add `public private(set) var connectCodes: [String] = []` and make `connect` do `connectCodes.append(code)` before `try connectResult.get()`.

Run: `cd apps/mac && swift test --filter "NativeBridgeTests|AppModelTests"` → FAIL.

- [ ] **Step 2: AppModel conformance**

In `AppModel.swift` add:

```swift
extension AppModel: ShelfAutoConnecting {
    var needsConnection: Bool { connection == .disconnected }

    /// Called with a code the signed-in Orion page minted, so Shelf never needs manual pairing.
    func connectAutomatically(code: String) async {
        do {
            try await connect(baseURLString: dependencies.defaultBaseURL.absoluteString, code: code)
        } catch {
            report(String(localized: "Shelf couldn't connect. It will try again next time Orion opens."))
        }
    }
}
```

(Put this extension in `AppModel.swift` itself — a same-file extension can use the class's `private` members `dependencies` and `report`.)

- [ ] **Step 3: NativeBridge + presenter**

`NativeBridge.swift`:

```swift
import Foundation
import OrionAppCore
import WebKit

@MainActor
protocol NotificationPresenting: AnyObject {
    func present(title: String, body: String, url: URL) async
}

@MainActor
protocol ShelfAutoConnecting: AnyObject {
    var needsConnection: Bool { get }
    func connectAutomatically(code: String) async
}

/// Receives messages from the Orion website (see apps/web/src/features/native/bridge.ts).
@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler {
    private let appOrigin: URL
    private let isLookingAtOrion: () -> Bool
    private let presenter: any NotificationPresenting
    private let shelf: any ShelfAutoConnecting
    private let askForShelfCode: () -> Void
    private var shelfCodeRequested = false

    init(appOrigin: URL, isLookingAtOrion: @escaping () -> Bool, presenter: any NotificationPresenting, shelf: any ShelfAutoConnecting, askForShelfCode: @escaping () -> Void) {
        self.appOrigin = appOrigin
        self.isLookingAtOrion = isLookingAtOrion
        self.presenter = presenter
        self.shelf = shelf
        self.askForShelfCode = askForShelfCode
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let origin = message.frameInfo.securityOrigin as WKSecurityOrigin?,
              origin.protocol == appOrigin.scheme, origin.host == appOrigin.host(),
              let decoded = BridgeMessage.decode(message.body) else { return }
        Task { await handle(decoded) }
    }

    func handle(_ message: BridgeMessage) async {
        switch message {
        case .ready(let workspaceID):
            guard workspaceID != nil, shelf.needsConnection, !shelfCodeRequested else { return }
            shelfCodeRequested = true
            askForShelfCode()
        case .shelfConnectCode(let code):
            await shelf.connectAutomatically(code: code)
            shelfCodeRequested = false
        case .shelfConnectFailed:
            shelfCodeRequested = false
        case .notify(let title, let body, let path):
            guard !isLookingAtOrion(), let url = RestorableURL.resolve(path: path, appOrigin: appOrigin) else { return }
            await presenter.present(title: title, body: body, url: url)
        }
    }
}
```

(The origin check stops any non-Orion page that somehow loads in a sub-frame from posting messages.)

`NotificationPresenter.swift`:

```swift
import Foundation
import UserNotifications

/// Shows Mac notifications; clicking one opens its page in the Orion window.
@MainActor
final class NotificationPresenter: NSObject, NotificationPresenting, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    private let open: (URL) -> Void
    private var askedForPermission = false

    init(open: @escaping (URL) -> Void) {
        self.open = open
        super.init()
        center.delegate = self
    }

    func present(title: String, body: String, url: URL) async {
        if !askedForPermission {
            askedForPermission = true
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
        }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["url": url.absoluteString]
        try? await center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let text = response.notification.request.content.userInfo["url"] as? String, let url = URL(string: text) else { return }
        await MainActor.run { open(url) }
    }
}
```

(`url` came from `RestorableURL.resolve`, so it is always an Orion page.)

- [ ] **Step 4: Wire it in AppDelegate**

Replace the web-controller construction in `applicationDidFinishLaunching` with:

```swift
let presenter = NotificationPresenter(open: { [weak self] url in self?.mainWindow?.show(loading: url) })
let bridge = NativeBridge(
    appOrigin: baseURL,
    isLookingAtOrion: { [weak self] in NotificationGate.shouldPresent(appIsActive: NSApp.isActive, windowIsKey: self?.mainWindow?.isKeyWindow ?? false) == false },
    presenter: presenter,
    shelf: appModel,
    askForShelfCode: { [weak self] in self?.webController?.evaluate("window.__orionNative?.requestShelfConnect()") }
)
let web = WebViewController(model: windowModel, policy: LinkPolicy(appOrigin: baseURL), version: version, messageHandler: bridge)
```

Keep `presenter` and `bridge` in stored properties (`private var notificationPresenter: NotificationPresenter?`, `private var nativeBridge: NativeBridge?`) so they aren't deallocated. Note `WKUserContentController` retains its handler strongly — that's fine here because the bridge doesn't reference the web view.

Also route Shelf's "open" actions into the window: in `AppDependencies.live` change `openURL` to read a settable hook. Add to AppDelegate after creating `mainWindow`:

```swift
appModel.openInWindow = { [weak self] url in self?.mainWindow?.show(loading: url) }
```

and in `AppModel` add `@ObservationIgnored var openInWindow: ((URL) -> Void)?`; in `openLibrary(itemID:)` replace `dependencies.openURL(url)` with `if let openInWindow { openInWindow(url) } else { dependencies.openURL(url) }`. `openOutboxFolder` keeps using `dependencies.openURL` (Finder).

- [ ] **Step 5: Run tests and build**

Run: `cd apps/mac && swift test && ./scripts/build-app.sh`
Expected: PASS; build installs.

Manual check (record in task report): sign in → within a few seconds the Shelf panel shows "Connected" to your workspace without entering a code. Ask the agent something in a room, switch to Finder → a notification "Orion replied" appears; click it → the room opens in the window. Stay in the window → no notification.

- [ ] **Step 6: Commit**

```bash
git add apps/mac/Sources/Orion/Bridge apps/mac/Sources/Orion/App apps/mac/Tests/OrionTests
git commit -m "feat(mac): notifications when the AI finishes, and Shelf connects itself"
```

---

### Task 8: Dock, menu bar, launch at login

**Files:**
- Modify: `apps/mac/AppBundle/Info.plist` (remove `LSUIElement`)
- Modify: `apps/mac/Sources/Orion/App/AppDelegate.swift`
- Modify: `apps/mac/Sources/Orion/Shelf/Panel/PanelFooterView.swift` (+ its caller `PanelView.swift`)
- Create: `apps/mac/Sources/OrionAppCore/LaunchContext.swift`, test `apps/mac/Tests/OrionAppCoreTests/LaunchContextTests.swift`

**Interfaces:**
- Consumes: `MainWindowController.show()`, `.onVisibilityChange` (Task 6).
- Produces: `public enum LaunchContext { public static func shouldShowWindowAtLaunch(launchedAsLoginItem: Bool) -> Bool }`; `PanelFooterView(openOrion: () -> Void, quit: () -> Void)`.

- [ ] **Step 1: Failing test**

```swift
import Testing
@testable import OrionAppCore

struct LaunchContextTests {
    @Test func opensTheWindowWhenYouOpenOrion() {
        #expect(LaunchContext.shouldShowWindowAtLaunch(launchedAsLoginItem: false))
    }

    @Test func staysInTheMenuBarAtLogin() {
        #expect(LaunchContext.shouldShowWindowAtLaunch(launchedAsLoginItem: true) == false)
    }
}
```

Run → FAIL.

- [ ] **Step 2: Implement**

```swift
/// When Orion starts at login it should sit quietly in the menu bar; when you open it, show the window.
public enum LaunchContext {
    public static func shouldShowWindowAtLaunch(launchedAsLoginItem: Bool) -> Bool {
        !launchedAsLoginItem
    }
}
```

Run → PASS.

- [ ] **Step 3: Activation policy and reopen**

In `AppDelegate`:

```swift
func applicationDidFinishLaunching(_ notification: Notification) {
    // …existing setup from Tasks 6–7…
    mainWindow?.onVisibilityChange = { visible in
        NSApp.setActivationPolicy(visible ? .regular : .accessory)
    }
    NSApp.setActivationPolicy(.accessory)
    if LaunchContext.shouldShowWindowAtLaunch(launchedAsLoginItem: Self.launchedAsLoginItem(notification)) {
        mainWindow?.show()
    }
}

func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    mainWindow?.show()
    return false
}

func openOrion() {
    mainWindow?.show()
}

private static func launchedAsLoginItem(_ notification: Notification) -> Bool {
    if let isDefault = notification.userInfo?[NSApplication.launchIsDefaultUserInfoKey] as? Bool, isDefault == false {
        return true
    }
    let event = NSAppleEventManager.shared().currentAppleEvent
    return event?.eventID == kAEOpenApplication
        && event?.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue == keyAELaunchedAsLogInItem
}
```

Remove the unconditional `mainWindow?.show()` added in Task 6. Delete `LSUIElement` from Info.plist.

- [ ] **Step 4: "Open Orion" in the Shelf panel**

`PanelFooterView.swift`:

```swift
import SwiftUI

struct PanelFooterView: View {
    let openOrion: () -> Void
    let quit: () -> Void

    var body: some View {
        HStack {
            Button("Open Orion", systemImage: "macwindow", action: openOrion)
            Spacer()
            SettingsLink {
                Label("Settings…", systemImage: "gearshape")
            }
            Button("Quit Orion", systemImage: "power", action: quit)
        }
        .labelStyle(.titleAndIcon)
        .buttonStyle(.borderless)
    }
}
```

In `PanelView.swift`, where `PanelFooterView(openLibrary:quit:)` is built, pass `openOrion: { appModel.openInWindow?(appModel.baseURL) }` — but `openInWindow` with the base URL would navigate away from the current page. Instead add `@ObservationIgnored var showWindow: (() -> Void)?` to `AppModel`, set it in AppDelegate (`appModel.showWindow = { [weak self] in self?.openOrion() }`), and pass `openOrion: { appModel.showWindow?() }`. Update any test constructing `PanelFooterView`.

- [ ] **Step 5: Verify by hand**

Run: `cd apps/mac && swift test && ./scripts/build-app.sh && open ~/Applications/Orion.app`
Check and record:
1. Dock icon visible with the window open; close the window → Dock icon disappears, menu-bar O stays; drop an image on the O → it saves.
2. Panel → **Open Orion** → window returns on the same page, Dock icon back.
3. Settings → Open at login on. Log out and in → O in the menu bar, **no** window. If the window appears anyway, the login-item detection didn't work on this macOS: record it, and leave it showing (acceptable fallback; tell the owner).

- [ ] **Step 6: Commit**

```bash
git add apps/mac
git commit -m "feat(mac): Dock icon only while the window is open; stays in the menu bar; Open Orion"
```

---

### Task 9: Self-updating releases

**Files:**
- Modify: `apps/mac/Package.swift` (Sparkle), `apps/mac/AppBundle/Info.plist`, `apps/mac/scripts/build-app.sh`
- Create: `apps/mac/Sources/Orion/Updates/Updater.swift`
- Modify: `apps/mac/Sources/Orion/App/AppDelegate.swift`, `apps/mac/Sources/Orion/Shelf/Settings/SettingsView.swift`
- Create: `apps/mac/scripts/install.sh`, `.github/workflows/mac-release.yml`, `docs/runbooks/orion-mac.md`

**Interfaces:**
- Consumes: Task 1 outputs (`.context/orion-mac-signing/*`, `REPORT.md` runner label and build lessons).
- Produces: `@MainActor final class Updater { init(); func checkForUpdates() }`; GitHub secrets `ORION_MAC_CERT_P12`, `ORION_MAC_CERT_PASSWORD`, `SPARKLE_ED_PRIVATE_KEY`; release asset names `Orion.zip`, `appcast.xml`; tags `mac-v1.0.<run_number>`.

- [ ] **Step 1: Add Sparkle**

`Package.swift` dependencies: `.package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0")` (use the version Task 1 proved); `Orion` target dependencies add `.product(name: "Sparkle", package: "Sparkle")`.

Info.plist add:

```xml
<key>SUFeedURL</key>
<string>https://github.com/NicholasOdunsi/meld/releases/latest/download/appcast.xml</string>
<key>SUPublicEDKey</key>
<string><!-- paste .context/orion-mac-signing/sparkle-public.txt --></string>
<key>SUEnableAutomaticChecks</key>
<true/>
<key>SUAutomaticallyUpdate</key>
<true/>
<key>SUScheduledCheckInterval</key>
<integer>21600</integer>
```

The public key is safe to commit; the private key never is.

- [ ] **Step 2: Updater**

```swift
import Sparkle

/// Sparkle checks GitHub Releases at launch and every 6 hours, downloads in the
/// background, and asks once to restart. Unsigned updates are refused.
@MainActor
final class Updater {
    private let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)

    func checkForUpdates() {
        controller.checkForUpdates(nil)
    }
}
```

AppDelegate: `let updater = Updater()` stored property; pass to Settings via `appModel.checkForUpdates = { [updater] in updater.checkForUpdates() }` (add `@ObservationIgnored var checkForUpdates: (() -> Void)?` to AppModel). In `SettingsView` General section add `Button("Check for Updates…") { appModel.checkForUpdates?() }` and a `LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")`.

- [ ] **Step 3: build-app.sh — local and release modes**

Rewrite `apps/mac/scripts/build-app.sh`:

```bash
#!/bin/bash
# Builds Orion.app.
#   ./scripts/build-app.sh                 local build, installs to ~/Applications
#   ./scripts/build-app.sh --release N     CI build version 1.0.N into build/, no install
# Signs with "Orion Self-Signed" when that identity exists, otherwise ad-hoc.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="local"; BUILD_NUMBER="0"
if [[ "${1:-}" == "--release" ]]; then MODE="release"; BUILD_NUMBER="${2:?build number required}"; fi
IDENTITY="${ORION_SIGN_IDENTITY:-Orion Self-Signed}"
if ! security find-certificate -c "$IDENTITY" >/dev/null 2>&1; then
  [[ "$MODE" == "release" ]] && { echo "error: signing identity '$IDENTITY' missing" >&2; exit 1; }
  IDENTITY="-"
fi

swift build -c release --product Orion
BIN_DIR="$(swift build -c release --show-bin-path)"
APP="build/Orion.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Frameworks"
cp AppBundle/Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 1.0.$BUILD_NUMBER" "$APP/Contents/Info.plist"
cp "$BIN_DIR/Orion" "$APP/Contents/MacOS/Orion"
BUNDLE="$BIN_DIR/OrionDesignSystem_OrionDesignSystem.bundle"
[[ -d "$BUNDLE" ]] || { echo "error: missing $BUNDLE" >&2; exit 1; }
cp -R "$BUNDLE" "$APP/Contents/Resources/"
cp -R "$BIN_DIR/Sparkle.framework" "$APP/Contents/Frameworks/"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$APP/Contents/MacOS/Orion"

SPARKLE="$APP/Contents/Frameworks/Sparkle.framework/Versions/B"
sign() { codesign --force --options runtime --timestamp=none --sign "$IDENTITY" "$@"; }
for xpc in "$SPARKLE"/XPCServices/*.xpc; do sign "$xpc"; done
sign "$SPARKLE/Autoupdate"
sign "$SPARKLE/Updater.app"
sign "$APP/Contents/Frameworks/Sparkle.framework"
sign "$APP"
codesign --verify --strict --deep "$APP"

if [[ "$MODE" == "local" ]]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/Orion.app"
  cp -R "$APP" "$HOME/Applications/"
  echo "Installed: $HOME/Applications/Orion.app"
else
  echo "Built: $APP (1.0.$BUILD_NUMBER)"
fi
```

Apply any differences Task 1's REPORT.md recorded (e.g. Sparkle's internal paths). Local builds have version 0, so Sparkle will offer the newest release — that's intended (it's how a dev build becomes the real one).

Run: `cd apps/mac && ./scripts/build-app.sh && codesign -dvv ~/Applications/Orion.app 2>&1 | grep Authority`
Expected: `Authority=Orion Self-Signed`.

- [ ] **Step 4: install.sh**

```bash
#!/bin/bash
# First install of Orion from GitHub Releases. Updates after this are automatic.
set -euo pipefail
EXPECTED_SHA256="__PASTE_FROM_.context/orion-mac-signing/cert-sha256.txt__"
URL="https://github.com/NicholasOdunsi/meld/releases/latest/download/Orion.zip"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "$URL" -o "$WORK/Orion.zip"
ditto -x -k "$WORK/Orion.zip" "$WORK/unzipped"
APP="$WORK/unzipped/Orion.app"
codesign --verify --strict --deep "$APP"
( cd "$WORK" && codesign -d --extract-certificates "$APP" >/dev/null 2>&1 )
ACTUAL="$(openssl x509 -inform DER -in "$WORK/codesign0" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':')"
if [[ "$ACTUAL" != "$EXPECTED_SHA256" ]]; then
  echo "error: Orion.zip is not signed with the Orion certificate — not installing." >&2
  exit 1
fi
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Orion.app"
mv "$APP" "$HOME/Applications/Orion.app"
open "$HOME/Applications/Orion.app"
echo "Orion installed."
```

Replace the placeholder with the real fingerprint in this step (it is a public value; committing it is fine). `grep -n "__PASTE" apps/mac/scripts/install.sh` must return nothing before committing.

- [ ] **Step 5: GitHub secrets**

```bash
gh secret set ORION_MAC_CERT_P12 < <(base64 -i .context/orion-mac-signing/orion-signing.p12)
gh secret set ORION_MAC_CERT_PASSWORD < .context/orion-mac-signing/p12-password.txt
gh secret set SPARKLE_ED_PRIVATE_KEY < .context/orion-mac-signing/sparkle-private.txt
gh secret list | grep -E "ORION_MAC|SPARKLE"
```

Expected: three secrets listed. Ask the owner to save `orion-signing.p12`, its password, and `sparkle-private.txt` in their password manager (losing the Sparkle key means no more updates until a reinstall), **then** delete `.context/orion-mac-signing/` except `cert-sha256.txt` and `sparkle-public.txt`.

- [ ] **Step 6: Release workflow**

`.github/workflows/mac-release.yml` (use the runner label from Task 1's REPORT.md; `macos-26` below):

```yaml
name: Mac release

on:
  push:
    branches: [main]
    paths:
      - "apps/mac/**"
      - "packages/orion-design-system/**"
      - ".github/workflows/mac-release.yml"
  workflow_dispatch:

concurrency:
  group: mac-release
  cancel-in-progress: false

jobs:
  release:
    runs-on: macos-26
    permissions:
      contents: write
    env:
      VERSION: 1.0.${{ github.run_number }}
    steps:
      - uses: actions/checkout@v4

      - name: Test
        working-directory: apps/mac
        run: swift test

      - name: Import signing certificate
        env:
          P12: ${{ secrets.ORION_MAC_CERT_P12 }}
          P12_PASSWORD: ${{ secrets.ORION_MAC_CERT_PASSWORD }}
        run: |
          KEYCHAIN="$RUNNER_TEMP/orion.keychain-db"
          KEYCHAIN_PASSWORD="$(openssl rand -hex 16)"
          security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
          security set-keychain-settings -lut 3600 "$KEYCHAIN"
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
          echo "$P12" | base64 --decode > "$RUNNER_TEMP/orion.p12"
          security import "$RUNNER_TEMP/orion.p12" -k "$KEYCHAIN" -P "$P12_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
          security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')
          rm "$RUNNER_TEMP/orion.p12"

      - name: Build
        working-directory: apps/mac
        run: ./scripts/build-app.sh --release "${{ github.run_number }}"

      - name: Package and sign the update
        env:
          SPARKLE_KEY: ${{ secrets.SPARKLE_ED_PRIVATE_KEY }}
        run: |
          mkdir -p "$RUNNER_TEMP/release"
          ditto -c -k --keepParent apps/mac/build/Orion.app "$RUNNER_TEMP/release/Orion.zip"
          SPARKLE_BIN="$(find apps/mac/.build -type d -path '*/artifacts/sparkle/Sparkle/bin' | head -1)"
          printf '%s' "$SPARKLE_KEY" > "$RUNNER_TEMP/ed.key"
          "$SPARKLE_BIN/generate_appcast" --ed-key-file "$RUNNER_TEMP/ed.key" \
            --download-url-prefix "https://github.com/${{ github.repository }}/releases/download/mac-v${VERSION}/" \
            "$RUNNER_TEMP/release"
          rm "$RUNNER_TEMP/ed.key"
          grep -q "sparkle:edSignature" "$RUNNER_TEMP/release/appcast.xml"

      - name: Publish
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "mac-v${VERSION}" \
            "$RUNNER_TEMP/release/Orion.zip" "$RUNNER_TEMP/release/appcast.xml" \
            --title "Orion for Mac ${VERSION}" \
            --notes "Built from ${{ github.sha }}." \
            --latest
```

If `generate_appcast` isn't under `.build/artifacts` for the SPM binary target, download the Sparkle release tarball matching the package version into `$RUNNER_TEMP/sparkle` and use its `bin/` (Task 1 already did this locally).

- [ ] **Step 7: Supabase email template online**

Using the Management API (token from the owner's Supabase access token — ask for it, put it in `.context/supabase-token.txt`, delete afterwards):

```bash
TEMPLATE="$(cat supabase/templates/magic-link.html)"
curl -fsS -X PATCH "https://api.supabase.com/v1/projects/edpqfigqmtbqzaauhquc/config/auth" \
  -H "Authorization: Bearer $(cat .context/supabase-token.txt)" -H "Content-Type: application/json" \
  -d "$(jq -n --arg c "$TEMPLATE" '{mailer_subjects_magic_link: "Your Orion sign-in code", mailer_templates_magic_link_content: $c}')"
```

Expected: JSON response containing `"mailer_subjects_magic_link":"Your Orion sign-in code"`. Then request a sign-in email at the live site and confirm it shows a 6-digit code. Delete the token file.

- [ ] **Step 8: Runbook**

`docs/runbooks/orion-mac.md` — plain-language sections: *Install* (`bash apps/mac/scripts/install.sh`), *How updates work*, *Publish an update by hand* (`gh workflow run "Mac release"`), *Roll back* (`gh release edit mac-v1.0.<previous> --latest` — Sparkle only moves forward, so rolling back means re-publishing an older build with a higher number: re-run the workflow on the older commit via `workflow_dispatch` with `--ref`), *Keys and where they live* (names of the 3 GitHub secrets + "owner's password manager"), *Local development* (`defaults write com.orion.app OrionBaseURLOverride http://127.0.0.1:3000`), *Email template* (Step 7 command).

- [ ] **Step 9: Commit, open PR, check the release**

```bash
git add apps/mac .github/workflows/mac-release.yml docs/runbooks/orion-mac.md
git commit -m "feat(mac): self-updating releases — Sparkle, self-signed builds, GitHub Releases"
```

After the PR merges (owner's call), watch: `gh run list --workflow "Mac release" --limit 1` → success; `gh release view --json tagName,assets` shows `mac-v1.0.<n>` with `Orion.zip` and `appcast.xml`.

---

### Task 10: Acceptance with the owner, and retire Orion Shelf

Owner-facing. Speak plainly; one step at a time.

**Files:**
- Modify: `docs/runbooks/orion-mac.md` (append the ticked acceptance list with date)
- Modify: `docs/superpowers/specs/2026-11-08-orion-mac-app-design.md` (Status → Shipped)

- [ ] **Step 1: Install**

Quit the dev build if running (`osascript -e 'quit app "Orion"'`; `rm -rf ~/Applications/Orion.app`). Run `bash apps/mac/scripts/install.sh`. Expected: "Orion installed." and the window opens.

- [ ] **Step 2: Owner signs in** with email + code; clicks **Allow** on the notification prompt when it appears (first AI-finished event).

- [ ] **Step 3: Walk the "What done means" list from spec Part A**, one item at a time, with the owner. For the update item: push a trivial change under `apps/mac` (e.g. bump a comment in `README.md` — README is under `apps/mac/**` so it triggers a release), merge, wait for the release, then in Orion Settings click **Check for Updates…** → install → confirm the version number went up and no password/permission prompt appeared.

- [ ] **Step 4: Retire Orion Shelf** — only after the owner says everything works:

```bash
osascript -e 'quit app "Orion Shelf"' || true
rm -rf "$HOME/Applications/Orion Shelf.app"
security delete-generic-password -s com.orion.shelf || true
```

Then the owner opens Orion → Settings in the **website** (Settings → Shelf) and clicks **Disconnect** on the old "Orion Shelf"-era device row (the new one is named "Orion on <Mac name>"). The outbox folder stays — Orion uses it.

- [ ] **Step 5: Record and commit**

Append the ticked list with today's date to `docs/runbooks/orion-mac.md`; set spec status to `Shipped <date>`.

```bash
git add docs/runbooks/orion-mac.md docs/superpowers/specs/2026-11-08-orion-mac-app-design.md
git commit -m "docs(mac): Orion Mac app acceptance"
```
