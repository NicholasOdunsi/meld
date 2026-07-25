# Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a home screen at `/{organizationId}` that lands them after onboarding, offers two starting points, and surfaces what needs their attention.

**Architecture:** `/{organizationId}` currently has a layout and no page; that route becomes home. The page picks one of two weightings from the organization's room count. Needs attention is assembled by a registry that composes independent per-kind resolvers, each querying source-of-truth state rather than a notification log, so tasks 9–14 can each add one resolver file without touching the section.

**Tech Stack:** Next.js App Router (React Server Components + server actions), TypeScript, Astryx design system (`@astryxdesign/core`), `@boxicons/react`, Supabase (Postgres + RLS), Zod, Vitest + Testing Library, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-25-home-screen-design.md`

## Global Constraints

- **Astryx only.** No raw layout elements, no Tailwind utilities, no raw color values, no hardcoded visual pixel values. `pnpm check:astryx` enforces this over `apps/web/src`.
- **Spacing and color come from tokens** — `var(--spacing-N)`, `var(--color-*)`, `var(--radius-*)`. Never literal `px` for visual properties.
- **Discovery Rooms keep their name.** No renaming of routes, tables, RPCs, or copy.
- **Uploads only on the import path.** No URL or link pasting. `AI-10` denies the agent web access, so a link can never become AI context.
- **No `blocker` attention kind.** `ART-03` and `FTR-09` specify warnings, never blockers.
- **No urgency or priority field** on attention items. Sort by `occurredAt`, newest first.
- **Connection strip is out of scope** for this plan — no device/connector/pairing table exists in any migration, so there is no status to read. It lands with connector work (task 7 of the MVP plan).
- **File naming:** kebab-case files, matching the existing `apps/web/src/features/*` convention.
- **Test co-location:** `foo.test.ts(x)` beside `foo.ts(x)`, per existing `features/discovery`.
- **Every test file that renders React** starts with `// @vitest-environment jsdom` and imports `"@testing-library/jest-dom/vitest"`. There is no global setup file.
- **Astryx components need `matchMedia` and `ResizeObserver` stubs** in jsdom. Copy the `vi.stubGlobal` blocks from `apps/web/src/ui/dashboard-navigation.test.tsx:7-28` verbatim into every rendering test.
- **Run tests with:** `pnpm --filter web exec vitest run <path>`
- **Full gate before declaring done:** `pnpm check:astryx && pnpm test && pnpm typecheck && pnpm lint && pnpm build`

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `apps/web/src/app/(app)/[organizationId]/page.tsx` | Home route; picks weighting from room count |
| `apps/web/src/features/home/attention/types.ts` | `AttentionItem`, `AttentionKind`, `AttentionResolver` contract |
| `apps/web/src/features/home/attention/registry.ts` | Composes resolvers, isolates failures, sorts |
| `apps/web/src/features/home/attention/mention-resolver.ts` | `mention` items from `public.mentions` |
| `apps/web/src/features/home/actions.ts` | `listAttentionItems`, `acknowledgeMention`, `listRoomSummaries` |
| `apps/web/src/features/home/components/starting-points.tsx` | Two cards; header action pair |
| `apps/web/src/features/home/components/needs-attention.tsx` | Renders `AttentionItem[]`; empty state |
| `apps/web/src/features/home/components/room-summary-list.tsx` | Rooms with last activity |
| `apps/web/src/features/home/components/upload-dialog.tsx` | Upload picker for card 2 |
| `supabase/migrations/202607250004_mention_acknowledgement.sql` | `acknowledged_at` column + update policy |
| `supabase/tests/mention_acknowledgement.test.sql` | pgTAP for acknowledge authorization |

**Modify**

| File | Change |
|---|---|
| `apps/web/src/app/page.tsx:31` | Redirect to `/{organizationId}` |
| `apps/web/src/ui/dashboard-navigation.tsx:95,114,131,142-147` | `homePath`; four hrefs; `Home` selection |
| `apps/web/src/features/discovery/repository.ts:88-102` | `listRooms` gains `lastActivityAt` |
| `apps/web/src/features/discovery/e2e-fake.ts:95-107` | `fakeListRooms` gains `lastActivityAt` |
| `scripts/check-discovery-sql.mjs:4-8` | Grammar-check the new migration |
| `docs/ui/astryx-component-map.md` | Add `Home / starting points` row |
| `e2e/onboarding.spec.ts` | Assert post-onboarding landing |

---

### Task 1: Home route and redirects

Creates the route and points everything at it. Deliverable: `/{organizationId}` renders the heading, and no path still lands on `/discovery` by default.

**Files:**
- Create: `apps/web/src/app/(app)/[organizationId]/page.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/page.test.tsx`
- Modify: `apps/web/src/app/page.tsx:31`
- Modify: `apps/web/src/ui/dashboard-navigation.tsx:95,114,131,142-147`
- Modify: `apps/web/src/ui/dashboard-navigation.test.tsx`

**Interfaces:**
- Consumes: `listDiscoveryRooms(organizationId: string)` from `@/features/discovery/actions`
- Produces: default export `HomePage({ params }: { params: Promise<{ organizationId: string }> })`

- [ ] **Step 1: Write the failing test for the home page**

Create `apps/web/src/app/(app)/[organizationId]/page.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

vi.stubGlobal(
  "ResizeObserver",
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  listDiscoveryRooms: vi.fn(),
}));

vi.mock("@/features/discovery/actions", () => ({
  listDiscoveryRooms: mocks.listDiscoveryRooms,
}));

import HomePage from "./page";

afterEach(() => {
  cleanup();
  mocks.listDiscoveryRooms.mockReset();
});

it("asks what the user is building", async () => {
  mocks.listDiscoveryRooms.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(
    screen.getByRole("heading", { name: "What are you building?" }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web exec vitest run "src/app/(app)/[organizationId]/page.test.tsx"`
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Create the home page**

Create `apps/web/src/app/(app)/[organizationId]/page.tsx`:

```tsx
import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { listDiscoveryRooms } from "@/features/discovery/actions";

export default async function HomePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  await listDiscoveryRooms(organizationId);

  return (
    <Layout height="fill">
      <LayoutContent padding={6}>
        <VStack gap={6} width="100%">
          <Heading level={1}>What are you building?</Heading>
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
```

The `listDiscoveryRooms` call is awaited but unused here on purpose: it proves the route loads room data and authorizes the caller. Task 9 binds its result to `isFresh` and branches on it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run "src/app/(app)/[organizationId]/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Point the root redirect at home**

In `apps/web/src/app/page.tsx:31`, change:

```ts
  redirect(`/${membership.organization_id}/discovery`);
```

to:

```ts
  redirect(`/${membership.organization_id}`);
```

- [ ] **Step 6: Write the failing nav test**

In `apps/web/src/ui/dashboard-navigation.test.tsx`, append:

```tsx
it("links Home to the organization root", () => {
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      rooms={[]}
    />,
  );

  expect(
    screen.getByRole("link", { name: "Home" }),
  ).toHaveAttribute("href", `/${ORGANIZATION_ID}`);
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/ui/dashboard-navigation.test.tsx`
Expected: FAIL — href is `/{org}/discovery`.

- [ ] **Step 8: Add `homePath` and repoint the four hrefs**

In `apps/web/src/ui/dashboard-navigation.tsx`, after line 95 add:

```tsx
  const homePath = `/${organizationId}`;
```

Then replace `href={discoveryPath}` with `href={homePath}` in exactly three places — the workspace-rail organization `SideNavItem` (line 114), the `SideNavHeading` `headingHref` (line 131), and the `Home` `SideNavItem` (line 145) — and change the `Home` item's selection check on line 146 from:

```tsx
            isSelected={pathname === discoveryPath}
```

to:

```tsx
            isSelected={pathname === homePath}
```

Leave `discoveryPath` in place: the "Discovery Rooms" `SideNavItem` and each room's `roomPath` still use it.

- [ ] **Step 9: Run the nav tests**

Run: `pnpm --filter web exec vitest run src/ui/dashboard-navigation.test.tsx`
Expected: PASS — including the pre-existing tests.

- [ ] **Step 10: Verify Astryx conventions**

Run: `pnpm check:astryx`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add "apps/web/src/app/(app)/[organizationId]/page.tsx" "apps/web/src/app/(app)/[organizationId]/page.test.tsx" apps/web/src/app/page.tsx apps/web/src/ui/dashboard-navigation.tsx apps/web/src/ui/dashboard-navigation.test.tsx
git commit -m "feat: add home route at organization root"
```

---

### Task 2: Starting-point cards

Two cards, icon over label. Card 1 creates a room. Card 2's button exists but opens nothing until Task 3.

**Files:**
- Create: `apps/web/src/features/home/components/starting-points.tsx`
- Create: `apps/web/src/features/home/components/starting-points.test.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/page.tsx`
- Modify: `docs/ui/astryx-component-map.md`

**Interfaces:**
- Consumes: `createDiscoveryRoomFromForm(previousState, formData)` and `DiscoveryFormState` from `@/features/discovery/actions`
- Produces: `StartingPoints({ organizationId }: { organizationId: string })`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/home/components/starting-points.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

vi.stubGlobal(
  "ResizeObserver",
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/discovery/actions", () => ({
  createDiscoveryRoomFromForm: vi.fn(),
}));

import { StartingPoints } from "./starting-points";

afterEach(cleanup);

it("offers exactly two starting points", () => {
  render(<StartingPoints organizationId={ORGANIZATION_ID} />);

  expect(
    screen.getByRole("button", { name: "Start a Discovery Room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Upload what you have" }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/home/components/starting-points.test.tsx`
Expected: FAIL — cannot resolve `./starting-points`.

- [ ] **Step 3: Implement the cards**

Create `apps/web/src/features/home/components/starting-points.tsx`:

```tsx
"use client";

import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { FolderOpen } from "@boxicons/react/FolderOpen";
import { LightBulb } from "@boxicons/react/LightBulb";
import { useState } from "react";
import { CreateRoomDialog } from "./create-room-dialog";
import { UploadDialog } from "./upload-dialog";

type OpenDialog = "none" | "create" | "upload";

export function StartingPoints({
  organizationId,
}: {
  organizationId: string;
}) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>("none");

  return (
    <>
      <HStack gap={4} width="100%">
        <StackItem size="fill">
          <ClickableCard
            label="Start a Discovery Room"
            padding={5}
            width="100%"
            onClick={() => setOpenDialog("create")}
          >
            <VStack gap={3}>
              <Icon icon={LightBulb} size="md" color="primary" />
              <Text type="label">Start a Discovery Room</Text>
            </VStack>
          </ClickableCard>
        </StackItem>
        <StackItem size="fill">
          <ClickableCard
            label="Upload what you have"
            padding={5}
            width="100%"
            onClick={() => setOpenDialog("upload")}
          >
            <VStack gap={3}>
              <Icon icon={FolderOpen} size="md" color="primary" />
              <Text type="label">Upload what you have</Text>
            </VStack>
          </ClickableCard>
        </StackItem>
      </HStack>
      <CreateRoomDialog
        organizationId={organizationId}
        isOpen={openDialog === "create"}
        onOpenChange={(isOpen) =>
          setOpenDialog(isOpen ? "create" : "none")
        }
      />
      <UploadDialog
        isOpen={openDialog === "upload"}
        onOpenChange={(isOpen) =>
          setOpenDialog(isOpen ? "upload" : "none")
        }
      />
    </>
  );
}
```

**Astryx `Dialog` API — verified, do not guess.** `Dialog` takes `isOpen` and
`onOpenChange: (isOpen: boolean) => unknown`. There is **no `onClose` and no
`title` prop**. The title comes from the separate `DialogHeader` component,
exported from the same module.

- [ ] **Step 4: Implement the create-room dialog**

Create `apps/web/src/features/home/components/create-room-dialog.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createDiscoveryRoomFromForm,
  type DiscoveryFormState,
} from "@/features/discovery/actions";

export function CreateRoomDialog({
  organizationId,
  isOpen,
  onOpenChange,
}: {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, action] = useActionState(
    createDiscoveryRoomFromForm,
    { status: "idle" } satisfies DiscoveryFormState,
  );

  useEffect(() => {
    if (state.status === "success" && state.roomId) {
      router.push(`/${organizationId}/discovery/${state.roomId}`);
      router.refresh();
    }
  }, [organizationId, router, state.roomId, state.status]);

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Start a Discovery Room"
        onOpenChange={onOpenChange}
        hasDivider
      />
      <form action={action}>
        <VStack gap={4}>
          <input
            type="hidden"
            name="organizationId"
            value={organizationId}
          />
          <TextInput
            label="Room name"
            value={name}
            onChange={setName}
            htmlName="name"
            placeholder="Customer interviews"
            status={
              state.message
                ? { type: "error", message: state.message }
                : undefined
            }
          />
          <SubmitButton isDisabled={!name.trim()} />
        </VStack>
      </form>
    </Dialog>
  );
}

function SubmitButton({ isDisabled }: { isDisabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      label="Create room"
      variant="primary"
      isDisabled={isDisabled}
      isLoading={pending}
    />
  );
}
```

- [ ] **Step 5: Add a placeholder-free upload dialog stub**

Create `apps/web/src/features/home/components/upload-dialog.tsx`. This renders a real, working dialog that explains the path; the file-handling arrives in Task 3.

```tsx
"use client";

import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export function UploadDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Upload what you have"
        onOpenChange={onOpenChange}
        hasDivider
      />
      <VStack gap={4} padding={4}>
        <Text type="supporting">
          Upload documents, notes, or an HTML export. Meld reads the
          text and keeps it in the room as context.
        </Text>
      </VStack>
    </Dialog>
  );
}
```

This stub takes no `organizationId` — Task 3 adds it along with the prop on the
call site. In `starting-points.tsx`, render `<UploadDialog>` without the
`organizationId` prop for now.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/home/components/starting-points.test.tsx`
Expected: PASS

- [ ] **Step 7: Render the cards on home**

In `apps/web/src/app/(app)/[organizationId]/page.tsx`, add the import and render inside the `VStack`:

```tsx
import { StartingPoints } from "@/features/home/components/starting-points";
```

```tsx
          <Heading level={1}>What are you building?</Heading>
          <StartingPoints organizationId={organizationId} />
```

- [ ] **Step 8: Record the component-map exception**

In `docs/ui/astryx-component-map.md`, add this row to the surface table, directly after the `Application frame` row:

```markdown
| Home / starting points | `ClickableCard` | Two entry cards; icon over label |
```

Then add this paragraph immediately below the table:

```markdown
The home starting points are a deliberate exception to the "cards only for
coherent settings groups" container policy. Home presents a choice between two
paths, which is the one job cards do better than dense rows. This exception is
limited to the two entry cards; every list on home uses `List`/`Item`.
```

- [ ] **Step 9: Run the page test and conventions**

Run: `pnpm --filter web exec vitest run "src/app/(app)/[organizationId]" src/features/home && pnpm check:astryx`
Expected: PASS, exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/home "apps/web/src/app/(app)/[organizationId]/page.tsx" docs/ui/astryx-component-map.md
git commit -m "feat: add home starting-point cards"
```

---

### Task 3: Upload path

Makes card 2 work end-to-end: pick files, create a room, attach and extract each file.

**Files:**
- Create: `apps/web/src/features/home/upload-seed.ts`
- Create: `apps/web/src/features/home/upload-seed.test.ts`
- Modify: `apps/web/src/features/home/components/upload-dialog.tsx`
- Modify: `apps/web/src/features/discovery/actions.ts`

**Interfaces:**
- Consumes: `createDiscoveryRoom(input: DiscoveryRoomInput)` and `uploadAttachment(formData: FormData)` from `@/features/discovery/actions`
- Produces: `deriveRoomNameFromFiles(fileNames: string[]): string`, and server action `createRoomFromUploads(formData: FormData): Promise<{ roomId: string }>`

- [ ] **Step 1: Write the failing test for room naming**

Create `apps/web/src/features/home/upload-seed.test.ts`:

```ts
import { expect, it } from "vitest";
import { deriveRoomNameFromFiles } from "./upload-seed";

it("names the room after a single upload", () => {
  expect(deriveRoomNameFromFiles(["checkout-brief.md"])).toBe(
    "Checkout brief",
  );
});

it("names the room after the first upload and a count", () => {
  expect(
    deriveRoomNameFromFiles(["checkout-brief.md", "notes.txt"]),
  ).toBe("Checkout brief and 1 more");
});

it("falls back when there are no files", () => {
  expect(deriveRoomNameFromFiles([])).toBe("Imported documents");
});

it("truncates to the 120 character room-name limit", () => {
  const long = `${"a".repeat(200)}.md`;
  expect(deriveRoomNameFromFiles([long]).length).toBeLessThanOrEqual(
    120,
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/home/upload-seed.test.ts`
Expected: FAIL — cannot resolve `./upload-seed`.

- [ ] **Step 3: Implement the naming helper**

Create `apps/web/src/features/home/upload-seed.ts`:

```ts
const MAX_ROOM_NAME_LENGTH = 120;

export function deriveRoomNameFromFiles(fileNames: string[]) {
  if (fileNames.length === 0) {
    return "Imported documents";
  }

  const base = fileNames[0]
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const readable = base
    ? base.charAt(0).toUpperCase() + base.slice(1)
    : "Imported documents";
  const suffix =
    fileNames.length > 1
      ? ` and ${fileNames.length - 1} more`
      : "";
  const name = `${readable}${suffix}`;

  return name.length > MAX_ROOM_NAME_LENGTH
    ? name.slice(0, MAX_ROOM_NAME_LENGTH).trimEnd()
    : name;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/home/upload-seed.test.ts`
Expected: PASS

- [ ] **Step 5a: Write the failing test for HTML extraction**

The spec accepts HTML exports, but `text/html` is in neither
`AllowedMimeTypeSchema` (`schemas.ts:43-51`) nor `TEXT_MIME_TYPES`
(`attachment-extractor.ts:7`), so an HTML upload is currently rejected by
validation. Raw markup is also poor AI context, so tags must be stripped.

Append to `apps/web/src/features/discovery/attachment-extractor.test.ts`:

```ts
it("extracts readable text from an HTML export", async () => {
  const html =
    "<html><head><style>p{color:red}</style><script>alert(1)</script></head>" +
    "<body><h1>Checkout</h1><p>Users abandon at payment.</p></body></html>";

  const text = await extractAttachmentText({
    mimeType: "text/html",
    bytes: new TextEncoder().encode(html),
  });

  expect(text).toBe("Checkout Users abandon at payment.");
});
```

- [ ] **Step 5b: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/discovery/attachment-extractor.test.ts`
Expected: FAIL — returns `null`, because `text/html` is unsupported.

- [ ] **Step 5c: Support HTML in the schema and the extractor**

In `apps/web/src/features/discovery/schemas.ts`, add `"text/html",` to
`AllowedMimeTypeSchema` immediately after `"text/markdown",`.

In `apps/web/src/features/discovery/attachment-extractor.ts`, add an HTML
branch above the existing `TEXT_MIME_TYPES` branch on line 82:

```ts
  if (input.mimeType === "text/html") {
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        input.bytes,
      );
    } catch {
      throw new Error("Text attachments must contain valid UTF-8.");
    }
    const stripped = decoded
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    return normalizeText(stripped).slice(
      0,
      MAX_EXTRACTED_TEXT_CHARACTERS,
    );
  }
```

`<script>` and `<style>` bodies are removed before tags are stripped so their
contents never reach the model as prose.

- [ ] **Step 5d: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/discovery/attachment-extractor.test.ts`
Expected: PASS — including every pre-existing extractor test.

- [ ] **Step 5: Add the server action**

Add this import to the top of `apps/web/src/features/discovery/actions.ts`:

```ts
import { deriveRoomNameFromFiles } from "@/features/home/upload-seed";
```

Then append:

```ts
export async function createRoomFromUploads(formData: FormData) {
  const organizationId = String(
    formData.get("organizationId") ?? "",
  );
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    throw new Error("Choose at least one file.");
  }

  const room = await createDiscoveryRoom({
    organizationId,
    name: deriveRoomNameFromFiles(files.map((file) => file.name)),
  });

  for (const file of files) {
    const attachment = new FormData();
    attachment.set("roomId", room.id);
    attachment.set("file", file);
    await uploadAttachment(attachment);
  }

  return { roomId: room.id };
}
```

- [ ] **Step 6: Wire the dialog to the action**

Replace `apps/web/src/features/home/components/upload-dialog.tsx` with:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoomFromUploads } from "@/features/discovery/actions";

export function UploadDialog({
  organizationId,
  isOpen,
  onOpenChange,
}: {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setIsPending(true);
    setMessage(null);
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    for (const file of files) {
      formData.append("files", file);
    }
    try {
      const { roomId } = await createRoomFromUploads(formData);
      router.push(`/${organizationId}/discovery/${roomId}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not import those files.",
      );
      setIsPending(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Upload what you have"
        onOpenChange={onOpenChange}
        hasDivider
      />
      <VStack gap={4} padding={4}>
        <Text type="supporting">
          Upload documents, notes, or an HTML export. Meld reads the
          text now and keeps it as room context. Summarizing it into a
          brief arrives with the Product Agent.
        </Text>
        <FileInput
          label="Files"
          value={files}
          onChange={(selection) => {
            if (selection === null) {
              setFiles([]);
              return;
            }
            setFiles(
              Array.isArray(selection) ? selection : [selection],
            );
          }}
          isMultiple
          accept=".txt,.md,.html,.pdf,.png,.jpg,.jpeg,.webp,.gif"
          maxSize={10 * 1024 * 1024}
          status={
            message ? { type: "error", message } : undefined
          }
        />
        <Button
          label="Create room"
          variant="primary"
          isDisabled={files.length === 0}
          isLoading={isPending}
          onClick={handleSubmit}
        />
      </VStack>
    </Dialog>
  );
}
```

**Astryx `FileInput` API — verified, do not guess.** It is a **controlled**
component: `value: File | File[] | null` and
`onChange: (files: File | File[] | null) => void`. There is **no `htmlName`**,
so it does not participate in native form submission. That is why this dialog
builds `FormData` by hand in `handleSubmit` and uses a plain `onClick` button
rather than a `<form action={...}>`.

`accept` mirrors `AllowedMimeTypeSchema` in
`apps/web/src/features/discovery/schemas.ts:43-51`, and `maxSize` mirrors
`MAX_ATTACHMENT_BYTES`. Note that schema rejects `text/html`; see Task 3
Step 5a.

`isPending` is deliberately not reset on the success path — the component
navigates away, and clearing it first would flash the button back to idle.

- [ ] **Step 7: Pass `organizationId` to the upload dialog**

`UploadDialog` now requires `organizationId`, which the Task 2 stub did not
take. In `apps/web/src/features/home/components/starting-points.tsx`, add it
back to the call site:

```tsx
      <UploadDialog
        organizationId={organizationId}
        isOpen={openDialog === "upload"}
        onOpenChange={(isOpen) =>
          setOpenDialog(isOpen ? "upload" : "none")
        }
      />
```

- [ ] **Step 8: Run the tests and conventions**

Run: `pnpm --filter web exec vitest run src/features && pnpm check:astryx && pnpm --filter web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/home apps/web/src/features/discovery
git commit -m "feat: create a discovery room from uploaded documents"
```

---

### Task 4: Mention acknowledgement

Adds the one column that lets a mention leave the attention list, with RLS proving a user cannot acknowledge someone else's mention.

**Files:**
- Create: `supabase/migrations/202607250004_mention_acknowledgement.sql`
- Create: `supabase/tests/mention_acknowledgement.test.sql`
- Modify: `scripts/check-discovery-sql.mjs:4-8`

**Interfaces:**
- Produces: `public.mentions.acknowledged_at timestamptz`, nullable; policy `"Mentioned users can acknowledge"`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202607250004_mention_acknowledgement.sql`:

```sql
alter table public.mentions
  add column acknowledged_at timestamptz;

create index mentions_unacknowledged_idx
  on public.mentions (mentioned_user_id)
  where acknowledged_at is null;

create policy "Mentioned users can acknowledge"
on public.mentions for update to authenticated
using (mentioned_user_id = auth.uid())
with check (mentioned_user_id = auth.uid());
```

The `using` clause restricts which rows are updatable and the `with check` clause prevents reassigning the row to another user.

- [ ] **Step 2: Add the migration to the SQL grammar guard**

In `scripts/check-discovery-sql.mjs`, extend the `paths` array to:

```js
const paths = [
  "supabase/migrations/202607240004_discovery.sql",
  "supabase/migrations/202607250001_create_discovery_room_rpc.sql",
  "supabase/migrations/202607250004_mention_acknowledgement.sql",
  "supabase/tests/discovery_access.test.sql",
  "supabase/tests/mention_acknowledgement.test.sql",
];
```

Leave the `requiredFragments` checks untouched — they read `paths[0]`, which is still the discovery migration.

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/mention_acknowledgement.test.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'author@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'mentioned@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'Northstar',
  auth.uid()
);

insert into public.memberships (organization_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'member'
  );

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '40000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000001',
  'Checkout',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (room_id, user_id, access)
values
  (
    '40000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'edit'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'edit'
  );

insert into public.messages (id, room_id, client_id, author_id, body)
values (
  '60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  'Can you look at this, @mentioned?'
);

insert into public.mentions (
  id, room_id, message_id, mentioned_user_id, created_by
)
values (
  '50000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select is(
  (
    select count(*)::int from public.mentions
    where mentioned_user_id = auth.uid()
      and acknowledged_at is null
  ),
  1,
  'the mentioned user sees one unacknowledged mention'
);

update public.mentions
  set acknowledged_at = now()
  where mentioned_user_id = auth.uid();

select is(
  (
    select count(*)::int from public.mentions
    where mentioned_user_id = auth.uid()
      and acknowledged_at is null
  ),
  0,
  'acknowledging clears it from the unacknowledged set'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

update public.mentions set acknowledged_at = null;

select is(
  (
    select count(*)::int from public.mentions
    where acknowledged_at is null
  ),
  0,
  'a participant cannot un-acknowledge another user''s mention'
);

select * from finish();
rollback;
```

The third assertion is the important one: the `update` runs as the message
author, not the mentioned user, and the `using (mentioned_user_id = auth.uid())`
clause makes it match zero rows rather than raising. The row therefore stays
acknowledged, and the count stays `0`.

- [ ] **Step 4: Verify the SQL parses**

Run: `pnpm check:sql-discovery`
Expected: both new files report `PostgreSQL grammar OK`.

- [ ] **Step 5: Apply the migration to the local database**

The `supabase` CLI and `psql` are not installed; a local stack runs in Docker as container `supabase_db_meld`.

```bash
docker exec -i supabase_db_meld psql -U postgres -d postgres \
  < supabase/migrations/202607250004_mention_acknowledgement.sql
docker exec -i supabase_db_meld psql -U postgres -d postgres -c \
  "insert into supabase_migrations.schema_migrations (version, name) values ('202607250004', 'mention_acknowledgement');"
```

- [ ] **Step 6: Run the pgTAP suite**

The test file assumes an empty database but the local one holds real dev data, so prepend a transactional wipe; the file's own trailing `rollback;` restores everything.

```bash
{ echo "begin; delete from public.mentions; delete from public.messages; delete from public.room_participants; delete from public.discovery_rooms; delete from public.invitations; delete from public.memberships; delete from public.products; delete from public.organizations; delete from auth.users;"; cat supabase/tests/mention_acknowledgement.test.sql; } \
  | docker exec -i supabase_db_meld psql -U postgres -d postgres
```

Expected: all three assertions report `ok`, and no `not ok` lines.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607250004_mention_acknowledgement.sql supabase/tests/mention_acknowledgement.test.sql scripts/check-discovery-sql.mjs
git commit -m "feat: let mentioned users acknowledge a mention"
```

---

### Task 5: Attention contract and registry

Pure, dependency-free composition logic. This is the contract tasks 9–14 build against.

**Files:**
- Create: `apps/web/src/features/home/attention/types.ts`
- Create: `apps/web/src/features/home/attention/registry.ts`
- Create: `apps/web/src/features/home/attention/registry.test.ts`

**Interfaces:**
- Produces:
  - `type AttentionKind = "mention" | "agent_run_failed" | "agent_result_review" | "approval_request" | "assigned_work" | "decision_needed"`
  - `type AttentionItem = { id: string; kind: AttentionKind; title: string; roomId: string; roomName: string; actorName?: string; occurredAt: string; href: string }`
  - `type AttentionResolver = { kind: AttentionKind; resolve: (context: AttentionContext) => Promise<AttentionItem[]> }`
  - `type AttentionContext = { userId: string; organizationId: string }`
  - `composeAttentionItems(resolvers: AttentionResolver[], context: AttentionContext): Promise<AttentionItem[]>`

- [ ] **Step 1: Write the contract**

Create `apps/web/src/features/home/attention/types.ts`:

```ts
export type AttentionKind =
  | "mention"
  | "agent_run_failed"
  | "agent_result_review"
  | "approval_request"
  | "assigned_work"
  | "decision_needed";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  roomId: string;
  roomName: string;
  actorName?: string;
  occurredAt: string;
  href: string;
};

export type AttentionContext = {
  userId: string;
  organizationId: string;
};

export type AttentionResolver = {
  kind: AttentionKind;
  resolve: (context: AttentionContext) => Promise<AttentionItem[]>;
};
```

- [ ] **Step 2: Write the failing registry test**

Create `apps/web/src/features/home/attention/registry.test.ts`:

```ts
import { expect, it, vi } from "vitest";
import { composeAttentionItems } from "./registry";
import type {
  AttentionContext,
  AttentionItem,
  AttentionResolver,
} from "./types";

const CONTEXT: AttentionContext = {
  userId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
};

function item(
  id: string,
  occurredAt: string,
  kind: AttentionItem["kind"] = "mention",
): AttentionItem {
  return {
    id,
    kind,
    title: `Item ${id}`,
    roomId: "40000000-0000-4000-8000-000000000004",
    roomName: "Checkout",
    occurredAt,
    href: "/org/discovery/room",
  };
}

function resolver(
  kind: AttentionItem["kind"],
  items: AttentionItem[],
): AttentionResolver {
  return { kind, resolve: async () => items };
}

it("sorts items from every resolver, newest first", async () => {
  const result = await composeAttentionItems(
    [
      resolver("mention", [item("a", "2026-07-01T00:00:00.000Z")]),
      resolver("decision_needed", [
        item("b", "2026-07-03T00:00:00.000Z", "decision_needed"),
      ]),
    ],
    CONTEXT,
  );

  expect(result.map((entry) => entry.id)).toEqual(["b", "a"]);
});

it("omits a failing resolver and keeps the rest", async () => {
  const failing: AttentionResolver = {
    kind: "assigned_work",
    resolve: async () => {
      throw new Error("assignments table missing");
    },
  };

  const result = await composeAttentionItems(
    [
      failing,
      resolver("mention", [item("a", "2026-07-01T00:00:00.000Z")]),
    ],
    CONTEXT,
  );

  expect(result.map((entry) => entry.id)).toEqual(["a"]);
});

it("returns nothing when every resolver is empty", async () => {
  const result = await composeAttentionItems(
    [resolver("mention", [])],
    CONTEXT,
  );

  expect(result).toEqual([]);
});

it("passes the context to every resolver", async () => {
  const resolve = vi.fn().mockResolvedValue([]);
  await composeAttentionItems(
    [{ kind: "mention", resolve }],
    CONTEXT,
  );

  expect(resolve).toHaveBeenCalledWith(CONTEXT);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/home/attention/registry.test.ts`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 4: Implement the registry**

Create `apps/web/src/features/home/attention/registry.ts`:

```ts
import type {
  AttentionContext,
  AttentionItem,
  AttentionResolver,
} from "./types";

export async function composeAttentionItems(
  resolvers: AttentionResolver[],
  context: AttentionContext,
): Promise<AttentionItem[]> {
  const settled = await Promise.allSettled(
    resolvers.map((resolver) => resolver.resolve(context)),
  );

  const items: AttentionItem[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      items.push(...outcome.value);
      return;
    }
    console.error(
      `Attention resolver "${resolvers[index].kind}" failed.`,
    );
  });

  return items.sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
}
```

The log deliberately records only the resolver kind, never the error object, to satisfy the `OPS-04` redaction requirement.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/home/attention/registry.test.ts`
Expected: PASS — all four tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/home/attention
git commit -m "feat: add attention item contract and resolver registry"
```

---

### Task 6: Mention resolver

The one resolver with a real source today.

**Files:**
- Create: `apps/web/src/features/home/attention/mention-resolver.ts`
- Create: `apps/web/src/features/home/attention/mention-resolver.test.ts`
- Create: `apps/web/src/features/home/actions.ts`

**Interfaces:**
- Consumes: `composeAttentionItems`, `AttentionResolver` from `./registry` and `./types`; `createClient` from `@/lib/supabase/server`
- Produces:
  - `createMentionResolver(supabase: MentionQueryClient): AttentionResolver`
  - `listAttentionItems(organizationId: string): Promise<AttentionItem[]>`
  - `acknowledgeMention(mentionId: string): Promise<void>`

- [ ] **Step 1: Write the failing resolver test**

Create `apps/web/src/features/home/attention/mention-resolver.test.ts`:

```ts
import { expect, it } from "vitest";
import { createMentionResolver } from "./mention-resolver";

const CONTEXT = {
  userId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
};

function clientReturning(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  };
}

it("maps an unacknowledged mention to an attention item", async () => {
  const resolver = createMentionResolver(
    clientReturning([
      {
        id: "50000000-0000-4000-8000-000000000005",
        room_id: "40000000-0000-4000-8000-000000000004",
        created_at: "2026-07-20T10:00:00.000Z",
        discovery_rooms: { name: "Checkout", organization_id: CONTEXT.organizationId },
      },
    ]),
  );

  const items = await resolver.resolve(CONTEXT);

  expect(items).toEqual([
    {
      id: "50000000-0000-4000-8000-000000000005",
      kind: "mention",
      title: "You were mentioned in Checkout",
      roomId: "40000000-0000-4000-8000-000000000004",
      roomName: "Checkout",
      occurredAt: "2026-07-20T10:00:00.000Z",
      href: `/${CONTEXT.organizationId}/discovery/40000000-0000-4000-8000-000000000004`,
    },
  ]);
});

it("drops mentions from another organization", async () => {
  const resolver = createMentionResolver(
    clientReturning([
      {
        id: "50000000-0000-4000-8000-000000000006",
        room_id: "40000000-0000-4000-8000-000000000007",
        created_at: "2026-07-20T10:00:00.000Z",
        discovery_rooms: {
          name: "Other org room",
          organization_id: "20000000-0000-4000-8000-000000000099",
        },
      },
    ]),
  );

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

it("throws when the query fails", async () => {
  const resolver = createMentionResolver({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: async () => ({
              data: null,
              error: { message: "boom" },
            }),
          }),
        }),
      }),
    }),
  });

  await expect(resolver.resolve(CONTEXT)).rejects.toThrow(
    "We could not load mentions.",
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/home/attention/mention-resolver.test.ts`
Expected: FAIL — cannot resolve `./mention-resolver`.

- [ ] **Step 3: Implement the resolver**

Create `apps/web/src/features/home/attention/mention-resolver.ts`:

```ts
import type { AttentionItem, AttentionResolver } from "./types";

type MentionRow = {
  id: string;
  room_id: string;
  created_at: string;
  discovery_rooms: {
    name: string;
    organization_id: string;
  } | null;
};

export type MentionQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        is: (
          column: string,
          value: null,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{
            data: MentionRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export function createMentionResolver(
  supabase: MentionQueryClient,
): AttentionResolver {
  return {
    kind: "mention",
    async resolve(context) {
      const result = await supabase
        .from("mentions")
        .select(
          "id,room_id,created_at,discovery_rooms(name,organization_id)",
        )
        .eq("mentioned_user_id", context.userId)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false });

      if (result.error) {
        throw new Error("We could not load mentions.");
      }

      return (result.data ?? [])
        .filter(
          (row) =>
            row.discovery_rooms?.organization_id ===
            context.organizationId,
        )
        .map((row): AttentionItem => {
          const roomName = row.discovery_rooms?.name ?? "a room";
          return {
            id: row.id,
            kind: "mention",
            title: `You were mentioned in ${roomName}`,
            roomId: row.room_id,
            roomName,
            occurredAt: row.created_at,
            href: `/${context.organizationId}/discovery/${row.room_id}`,
          };
        });
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/home/attention/mention-resolver.test.ts`
Expected: PASS — all three tests.

- [ ] **Step 5: Add the server actions**

Create `apps/web/src/features/home/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { composeAttentionItems } from "./attention/registry";
import {
  createMentionResolver,
  type MentionQueryClient,
} from "./attention/mention-resolver";
import type { AttentionItem } from "./attention/types";

export async function listAttentionItems(
  organizationId: string,
): Promise<AttentionItem[]> {
  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  return composeAttentionItems(
    [
      createMentionResolver(
        supabase as unknown as MentionQueryClient,
      ),
    ],
    { userId: user.id, organizationId },
  );
}

export async function acknowledgeMention(mentionId: string) {
  const supabase = await createClient(new Headers());
  const { error } = await supabase
    .from("mentions")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", mentionId);

  if (error) {
    throw new Error("We could not update that mention.");
  }
}
```

Row-level security restricts the update to the acknowledging user's own mentions, proven by the pgTAP suite in Task 4.

- [ ] **Step 6: Run typecheck and the home suite**

Run: `pnpm --filter web exec vitest run src/features/home && pnpm --filter web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/home
git commit -m "feat: resolve unacknowledged mentions into attention items"
```

---

### Task 7: Needs attention section

Renders items as dense rows with an acknowledge affordance.

**Files:**
- Create: `apps/web/src/features/home/components/needs-attention.tsx`
- Create: `apps/web/src/features/home/components/needs-attention.test.tsx`

**Interfaces:**
- Consumes: `AttentionItem` from `../attention/types`; `acknowledgeMention` from `../actions`
- Produces: `NeedsAttention({ items }: { items: AttentionItem[] })`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/home/components/needs-attention.test.tsx`:

```tsx
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AttentionItem } from "../attention/types";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

vi.stubGlobal(
  "ResizeObserver",
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  acknowledgeMention: vi.fn(),
}));

import { NeedsAttention } from "./needs-attention";

const ITEM: AttentionItem = {
  id: "50000000-0000-4000-8000-000000000005",
  kind: "mention",
  title: "You were mentioned in Checkout",
  roomId: "40000000-0000-4000-8000-000000000004",
  roomName: "Checkout",
  occurredAt: "2026-07-20T10:00:00.000Z",
  href: "/org/discovery/room",
};

afterEach(cleanup);

it("lists each item with a link to its room", () => {
  render(<NeedsAttention items={[ITEM]} />);

  expect(
    screen.getByText("You were mentioned in Checkout"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: /You were mentioned in Checkout/,
    }),
  ).toHaveAttribute("href", "/org/discovery/room");
});

it("tells the user when nothing needs them", () => {
  render(<NeedsAttention items={[]} />);

  expect(screen.getByText("You're all caught up")).toBeInTheDocument();
});

it("offers to dismiss a mention", () => {
  render(<NeedsAttention items={[ITEM]} />);

  expect(
    screen.getByRole("button", { name: "Dismiss" }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/home/components/needs-attention.test.tsx`
Expected: FAIL — cannot resolve `./needs-attention`.

- [ ] **Step 3: Implement the section**

Create `apps/web/src/features/home/components/needs-attention.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acknowledgeMention } from "../actions";
import type { AttentionItem } from "../attention/types";

export function NeedsAttention({
  items,
}: {
  items: AttentionItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <EmptyState
        title="You're all caught up"
        description="Approvals, mentions, and agent results will appear here."
        headingLevel={2}
        isCompact
      />
    );
  }

  return (
    <List
      hasDividers
      header={<Heading level={2}>Needs attention</Heading>}
    >
      {items.map((item) => (
        <ListItem
          key={item.id}
          label={item.title}
          description={item.roomName}
          href={item.href}
          endContent={
            <>
              <Timestamp value={item.occurredAt} />
              {item.kind === "mention" ? (
                <Button
                  label="Dismiss"
                  variant="ghost"
                  size="sm"
                  isDisabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await acknowledgeMention(item.id);
                      router.refresh();
                    });
                  }}
                />
              ) : null}
            </>
          }
        />
      ))}
    </List>
  );
}
```

`Timestamp` takes `value: string | number` — verified against
`node_modules/@astryxdesign/core/dist/Timestamp/Timestamp.d.ts`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/home/components/needs-attention.test.tsx`
Expected: PASS — all three tests.

- [ ] **Step 5: Verify conventions**

Run: `pnpm check:astryx`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/home/components
git commit -m "feat: add needs attention section"
```

---

### Task 8: Room summaries with last activity

Gives the rooms list something the sidebar does not have: state.

**Files:**
- Modify: `apps/web/src/features/discovery/repository.ts:88-102`
- Modify: `apps/web/src/features/discovery/e2e-fake.ts:95-107`
- Create: `apps/web/src/features/home/components/room-summary-list.tsx`
- Create: `apps/web/src/features/home/components/room-summary-list.test.tsx`

**Interfaces:**
- Consumes: `DiscoveryRoom` from `@/features/discovery/repository`, now including `lastActivityAt: string`
- Produces: `RoomSummaryList({ organizationId, rooms }: { organizationId: string; rooms: DiscoveryRoom[] })`

- [ ] **Step 1: Add `lastActivityAt` to the repository query**

In `apps/web/src/features/discovery/repository.ts`, replace the `listRooms` body (lines 88-102) with:

```ts
    async listRooms(organizationId: string) {
      const result = await supabase
        .from("discovery_rooms")
        .select(
          "id,organization_id,name,owner_id,created_at,messages(created_at)",
        )
        .eq("organization_id", organizationId)
        .order("created_at");
      if (result.error) throw new Error("We could not load rooms.");
      return (result.data ?? []).map((room) => {
        const messageTimes = (
          (room as { messages?: { created_at: string }[] }).messages ??
          []
        ).map((message) => message.created_at);
        return {
          id: room.id,
          organizationId: room.organization_id,
          name: room.name,
          ownerId: room.owner_id,
          createdAt: room.created_at,
          lastActivityAt:
            messageTimes.length > 0
              ? messageTimes.reduce((latest, current) =>
                  current > latest ? current : latest,
                )
              : room.created_at,
        };
      }) as DiscoveryRoom[];
    },
```

Add `lastActivityAt: string;` to the `DiscoveryRoom` type in the same file.

- [ ] **Step 2: Update the e2e fake to match**

`fakeListRooms` returns stored room objects directly, so only the creation site
needs the new field. In `apps/web/src/features/discovery/e2e-fake.ts`, inside
`fakeCreateRoom` (line 109), add `lastActivityAt` to the room literal:

```ts
  const createdAt = new Date().toISOString();
  const room: DiscoveryRoom = {
    id: randomUUID(),
    organizationId: input.organizationId,
    name: input.name,
    ownerId: context.user.id,
    createdAt,
    lastActivityAt: createdAt,
  };
```

The fake must satisfy the same `DiscoveryRoom` type or `pnpm typecheck` fails.

- [ ] **Step 3: Run the existing repository tests**

Run: `pnpm --filter web exec vitest run src/features/discovery`
Expected: PASS. If a test asserts the exact shape of a room object, update it to include `lastActivityAt`.

- [ ] **Step 4: Write the failing list test**

Create `apps/web/src/features/home/components/room-summary-list.test.tsx` with the same jsdom header and `matchMedia`/`ResizeObserver` stubs used in Task 7, then:

```tsx
import { RoomSummaryList } from "./room-summary-list";

const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";

it("links each room and shows its last activity", () => {
  render(
    <RoomSummaryList
      organizationId={ORGANIZATION_ID}
      rooms={[
        {
          id: "40000000-0000-4000-8000-000000000004",
          organizationId: ORGANIZATION_ID,
          name: "Checkout",
          ownerId: "10000000-0000-4000-8000-000000000001",
          createdAt: "2026-07-01T00:00:00.000Z",
          lastActivityAt: "2026-07-20T10:00:00.000Z",
        },
      ]}
    />,
  );

  expect(
    screen.getByRole("link", { name: /Checkout/ }),
  ).toHaveAttribute(
    "href",
    `/${ORGANIZATION_ID}/discovery/40000000-0000-4000-8000-000000000004`,
  );
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/home/components/room-summary-list.test.tsx`
Expected: FAIL — cannot resolve `./room-summary-list`.

- [ ] **Step 6: Implement the list**

Create `apps/web/src/features/home/components/room-summary-list.tsx`:

```tsx
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import type { DiscoveryRoom } from "@/features/discovery/repository";

export function RoomSummaryList({
  organizationId,
  rooms,
}: {
  organizationId: string;
  rooms: DiscoveryRoom[];
}) {
  return (
    <List
      hasDividers
      header={<Heading level={2}>Your rooms</Heading>}
    >
      {rooms.map((room) => (
        <ListItem
          key={room.id}
          label={room.name}
          href={`/${organizationId}/discovery/${room.id}`}
          endContent={<Timestamp value={room.lastActivityAt} />}
        />
      ))}
    </List>
  );
}
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm --filter web exec vitest run src/features && pnpm --filter web typecheck && pnpm check:astryx`
Expected: PASS, exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features
git commit -m "feat: show rooms with last activity on home"
```

---

### Task 9: Tenure rebalancing and end-to-end verification

Assembles the screen and proves the whole path.

**Files:**
- Modify: `apps/web/src/app/(app)/[organizationId]/page.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/page.test.tsx`
- Modify: `e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: `StartingPoints`, `NeedsAttention`, `RoomSummaryList`, `listAttentionItems`, `listDiscoveryRooms`

- [ ] **Step 1: Write the failing weighting tests**

Append to `apps/web/src/app/(app)/[organizationId]/page.test.tsx`, adding a `listAttentionItems` mock alongside the existing `listDiscoveryRooms` one:

```tsx
it("lets the cards carry the screen when there are no rooms", async () => {
  mocks.listDiscoveryRooms.mockResolvedValue([]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(
    screen.getByRole("button", { name: "Start a Discovery Room" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Your rooms")).not.toBeInTheDocument();
  expect(
    screen.queryByText("You're all caught up"),
  ).not.toBeInTheDocument();
});

it("leads with needs attention once rooms exist", async () => {
  mocks.listDiscoveryRooms.mockResolvedValue([
    {
      id: "40000000-0000-4000-8000-000000000004",
      organizationId: ORGANIZATION_ID,
      name: "Checkout",
      ownerId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-07-01T00:00:00.000Z",
      lastActivityAt: "2026-07-20T10:00:00.000Z",
    },
  ]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(screen.getByText("Your rooms")).toBeInTheDocument();
  expect(
    screen.getByText("You're all caught up"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Start a Discovery Room" }),
  ).not.toBeInTheDocument();
});
```

Add to the `vi.hoisted` mocks block and the `@/features/home/actions` mock:

```tsx
vi.mock("@/features/home/actions", () => ({
  listAttentionItems: mocks.listAttentionItems,
}));
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web exec vitest run "src/app/(app)/[organizationId]/page.test.tsx"`
Expected: FAIL — `Your rooms` is absent in the established case.

- [ ] **Step 3: Implement both weightings**

Replace `apps/web/src/app/(app)/[organizationId]/page.tsx` with:

```tsx
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { StackItem } from "@astryxdesign/core/Stack";
import { VStack } from "@astryxdesign/core/VStack";
import { listDiscoveryRooms } from "@/features/discovery/actions";
import { listAttentionItems } from "@/features/home/actions";
import { NeedsAttention } from "@/features/home/components/needs-attention";
import { RoomSummaryList } from "@/features/home/components/room-summary-list";
import { StartingPoints } from "@/features/home/components/starting-points";

export default async function HomePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const rooms = await listDiscoveryRooms(organizationId);
  const isFresh = rooms.length === 0;

  if (isFresh) {
    return (
      <Layout height="fill">
        <LayoutContent padding={6}>
          <VStack gap={6} width="100%">
            <Heading level={1}>What are you building?</Heading>
            <StartingPoints organizationId={organizationId} />
          </VStack>
        </LayoutContent>
      </Layout>
    );
  }

  const attentionItems = await listAttentionItems(organizationId);

  return (
    <Layout height="fill">
      <LayoutContent padding={6}>
        <VStack gap={6} width="100%">
          <HStack gap={4} vAlign="center" width="100%">
            <StackItem size="fill">
              <Heading level={2}>What are you building?</Heading>
            </StackItem>
            <StartingPoints
              organizationId={organizationId}
              isCompact
            />
          </HStack>
          <NeedsAttention items={attentionItems} />
          <RoomSummaryList
            organizationId={organizationId}
            rooms={rooms}
          />
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
```

- [ ] **Step 4: Add the compact mode to `StartingPoints`**

In `apps/web/src/features/home/components/starting-points.tsx`, change the
signature and extract the card row behind an `isCompact` branch. The dialogs
render in both modes.

```tsx
export function StartingPoints({
  organizationId,
  isCompact = false,
}: {
  organizationId: string;
  isCompact?: boolean;
}) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>("none");

  return (
    <>
      {isCompact ? (
        <HStack gap={2}>
          <Button
            label="New room"
            variant="primary"
            size="sm"
            onClick={() => setOpenDialog("create")}
          />
          <Button
            label="Upload"
            variant="secondary"
            size="sm"
            onClick={() => setOpenDialog("upload")}
          />
        </HStack>
      ) : (
        <HStack gap={4} width="100%">
          {/* the two ClickableCards from Task 2, unchanged */}
        </HStack>
      )}
      {/* the two dialogs from Task 2, unchanged */}
    </>
  );
}
```

Keep the existing card markup verbatim inside the `else` branch and the existing
dialog markup verbatim after it — do not retype them. Add
`import { Button } from "@astryxdesign/core/Button";` at the top.

Verify `Button`'s `variant` accepts `"secondary"` by reading
`node_modules/@astryxdesign/core/dist/Button/Button.d.ts`; if it does not, use
the ghost or default variant rather than inventing one.

- [ ] **Step 5: Run the page tests**

Run: `pnpm --filter web exec vitest run "src/app/(app)/[organizationId]/page.test.tsx"`
Expected: PASS — all three tests.

- [ ] **Step 6: Assert the post-onboarding landing in Playwright**

In `e2e/onboarding.spec.ts`, find the assertion that follows organization creation and add, after the redirect settles:

```ts
  await expect(page).toHaveURL(
    new RegExp(`/${organizationId}$`),
  );
  await expect(
    page.getByRole("heading", { name: "What are you building?" }),
  ).toBeVisible();
```

Use the organization id the test already has in scope; if it is not captured, read it from `page.url()` after the redirect.

- [ ] **Step 7: Run the E2E suite**

Run: `pnpm exec playwright test e2e/onboarding.spec.ts`
Expected: PASS.

- [ ] **Step 8: Run the full gate**

Run: `pnpm check:astryx && pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all exit 0. Record the actual output; do not claim success without it.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src e2e/onboarding.spec.ts
git commit -m "feat: rebalance home between first run and returning use"
```

---

## Verification Summary

| Spec section | Task |
|---|---|
| 3. Route and redirects | 1 |
| 4. Rebalancing by tenure | 9 |
| 5. Connection strip | Deferred — no data source; lands with connector work |
| 6. Starting-point cards, component-map exception | 2 |
| 6. Upload scope, honest scope for card 2 | 3 |
| 7. Item contract, state not events, failure isolation | 5 |
| 7. Mentions ship now, migration, RLS, pgTAP | 4, 6 |
| 7. Empty state | 7 |
| 8. Your rooms | 8 |
| 10. Error handling | 5 (registry), 8 (rooms) |
| 11. Testing | 1, 5, 6, 7, 8, 9 |
