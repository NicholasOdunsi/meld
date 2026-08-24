# Prototype View Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw `<select>` injected into generated prototypes with real app chrome — a screen pill, a desktop/mobile toggle, a useful empty state — and collapse the room composer to a single page-level pill.

**Architecture:** The screen picker moves out of the generated document into the app. The document's routing harness gains a two-way `postMessage` API so app chrome can drive it and follow it. `PrototypeViewer` splits from one 45-line file into a composed pane plus four focused units. The composer dock gains a third state (pill) above its existing transcript-expanded state.

**Tech Stack:** TypeScript, React 19, Next.js 16, Astryx design system (`@astryxdesign/core`), Vitest + Testing Library, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-24-prototype-view-design.md`

**A note on the component tasks.** Steps that build UI give an exact behavioural
contract plus the full test that pins it, rather than finished JSX. That is
deliberate: the precise Astryx API for menus and segmented controls has to be
read at implementation time, and invented JSX in a plan is worse than none --
it gets pasted in and quietly reshaped until it compiles. The tests are the
contract; satisfy them with whatever the design system actually provides.

**Already true, needs no work.** The spec's "overlay, not push" decision is the
dock's existing behaviour -- `MeldDock` already floats over the plane. No task
implements it; it only has to survive Task 8.

## Global Constraints

- **Design system only.** Use Astryx components and `--meld-*` / `--spacing-*` tokens. No raw hex values. No bespoke CSS where a component exists. The single exception is the iframe wrapper's width constraint.
- **Mobile viewport width is exactly `390px`**, centred, frame height preserved.
- **Composer pill resting label is exactly `Ask anything`.** Never name an agent — the dock addresses Product, Research, Design or a teammate.
- **Contextual pill label format:** `2 screens selected · Ask anything`.
- **Iframe messages are validated by `event.source === iframe.contentWindow`**, never by `event.origin`. The iframe is `sandbox="allow-scripts"` without `allow-same-origin`, so its origin is opaque and arrives as `"null"`.
- **Posting into the iframe uses `"*"` as `targetOrigin`** — an opaque origin cannot be named. Safe because the payload is a screen id, not a secret.
- **Message names:** `meld:navigate` (app → iframe), `meld:screen-changed` (iframe → app).
- **The composer must never unmount when collapsed.** Hide with CSS. Unmounting destroys draft text, mentions and staged attachments.
- Run tests from the package root: `cd apps/web` or `cd packages/prototype`.
- Node must be v22.23.2: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/prototype/src/prototype-document.ts` | Drop the picker; harness gains the message API | 1 |
| `apps/web/src/features/design/capture-screen-thumbnail.ts` | Remove now-dead picker stripping | 1 |
| `apps/web/src/features/design/prototype-reader.ts` | `RoomPrototype` gains `screens` | 2 |
| `apps/web/src/features/design/use-prototype-frame.ts` | The iframe message channel (new) | 3 |
| `apps/web/src/features/design/components/prototype-screen-pill.tsx` | Pill + dropdown (new) | 4 |
| `apps/web/src/features/design/components/prototype-viewport-toggle.tsx` | Desktop/Mobile control (new) | 5 |
| `apps/web/src/features/design/components/prototype-empty-state.tsx` | Starting points (new) | 6 |
| `apps/web/src/features/design/components/prototype-viewer.tsx` | Composition | 7 |
| `apps/web/src/features/rooms/components/room-dock-context.tsx` | Report unsent work upward | 8 |
| `apps/web/src/ui/meld/dock.tsx` | Collapsed pill state | 8 |
| `apps/web/src/features/rooms/components/room-plane.tsx` | Own and wire the pill state | 8 |

---

### Task 1: Harness message API, picker removed

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts`
- Modify: `apps/web/src/features/design/capture-screen-thumbnail.ts`
- Test: `packages/prototype/src/prototype-document.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a document whose harness responds to `{type:"meld:navigate", screenId}` on `window.message` and posts `{type:"meld:screen-changed", screenId}` to `parent` on every screen change, including internal button clicks.

- [ ] **Step 1: Write the failing tests**

In `packages/prototype/src/prototype-document.test.ts`, replace the assertion at line 329 (`expect(doc).toContain("data-meld-screen-picker")`) and add:

