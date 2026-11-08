# Orion (Mac app)

The Orion Mac app opens Orion Online in a native window and includes Shelf in
the menu bar. Built for one Mac (yours); no Apple developer account.

## Install
Run `bash apps/mac/scripts/install.sh` from the repository root. It installs
the latest signed release in `~/Applications` and opens Orion. App updates are
available through Settings → Check for Updates….

## Sign in
Enter your email in Orion, then the six-digit code from the sign-in email.
Shelf connects to your workspace automatically.

## Use
- Drag any image onto the **O**, or copy an image and press **⌥⌘O**.
- Click the **O** for a note, "also add to room", and your recent saves.
- If Orion is offline, images wait and send when the connection returns.

Closing the window keeps Shelf running in the menu bar. Use **Open Orion** in
the Shelf panel to bring the window back.

## Uninstall
Quit from the panel and delete `~/Applications/Orion.app`. The shared Shelf
outbox is at `~/Library/Application Support/Orion/shelf-outbox`; keep it if
you intend to reinstall Orion. Disconnect the device in web Settings → Shelf.

## Develop
Run `swift build` and `swift test` in `apps/mac`. For a local app build, run
`apps/mac/scripts/build-app.sh` from the repository root. Read
`.claude/skills/swiftui-pro` first.
