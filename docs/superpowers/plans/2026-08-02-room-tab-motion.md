# Room Tab Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Conversation/PRD tab respond immediately with Astryx's restrained crossfade while Next.js loads the URL-backed room surface without a document reload.

**Architecture:** `RoomTabStrip` will keep a local visual tab value for immediate feedback and reset it when the server-owned `activeTab` prop changes for history navigation and clamping. Each Astryx `Tab` will render through Next.js `Link`; the discovery-room server page remains the authority for content and PRD availability.

**Tech Stack:** React 19, Next.js 16 App Router, Astryx `TabList`, Vitest, Testing Library

## Global Constraints

- Keep the existing icons, status dot, divider, size, and Astryx motion tokens unchanged.
- Add no positional animation, spring, keyframe, content entrance, dependency, custom CSS, or raw styling value.
- Keep the URL as the durable source of truth and keep `parseRoomTab` clamping unchanged.
- Limit implementation changes to `RoomTabStrip` and its colocated test.

---

### Task 1: Immediate, URL-backed room tab selection

**Files:**
- Modify: `apps/web/src/features/prd/components/room-tab-strip.tsx:1-44`
- Test: `apps/web/src/features/prd/components/room-tab-strip.test.tsx:1-40`

**Interfaces:**
- Consumes: `activeTab: RoomTab`, `hasPrd: boolean`, `basePath: string`, Astryx `Tab`'s `as` and `href` props.
- Produces: `RoomTabStrip` with immediate local selection, Next.js client navigation, and a prop-change reset. No exported signature changes.

- [x] **Step 1: Write the failing interaction tests**

Mock `next/link` as an anchor that removes the compatibility-only `to` prop, add `fireEvent` and `waitFor`, then add these cases:

```tsx
vi.mock("next/link", () => ({
  default: ({ to, onClick, ...props }: ComponentProps<"a"> & { to?: string }) => {
    void to;
    return (
      <a
        {...props}
        data-router-link=""
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
      />
    );
  },
}));

it("selects a tab immediately when its link is clicked", () => {
  render(
    <RoomTabStrip activeTab="conversation" hasPrd basePath="/o/discovery/r" />,
  );

  const conversationTab = screen.getByRole("link", { name: /Conversation/ });
  const prdTab = screen.getByRole("link", { name: /PRD/ });

  expect(conversationTab).toHaveAttribute("aria-current", "page");
  fireEvent.click(prdTab);
  expect(prdTab).toHaveAttribute("aria-current", "page");
  expect(conversationTab).not.toHaveAttribute("aria-current");
});

it("resynchronizes selection when the URL-backed active tab changes", async () => {
  const { rerender } = render(
    <RoomTabStrip activeTab="conversation" hasPrd basePath="/o/discovery/r" />,
  );

  fireEvent.click(screen.getByRole("link", { name: /PRD/ }));
  rerender(<RoomTabStrip activeTab="prd" hasPrd basePath="/o/discovery/r" />);
  rerender(
    <RoomTabStrip activeTab="conversation" hasPrd basePath="/o/discovery/r" />,
  );

  await waitFor(() =>
    expect(screen.getByRole("link", { name: /Conversation/ })).toHaveAttribute(
      "aria-current",
      "page",
    ),
  );
});
```

- [x] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/features/prd/components/room-tab-strip.test.tsx
```

Expected: the immediate-selection assertion fails because `TabList.onChange` is a no-op; the source also has no Next.js `Link` integration.

- [x] **Step 3: Implement immediate selection and client navigation**

Update `RoomTabStrip` with local visual state, a conditional prop-change reset, and the supported Tab link adapter:

```tsx
import Link from "next/link";
import { useState } from "react";

const [serverTab, setServerTab] = useState<RoomTab>(activeTab);
const [visualTab, setVisualTab] = useState<RoomTab>(activeTab);

if (serverTab !== activeTab) {
  setServerTab(activeTab);
  setVisualTab(activeTab);
}

<TabList
  value={visualTab}
  onChange={(value) => setVisualTab(value as RoomTab)}
  hasDivider
  size="md"
>
  <Tab as={Link} value="conversation" href={`${basePath}?tab=conversation`} ... />
  <Tab as={Link} value="prd" href={`${basePath}?tab=prd`} ... />
</TabList>
```

Retain every existing visual prop and remove the comment that describes `onChange` as an intentional no-op.

- [x] **Step 4: Run focused verification**

Run:

```bash
pnpm --filter @meld/web exec vitest run src/features/prd/components/room-tab-strip.test.tsx
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web exec eslint src/features/prd/components/room-tab-strip.tsx src/features/prd/components/room-tab-strip.test.tsx
pnpm check:astryx
```

Expected: all commands pass with no warnings or Astryx convention violations.

- [x] **Step 5: Review the motion implementation**

Confirm the final diff has:

- no native document reload for the two room tabs;
- no custom motion values or styles;
- immediate `aria-current` retargeting on click;
- prop synchronization for browser history;
- unchanged Astryx tab visuals and deep-link URLs.

- [x] **Step 6: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-08-02-room-tab-motion.md \
  docs/superpowers/specs/2026-08-02-room-tab-motion-design.md \
  apps/web/src/features/prd/components/room-tab-strip.tsx \
  apps/web/src/features/prd/components/room-tab-strip.test.tsx
git commit -m "fix(prd): smooth room tab navigation"
```