```ts
it("no longer injects a screen picker into the document", () => {
  // The picker was app chrome living inside the artifact: unstyleable, sitting
  // over the design, and present in anything exported. capture-screen-thumbnail
  // had to strip it back out again, which is the tell.
  const doc = buildPrototypeDocument(twoScreenInput());
  expect(doc).not.toContain("meld-screen-picker");
  expect(doc).not.toContain("<select");
});

it("navigates when the host posts meld:navigate", () => {
  const doc = buildPrototypeDocument(twoScreenInput());
  expect(doc).toContain('"meld:navigate"');
  expect(doc).toContain("addEventListener(\"message\"");
});

it("reports every screen change back to the host", () => {
  // Required, not optional: clicking a button INSIDE the prototype navigates
  // too. Without this the pill's label silently drifts out of sync with what
  // is actually on screen.
  const doc = buildPrototypeDocument(twoScreenInput());
  expect(doc).toContain('"meld:screen-changed"');
  expect(doc).toContain("postMessage");
});
```

Add this helper near the top of the file if one does not already exist:

```ts
function twoScreenInput() {
  return {
    screens: [
      { id: "s1", name: "One", markup: "<main>One</main>", styles: "", script: null, actions: [] },
      { id: "s2", name: "Two", markup: "<main>Two</main>", styles: "", script: null, actions: [] },
    ],
    startScreenId: "s1",
    tokenCss: ":root{}",
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/prototype && pnpm vitest run src/prototype-document.test.ts
```
Expected: FAIL — the document still contains `meld-screen-picker`.

- [ ] **Step 3: Remove the picker from the document**

In `prototype-document.ts`, delete the `pickerOptions` block and the `picker` const (around lines 225–234), and remove `picker,` from the body array inside `buildPrototypeDocument`.

- [ ] **Step 4: Replace the picker wiring in the harness with the message API**

In the `HARNESS` template, delete `if (picker) picker.value = id;` from `show()`, and delete this block:

```js
  var picker = document.getElementById("meld-screen-picker");
  if (picker) {
    picker.addEventListener("change", function () {
      show(picker.value);
    });
  }
```

Add, immediately before the final `show(document.body.getAttribute("data-meld-start"));`:

```js
  function report(id) {
    try {
      parent.postMessage({ type: "meld:screen-changed", screenId: id }, "*");
    } catch (e) {}
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "meld:navigate") return;
    if (typeof data.screenId !== "string") return;
    show(data.screenId);
  });
```

Then, inside `show()`, immediately before `return true;`, add:

```js
    report(id);
```

`report` is wrapped in try/catch because a sandboxed frame with no parent (a
saved copy opened directly) would otherwise throw and take the whole harness
down with it, leaving a prototype that cannot navigate at all.

- [ ] **Step 5: Remove the now-dead picker stripping**

In `apps/web/src/features/design/capture-screen-thumbnail.ts`, delete `PICKER_SELECTOR` (line 13) and the `querySelector`/`remove` call that uses it. In `capture-screen-thumbnail.test.ts`, delete the test named `removes #meld-screen-picker from the captured document before serializing` and the `#meld-screen-picker` branch of the `querySelector` mock (around lines 86 and 243–255).

- [ ] **Step 6: Run the package tests**

```bash
cd packages/prototype && pnpm vitest run
cd ../../apps/web && pnpm vitest run src/features/design/capture-screen-thumbnail.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/prototype apps/web/src/features/design/capture-screen-thumbnail.ts apps/web/src/features/design/capture-screen-thumbnail.test.ts
git commit -m "feat(prototype): drive screen navigation from the host, not a baked-in select"
```

---

### Task 2: The reader hands over the screen list

**Files:**
- Modify: `apps/web/src/features/design/prototype-reader.ts`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx:223-227`
- Test: `apps/web/src/features/design/prototype-reader.test.ts`

**Interfaces:**
- Consumes: Task 1's document.
- Produces:

```ts
export type PrototypeScreenSummary = {
  id: string;
  name: string;
  formFactor: "desktop" | "tablet" | "mobile";
};

