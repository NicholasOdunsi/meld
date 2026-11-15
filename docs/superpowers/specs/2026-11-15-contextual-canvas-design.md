# Contextual Canvas and Star conversation

Status: agreed in conversation on 2026-11-15, pending written review

## Intent

Canvas is one project board. A Star is an area of that board and a conversation about that work. Opening a Star's area should keep its conversation and composer visible beside the drawing. Opening Canvas from the project conversation should show the project conversation and the whole board. The board itself is not a replacement for the orchestration conversation.

## Interaction

- Remove the extra native row above Excalidraw (`All sections`, Star picker, expand button). Excalidraw starts directly below the Mac window header. Keep the existing Canvas title and close control in that header.
- From the project conversation, the Canvas toolbar action opens the whole board with the project conversation beside it.
- From a Star thread, that same Canvas toolbar action opens the board focused on the Star's named frame. The left chat column continues to show the Star's request, replies, and Star composer. There is no separate “Open this Star in Canvas” row in the thread.
- A quiet “Project conversation” action at the top of the Star chat column clears Star focus and fits the whole board. It does not close Canvas. Closing Canvas also clears the temporary Canvas focus and returns to the project conversation. This provides an explicit way back without recreating the removed Canvas toolbar.
- Star focus changes the viewport of the single board. It does not switch to a second board, hide other sections, or change the saved drawing content. Existing named Excalidraw frames remain the section boundaries. If a Star has no frame yet, opening its Canvas area creates one on the project board, using the current idempotent behavior.
- Expanded Canvas keeps the same chat context: a narrow Star thread when a Star is focused, or a narrow project conversation otherwise. Restore returns the prior panel width without changing context.

## Scrollbars

- Reduce the visible thickness of scrollbars in the native project and Star conversations and in the embedded Canvas. Preserve normal scrolling, thumb contrast, and the underlying scroll/drag hit area. This request concerns scrollbars, not the draggable panel resize handle; that handle stays as it is.

## State and data flow

- `FrameModel` owns a temporary `canvasStarID` while Canvas is open. Entering Canvas from a Star copies `openStarID`; entering from the project conversation leaves it nil. Changing project or closing Canvas clears it. The existing `StreamSnapshot.thread(for:)` supplies the matching messages, and `ChatComposer(frame:star:)` sends replies to that Star.
- `ProjectScreen` renders the matching thread/composer in its left column when `projectPanel == .canvas` and `canvasStarID` is set. Its board command focuses the Star frame after the room board loads. Clearing focus calls the existing fit-all command. The board remains mounted while switching between the two conversation contexts.
- No new database table, endpoint, board, or message type is needed. Star replies use the existing stream action. Excalidraw sections continue to save through the existing room board persistence.

## Alternatives considered

1. **Recommended: contextual left chat.** The Canvas entry point chooses the matching conversation. This keeps the drawing and its instructions together and uses the existing Star composer.
2. Keep the project conversation beside every Canvas view and show a small Star thread overlay. This duplicates chat surfaces and reduces drawing space.
3. Add a separate Canvas conversation. This splits the work history and requires new data semantics without improving the immediate task.

## Verification

- Unit test the Canvas context transitions: project entry, Star entry, explicit return, close, and project switch.
- Check that a Star reply from the Canvas chat column carries that Star's id; the project composer still sends to the main conversation.
- In Orion Preview, open Canvas from the project header and from a Star, confirm the adjacent chat, zoom, return action, expansion, and reopen behavior. Inspect both native and embedded scrollbars at normal and narrow widths.
- Run the focused Mac tests, web tests, TypeScript check, and Mac build.
