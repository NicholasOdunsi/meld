# Orion Shelf

A menu-bar app that saves images into your Orion Inspiration library from
anywhere on this Mac. Built for one Mac (yours); no Apple developer account.

## Install
1. `cd apps/shelf && ./scripts/build-app.sh`
2. Open `~/Applications/Orion Shelf.app`. The Orion **O** mark appears in the menu bar.

## Connect
1. In Orion (running locally), open **Settings → Shelf → Connect shelf**.
2. Click the menu-bar **O**, type the code, and click **Connect**.

## Use
- Drag any image onto the **O**, or copy an image and press **⌥⌘O**.
- Click the **O** for a note, "also add to room", and your recent saves.
- If Orion isn't running, images wait and send later.

## Uninstall
Quit from the panel, delete `~/Applications/Orion Shelf.app`, and remove
`~/Library/Application Support/Orion/shelf-outbox`. Disconnect it in
Orion Settings → Shelf.

## Develop
`swift build`, `swift test`. Read `.claude/skills/swiftui-pro` first.