export type RoomPrototype = {
  html: string;
  screenCount: number;
  screens: PrototypeScreenSummary[];
};
```

- [ ] **Step 1: Write the failing test**

```ts
it("hands over every screen by id and name, in canvas order", () => {
  // screenCount alone cannot populate a named list -- the pill needs to know
  // what the screens are called and which shape to draw their thumbnails.
  const result = assembleRoomPrototype(
    [
      { id: "s1", name: "Register", formFactor: "desktop", markup: "<main>a</main>", styles: "", script: null, actions: [] },
      { id: "s2", name: "Sign In", formFactor: "mobile", markup: "<main>b</main>", styles: "", script: null, actions: [] },
    ],
    ":root{}",
    "",
  );
  expect(result?.screens).toEqual([
    { id: "s1", name: "Register", formFactor: "desktop" },
    { id: "s2", name: "Sign In", formFactor: "mobile" },
  ]);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/prototype-reader.test.ts
```
Expected: FAIL — `result.screens` is undefined.

- [ ] **Step 3: Implement**

Add the type above `RoomPrototype`, add `screens: PrototypeScreenSummary[]` to it, and in `assembleRoomPrototype`'s return object add:

```ts
    screens: screens.map((screen) => ({
      id: screen.id,
      name: screen.name,
      formFactor: screen.formFactor ?? "desktop",
    })),
```

If `PrototypeScreen` does not carry `formFactor`, read it from the same row the reader already selects and default to `"desktop"`.

Then in `page.tsx`, extend `prototypeProps`:

```ts
  const prototypeProps: PrototypeViewerProps | null = prototype
    ? {
        html: prototype.html,
        screenCount: prototype.screenCount,
        screens: prototype.screens,
      }
    : null;
```

- [ ] **Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run src/features/design/prototype-reader.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/prototype-reader.ts apps/web/src/features/design/prototype-reader.test.ts "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx"
git commit -m "feat(design): expose the prototype's screens to its viewer"
```

---

### Task 3: The iframe message channel

**Files:**
- Create: `apps/web/src/features/design/use-prototype-frame.ts`
- Test: `apps/web/src/features/design/use-prototype-frame.test.ts`

**Interfaces:**
- Consumes: Task 1's message names.
- Produces:

```ts
export function usePrototypeFrame(options: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  onScreenChanged: (screenId: string) => void;
}): { navigate: (screenId: string) => void; handleLoad: () => void };
```

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePrototypeFrame } from "./use-prototype-frame";

function fakeFrame() {
  const postMessage = vi.fn();
  const contentWindow = { postMessage } as unknown as Window;
  return {
    postMessage,
    contentWindow,
    ref: { current: { contentWindow } as unknown as HTMLIFrameElement },
  };
}

describe("usePrototypeFrame", () => {
  it("posts a navigate message once the frame has loaded", () => {
    const frame = fakeFrame();
    const { result } = renderHook(() =>
      usePrototypeFrame({ frameRef: frame.ref, onScreenChanged: vi.fn() }),
    );
    act(() => result.current.handleLoad());
    act(() => result.current.navigate("s2"));
    expect(frame.postMessage).toHaveBeenCalledWith(
      { type: "meld:navigate", screenId: "s2" },
      "*",
    );
  });

  it("queues a navigate sent before load and flushes it on load", () => {
    // Selecting a screen while the frame is still loading must not be dropped
    // silently -- that reads as a dead control.
    const frame = fakeFrame();
    const { result } = renderHook(() =>
      usePrototypeFrame({ frameRef: frame.ref, onScreenChanged: vi.fn() }),
    );
    act(() => result.current.navigate("s3"));
    expect(frame.postMessage).not.toHaveBeenCalled();
    act(() => result.current.handleLoad());
    expect(frame.postMessage).toHaveBeenCalledWith(
      { type: "meld:navigate", screenId: "s3" },
      "*",
    );
  });

  it("reports a screen change coming from inside the prototype", () => {
    const frame = fakeFrame();
    const onScreenChanged = vi.fn();
    renderHook(() => usePrototypeFrame({ frameRef: frame.ref, onScreenChanged }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: "s9" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(onScreenChanged).toHaveBeenCalledWith("s9");
  });

  it("ignores a message from any window that is not our frame", () => {
    // The frame is sandboxed without allow-same-origin, so its origin is
    // opaque and arrives as "null" -- origin cannot be used to authenticate.
    // Source identity is the only thing that can.
    const frame = fakeFrame();
    const onScreenChanged = vi.fn();
    renderHook(() => usePrototypeFrame({ frameRef: frame.ref, onScreenChanged }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: "evil" },
          source: {} as Window,
        }),
      );
    });
    expect(onScreenChanged).not.toHaveBeenCalled();
  });

  it("ignores a malformed payload from our own frame", () => {
    const frame = fakeFrame();
    const onScreenChanged = vi.fn();
    renderHook(() => usePrototypeFrame({ frameRef: frame.ref, onScreenChanged }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: 42 },
          source: frame.contentWindow,
        }),
      );
    });
    expect(onScreenChanged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/use-prototype-frame.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * The channel between the app's chrome and the sandboxed prototype.
 *
 * The picker used to live inside the document, so no channel was needed. Now
 * the pill lives outside it, and this carries intent in and truth back out.
 * Both directions matter: clicking a button inside the prototype navigates
 * too, and the pill's label has to follow or it starts lying.
 */
export function usePrototypeFrame({
  frameRef,
  onScreenChanged,
}: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  onScreenChanged: (screenId: string) => void;
}): { navigate: (screenId: string) => void; handleLoad: () => void } {
  const loadedRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  // A ref, so the listener below can stay mounted for the component's life
  // rather than tearing down and re-subscribing on every render.
  const onScreenChangedRef = useRef(onScreenChanged);
  useEffect(() => {
    onScreenChangedRef.current = onScreenChanged;
  }, [onScreenChanged]);

  const post = useCallback(
    (screenId: string) => {
      frameRef.current?.contentWindow?.postMessage(
        { type: "meld:navigate", screenId },
        // The frame's origin is opaque (sandboxed without allow-same-origin),
        // so it cannot be named. The payload is a screen id, not a secret.
        "*",
      );
    },
    [frameRef],
  );

  const navigate = useCallback(
    (screenId: string) => {
      if (!loadedRef.current) {
        pendingRef.current = screenId;
        return;
      }
      post(screenId);
    },
    [post],
  );

  const handleLoad = useCallback(() => {
    loadedRef.current = true;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) post(pending);
  }, [post]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as unknown;
      if (typeof data !== "object" || data === null) return;
      const message = data as { type?: unknown; screenId?: unknown };
      if (message.type !== "meld:screen-changed") return;
      if (typeof message.screenId !== "string") return;
      onScreenChangedRef.current(message.screenId);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef]);

  return { navigate, handleLoad };
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run src/features/design/use-prototype-frame.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/use-prototype-frame.ts apps/web/src/features/design/use-prototype-frame.test.ts
git commit -m "feat(design): add the prototype frame's message channel"
```

---

### Task 4: The screen pill

**Files:**
- Create: `apps/web/src/features/design/components/prototype-screen-pill.tsx`
- Test: `apps/web/src/features/design/components/prototype-screen-pill.test.tsx`

**Interfaces:**
- Consumes: `PrototypeScreenSummary` from Task 2.
- Produces:

```ts
export function PrototypeScreenPill(props: {
  screens: PrototypeScreenSummary[];
  selectedId: string;
  onSelect: (screenId: string) => void;
}): JSX.Element | null;
```

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeScreenPill } from "./prototype-screen-pill";

const SCREENS = [
  { id: "s1", name: "Register", formFactor: "desktop" as const },
  { id: "s2", name: "Schedule Test", formFactor: "desktop" as const },
  { id: "s3", name: "Sign In", formFactor: "mobile" as const },
];

afterEach(cleanup);

describe("PrototypeScreenPill", () => {
  it("shows the screen you are on, and how many there are", () => {
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s2" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Schedule Test/ })).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("lists every screen when opened", () => {
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    expect(screen.getByRole("menuitem", { name: /Sign In/ })).toBeInTheDocument();
  });

  it("reports the chosen screen and closes", () => {
    const onSelect = vi.fn();
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign In/ }));
    expect(onSelect).toHaveBeenCalledWith("s3");
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("closes on Escape without selecting anything", () => {
    const onSelect = vi.fn();
    render(<PrototypeScreenPill screens={SCREENS} selectedId="s1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders nothing for a single screen", () => {
    // A switcher that cannot switch is furniture in front of the design.
    const { container } = render(
      <PrototypeScreenPill screens={[SCREENS[0]]} selectedId="s1" onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to a neutral label when the selection is unknown", () => {
    // A deleted screen must not blank the pill or crash the pane.
    render(<PrototypeScreenPill screens={SCREENS} selectedId="gone" onSelect={vi.fn()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-screen-pill.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Build with Astryx `Button`, `Text`, `VStack`, `HStack` and `--meld-*` / `--spacing-*` tokens. Requirements the tests pin:

- Returns `null` when `screens.length < 2`.
- Trigger is a `<button>` whose accessible name contains the selected screen's name, plus the total count.
- Open renders `role="menu"` with one `role="menuitem"` per screen, each named for its screen.
- Selecting calls `onSelect(id)` and closes.
- `Escape` closes without selecting; a `keydown` listener on `document`, removed on unmount.
- An unknown `selectedId` renders the trigger with a neutral label (`"Screens"`), never a crash or an empty name.
- Each menu item carries a thumbnail box whose aspect ratio comes from `formFactor` (`mobile` → 9/16, otherwise 16/10).
- Positioned by the caller, not itself — this component paints no `position: absolute`.

- [ ] **Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-screen-pill.test.tsx
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/prototype-screen-pill.tsx apps/web/src/features/design/components/prototype-screen-pill.test.tsx
git commit -m "feat(design): add the prototype screen pill"
```

---

### Task 5: The viewport toggle

**Files:**
- Create: `apps/web/src/features/design/components/prototype-viewport-toggle.tsx`
- Test: `apps/web/src/features/design/components/prototype-viewport-toggle.test.tsx`

**Interfaces:**
- Produces:

```ts
export type PrototypeViewport = "desktop" | "mobile";
export const MOBILE_VIEWPORT_WIDTH_PX = 390;
export function PrototypeViewportToggle(props: {
  value: PrototypeViewport;
  onChange: (value: PrototypeViewport) => void;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOBILE_VIEWPORT_WIDTH_PX,
  PrototypeViewportToggle,
} from "./prototype-viewport-toggle";

afterEach(cleanup);

describe("PrototypeViewportToggle", () => {
  it("marks the active viewport as pressed", () => {
    render(<PrototypeViewportToggle value="desktop" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /desktop/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /mobile/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reports the viewport you pick", () => {
    const onChange = vi.fn();
    render(<PrototypeViewportToggle value="desktop" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(onChange).toHaveBeenCalledWith("mobile");
  });

  it("does not report a change when you pick what is already active", () => {
    const onChange = vi.fn();
    render(<PrototypeViewportToggle value="mobile" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pins the phone width the pane will use", () => {
    expect(MOBILE_VIEWPORT_WIDTH_PX).toBe(390);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-viewport-toggle.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Two Astryx `Button`s in an `HStack`, each with `aria-pressed`, accessible names containing "Desktop" and "Mobile". Clicking the active one is a no-op. Export `MOBILE_VIEWPORT_WIDTH_PX = 390` from this file so the viewer and its test share one source.

- [ ] **Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-viewport-toggle.test.tsx
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/prototype-viewport-toggle.tsx apps/web/src/features/design/components/prototype-viewport-toggle.test.tsx
git commit -m "feat(design): add the prototype viewport toggle"
```

---

### Task 6: The empty state

**Files:**
- Create: `apps/web/src/features/design/components/prototype-empty-state.tsx`
- Test: `apps/web/src/features/design/components/prototype-empty-state.test.tsx`

**Interfaces:**
- Produces:

```ts
export function PrototypeEmptyState(props: {
  hasUserFlow: boolean;
  hasPrd: boolean;
  onStart: (instruction: string) => void;
  onFocusComposer: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeEmptyState } from "./prototype-empty-state";

afterEach(cleanup);

describe("PrototypeEmptyState", () => {
  it("offers the user flow when the room has one", () => {
    const onStart = vi.fn();
    render(
      <PrototypeEmptyState hasUserFlow hasPrd={false} onStart={onStart} onFocusComposer={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /user flow/i }));
    expect(onStart).toHaveBeenCalledWith(
      "generate the first screen based on the userflow",
    );
  });

  it("offers the PRD when that is all the room has", () => {
    const onStart = vi.fn();
    render(
      <PrototypeEmptyState hasUserFlow={false} hasPrd onStart={onStart} onFocusComposer={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /user flow/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /PRD/i }));
    expect(onStart).toHaveBeenCalledWith("generate the first screen based on the PRD");
  });

  it("prefers the user flow when the room has both", () => {
    render(<PrototypeEmptyState hasUserFlow hasPrd onStart={vi.fn()} onFocusComposer={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAccessibleName(/user flow/i);
  });

  it("falls back to the composer when the room has neither", () => {
    // No PRD and no flow means there is nothing specific to offer -- so point
    // at the one place that can start anything, rather than a dead end.
    const onFocusComposer = vi.fn();
    render(
      <PrototypeEmptyState
        hasUserFlow={false}
        hasPrd={false}
        onStart={vi.fn()}
        onFocusComposer={onFocusComposer}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /describe a screen/i }));
    expect(onFocusComposer).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-empty-state.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Astryx `EmptyState` with a title and description, plus buttons below it:

- `hasUserFlow` → a button named "Build the first screen from your user flow", calling `onStart("generate the first screen based on the userflow")`.
- `hasPrd` → a button named "Build a screen from your PRD", calling `onStart("generate the first screen based on the PRD")`.
- Both → user flow first.
- Neither → a single button named "Describe a screen" calling `onFocusComposer()`.

- [ ] **Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-empty-state.test.tsx
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/prototype-empty-state.tsx apps/web/src/features/design/components/prototype-empty-state.test.tsx
git commit -m "feat(design): give the empty prototype something to do"
```

---

### Task 7: Compose the viewer

**Files:**
- Modify: `apps/web/src/features/design/components/prototype-viewer.tsx`
- Modify: `apps/web/src/features/rooms/components/pane-content.tsx:25`
- Test: `apps/web/src/features/design/components/prototype-viewer.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:

```ts
export type PrototypeViewerProps = {
  html: string | null;
  screenCount: number;
  screens: PrototypeScreenSummary[];
  hasUserFlow?: boolean;
  hasPrd?: boolean;
  onStart?: (instruction: string) => void;
  onFocusComposer?: () => void;
};
```

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeViewer } from "./prototype-viewer";

const SCREENS = [
  { id: "s1", name: "Register", formFactor: "desktop" as const },
  { id: "s2", name: "Sign In", formFactor: "desktop" as const },
];

afterEach(cleanup);

describe("PrototypeViewer", () => {
  it("shows the empty state when nothing is built", () => {
    render(<PrototypeViewer html={null} screenCount={0} screens={[]} hasUserFlow />);
    expect(screen.getByRole("button", { name: /user flow/i })).toBeInTheDocument();
  });

  it("constrains the frame to phone width in mobile, and restores it", () => {
    const { container } = render(
      <PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />,
    );
    const wrapper = () => container.querySelector<HTMLElement>('[data-testid="prototype-frame-wrapper"]')!;
    expect(wrapper().style.width).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(wrapper().style.width).toBe("390px");
    fireEvent.click(screen.getByRole("button", { name: /desktop/i }));
    expect(wrapper().style.width).toBe("100%");
  });

  it("keeps the same iframe element across a viewport change", () => {
    // Remounting the frame would reload the document and throw the person back
    // to the start screen -- losing the screen they were actually looking at.
    const { container } = render(
      <PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />,
    );
    const before = container.querySelector("iframe");
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(container.querySelector("iframe")).toBe(before);
  });

  it("follows a screen change that came from inside the prototype", () => {
    render(<PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />);
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    fireEvent.load(frame);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "meld:screen-changed", screenId: "s2" },
        source: frame.contentWindow,
      }),
    );
    expect(screen.getByRole("button", { name: /Sign In/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-viewer.test.tsx
```
Expected: FAIL — no toggle rendered.

- [ ] **Step 3: Implement**

Rewrite `prototype-viewer.tsx` to compose the pieces:

- State: `selectedId` (defaults to `screens[0]?.id`), `viewport` (defaults `"desktop"`).
- `usePrototypeFrame({ frameRef, onScreenChanged: setSelectedId })`.
- `html === null` → render `PrototypeEmptyState` with the props passed through.
- Otherwise a relatively-positioned container holding:
  - `PrototypeScreenPill` absolutely positioned top-left, `onSelect` → `setSelectedId(id)` then `navigate(id)`.
  - `PrototypeViewportToggle` absolutely positioned top-right.
  - A wrapper `div` with `data-testid="prototype-frame-wrapper"`, `style={{ width: viewport === "mobile" ? \`${MOBILE_VIEWPORT_WIDTH_PX}px\` : "100%", height: "100%", marginInline: "auto" }}`.
  - The single `<iframe>` inside that wrapper, `ref={frameRef}`, `onLoad={handleLoad}`, `srcDoc={html}`, `sandbox="allow-scripts"` — rendered once and never conditionally, so a viewport change resizes rather than reloads.
- If `selectedId` names no screen in `screens`, fall back to `screens[0]?.id` on render.

Then widen `pane-content.tsx`'s `prototype` prop type to the new `PrototypeViewerProps` — no behaviour change, it already forwards whatever it is given.

`hasUserFlow`, `hasPrd`, `onStart` and `onFocusComposer` stay optional here and
are wired in Task 9. Optional so this task is independently shippable: without
them the empty state falls back to its "Describe a screen" branch, which is
correct behaviour, not a broken one.

- [ ] **Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run src/features/design/components/prototype-viewer.test.tsx
```
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and run the design suite**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json && pnpm vitest run src/features/design
```
Expected: clean typecheck, all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/design/components/prototype-viewer.tsx apps/web/src/features/design/components/prototype-viewer.test.tsx apps/web/src/features/rooms/components/pane-content.tsx
git commit -m "feat(design): give the prototype pane real chrome"
```

---

### Task 8: Collapse the composer to a page-level pill

**Files:**
- Modify: `apps/web/src/features/rooms/components/room-dock-context.tsx`
- Modify: `apps/web/src/ui/meld/dock.tsx`
- Modify: `apps/web/src/features/rooms/components/room-plane.tsx:345-348, 944-967`
- Modify: `apps/web/src/features/rooms/components/conversation.tsx`
- Test: `apps/web/src/ui/meld/dock.test.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1–7.
- Produces: `MeldDockProps` gains `isCollapsed: boolean`, `onCollapsedChange: (v: boolean) => void`, `collapsedLabel: string`. `RoomDockState` gains `onUnsentWorkChange: (hasUnsentWork: boolean) => void`.

**Note on the existing state.** `isExpanded` already means *the transcript is showing above the composer*. The pill is a **third, lower** state, not a rename of that one:

| State | Pill | Composer | Transcript |
|---|---|---|---|
| collapsed | shown | hidden (CSS) | hidden |
| normal | hidden | shown | hidden |
| expanded | hidden | shown | shown |

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeldDock } from "./dock";

afterEach(cleanup);

function renderDock(overrides: Partial<Parameters<typeof MeldDock>[0]> = {}) {
  const props = {
    isExpanded: false,
    onExpandedChange: vi.fn(),
    isCollapsed: false,
    onCollapsedChange: vi.fn(),
    collapsedLabel: "Ask anything",
    ...overrides,
  };
  render(<MeldDock {...props}><textarea data-testid="composer" defaultValue="" /></MeldDock>);
  return props;
}

describe("MeldDock collapsed state", () => {
  it("shows a pill with the label it was given", () => {
    renderDock({ isCollapsed: true });
    expect(screen.getByRole("button", { name: /Ask anything/ })).toBeInTheDocument();
  });

  it("never names an agent by default", () => {
    // The dock addresses Product, Research, Design or a teammate. Naming one
    // on the resting pill is wrong.
    renderDock({ isCollapsed: true });
    expect(screen.queryByText(/Design Agent/)).not.toBeInTheDocument();
  });

  it("keeps the composer mounted while collapsed", () => {
    // Unmounting would destroy draft text, mentions and staged attachments.
    renderDock({ isCollapsed: true });
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });

  it("expands when the pill is clicked", () => {
    const props = renderDock({ isCollapsed: true });
    fireEvent.click(screen.getByRole("button", { name: /Ask anything/ }));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("shows no pill when it is not collapsed", () => {
    renderDock({ isCollapsed: false });
    expect(screen.queryByRole("button", { name: /Ask anything/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/ui/meld/dock.test.tsx
```
Expected: FAIL — no pill rendered.

- [ ] **Step 3: Implement the dock's collapsed state**

In `dock.tsx`, add the three props. When `isCollapsed`:
- render a pill `<button>` whose accessible name is `collapsedLabel`, calling `onCollapsedChange(false)` on click;
- wrap `children` in a `<div hidden>` — **not** a conditional render, so the composer keeps its state;
- render no transcript surface.

When not collapsed, behave exactly as today and render no pill.

- [ ] **Step 4: Report unsent work upward**

In `room-dock-context.tsx`, add to `RoomDockState`:

```ts
  /**
   * Called by the composer when it gains or loses work that has not been sent
   * -- draft text, or a staged attachment. The dock refuses to collapse over
   * it: hiding half-written work behind a pill reads as having lost it.
   */
  onUnsentWorkChange: (hasUnsentWork: boolean) => void;
```

In `conversation.tsx`, call it from an effect whenever the draft or staged attachments change:

```ts
  const dock = useRoomDock();
  const onUnsentWorkChange = dock?.onUnsentWorkChange;
  useEffect(() => {
    onUnsentWorkChange?.(value.trim().length > 0 || stagedAttachments.length > 0);
  }, [value, stagedAttachments, onUnsentWorkChange]);
```

Use whatever the staged-attachment state is actually named in that file; do not add a new one.

- [ ] **Step 5: Wire it in room-plane**

Beside `dockExpandedOverride` (line 345), add:

```ts
  const [isDockCollapsed, setIsDockCollapsed] = useState(true);
  const [hasUnsentWork, setHasUnsentWork] = useState(false);
  const collapseDock = useCallback(
    (collapsed: boolean) => {
      // Never collapse over work that has not been sent.
      if (collapsed && hasUnsentWork) return;
      setIsDockCollapsed(collapsed);
    },
    [hasUnsentWork],
  );
  const collapsedLabel =
    composerCanvasSelection.length > 0
      ? `${composerCanvasSelection.length} screen${composerCanvasSelection.length === 1 ? "" : "s"} selected · Ask anything`
      : "Ask anything";
```

Pass `isCollapsed={isDockCollapsed}`, `onCollapsedChange={collapseDock}` and `collapsedLabel` to `MeldDock`, and add `onUnsentWorkChange: setHasUnsentWork` to both `RoomDockProvider` values (lines ~903 and ~956).

- [ ] **Step 6: Run tests and typecheck**

```bash
cd apps/web && pnpm vitest run src/ui/meld src/features/rooms && npx tsc --noEmit -p tsconfig.json
```
Expected: all pass, clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/meld/dock.tsx apps/web/src/ui/meld/dock.test.tsx apps/web/src/features/rooms/components/room-dock-context.tsx apps/web/src/features/rooms/components/room-plane.tsx apps/web/src/features/rooms/components/conversation.tsx
git commit -m "feat(rooms): collapse the composer to a pill so it stops covering the work"
```

---

### Task 9: Wire the starting points to real generation

**Files:**
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx:223-227`
- Modify: `apps/web/src/features/rooms/components/room-plane.tsx`
- Test: `apps/web/src/features/rooms/components/room-plane.test.tsx`

**Interfaces:**
- Consumes: `PrototypeViewerProps` (Task 7), `generateDesignScreen` from
  `@/features/design/design-screen-generation`, and `focusDockComposer`
  (already in `room-plane.tsx` at line ~772).
- Produces: an empty state whose buttons actually generate.

**Why this is separate.** The booleans are serializable and come from the
server component; the callbacks are functions and cannot. They have to be
created in `room-plane.tsx`, which is `"use client"`. Splitting on that
boundary keeps each task reviewable on its own.

- [ ] **Step 1: Write the failing test**

```tsx
it("generates from the user flow when the empty prototype offers it", async () => {
  // The empty state's whole purpose is to start work. A button that renders
  // but does nothing is worse than the "No screens built yet" text it replaced.
  const generate = vi.fn().mockResolvedValue({ status: "queued", taskId: "t1", screenId: "s1" });
  renderRoomPlane({
    panes: ["prototype"],
    prototype: { html: null, screenCount: 0, screens: [], hasUserFlow: true, hasPrd: false },
    generateDesignScreen: generate,
  });

  fireEvent.click(screen.getByRole("button", { name: /user flow/i }));

  await waitFor(() =>
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: expect.any(String),
        instruction: "generate the first screen based on the userflow",
      }),
    ),
  );
});
```

Follow the file's existing `renderRoomPlane` helper and its injection style; if
it takes no `generateDesignScreen` override yet, add one with the real action
as the default, matching how `conversation.tsx` accepts `startUserFlow`.

- [ ] **Step 2: Run to verify it fails**

```bash
cd apps/web && pnpm vitest run src/features/rooms/components/room-plane.test.tsx
```
Expected: FAIL — no such button; the empty state has no starting points wired.

- [ ] **Step 3: Pass the booleans from the page**

In `page.tsx`, extend `prototypeProps`:

```ts
  const prototypeProps: PrototypeViewerProps | null = prototype
    ? {
        html: prototype.html,
        screenCount: prototype.screenCount,
        screens: prototype.screens,
        hasUserFlow: data.surfaceState.hasUserFlow,
        hasPrd: data.surfaceState.hasPrd,
      }
    : null;
```

Both already exist on `surfaceState` — they are what decides which tools the
Room offers (`page.tsx:45-46`).

- [ ] **Step 4: Supply the callbacks in room-plane**

`room-plane.tsx` is `"use client"`, so it can create them. Add:

```ts
  const startFromEmptyPrototype = useCallback(
    async (instruction: string) => {
      const result = await generateDesignScreen({ roomId, instruction });
      // A queued generation writes its screen rows server-side; refreshing is
      // what makes the new screen appear without a manual reload.
      if (result.status === "queued") router.refresh();
    },
    [roomId, router, generateDesignScreen],
  );
```

Merge both callbacks into the prototype props where the pane is rendered:

```ts
  const prototypeWithActions = prototype
    ? {
        ...prototype,
        onStart: startFromEmptyPrototype,
        onFocusComposer: focusDockComposer,
      }
    : prototype;
```

Pass `prototypeWithActions` to `PaneContent` in place of `prototype`.
`focusDockComposer` already exists at line ~772 — do not write a second one.

- [ ] **Step 5: Run tests and typecheck**

```bash
cd apps/web && pnpm vitest run src/features/rooms src/features/design && npx tsc --noEmit -p tsconfig.json
```
Expected: all pass, clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx" apps/web/src/features/rooms/components/room-plane.tsx apps/web/src/features/rooms/components/room-plane.test.tsx
git commit -m "feat(rooms): make the empty prototype's starting points generate"
```

---

## Manual verification (cannot be unit tested)

Unit tests cannot prove the sandboxed harness actually re-renders on `meld:navigate` — that needs a real browser. After Task 7, with the dev server running:

1. Open a room with two or more built screens, Prototype tab.
2. Click the pill, choose another screen → the prototype changes.
3. Click a button *inside* the prototype that navigates → the pill's label follows it.
4. Toggle Mobile → the frame narrows to 390px and the screen stays on the one you were viewing (it does not reset to the start screen).
5. Confirm no `<select>` is visible anywhere over the prototype.
6. In a room with a user flow and no screens, the empty state offers to build from it, and clicking it queues a generation.
7. Type into the composer, then try to collapse it — it must refuse while the draft is unsent.

The e2e suite cannot cover this today: five specs (`room-lifecycle`, `design-handoff`, `design-history-seed`, `design-sketch-generate`, `design-chat-to-screen`) already target deleted UI and are red for unrelated reasons. Retargeting them is out of scope for this plan.
