# Discovery Room Composer Implementation Plan

**Goal:** Build an Astryx-native Discovery Room composer with queued file/image attachments, a morphing Markdown toolbar, teammate and agent mentions, and the circular upward-arrow send action.

**Architecture:** Keep the conversation as the persistence coordinator and make `DiscoveryComposer` responsible for draft interactions. The composer emits one structured submission containing readable Markdown, queued files, and derived mention identities; `Conversation` persists the message first and then uploads queued files against the returned message ID. Pure formatting and mention-derivation helpers remain outside React so selection behavior and submission data can be tested independently.

**Tech Stack:** Next.js 16, React 19, TypeScript, Astryx 0.1.8 (`ChatComposer`, `ChatComposerInput`, `ChatComposerDrawer`, `ChatSendButton`, `Thumbnail`, `Token`, `TypeaheadItem`, `Toolbar`, `Markdown`), Boxicons React, Supabase server actions, Vitest, Testing Library, Playwright.

## Global Constraints

- Use only Astryx components for layout and spacing; do not introduce raw layout `<div>` or `<span>` elements.
- Use Astryx semantic props and `var(--color-*|--spacing-*|--radius-*)` tokens instead of hardcoded styling values.
- Keep the compact composer as the default and preserve the existing body/surface color relationship.
- Queue attachments locally and upload them only after the message persists.
- Accept up to 10 `.txt`, `.md`, `.pdf`, PNG, JPEG, WebP, or GIF files, each no larger than 10 MB.
- Require a non-empty message so image uploads receive accessible caption/context.
- Support bold, italic, strikethrough, link, bulleted list, numbered list, quote, inline code, and code block Markdown.
- Typing `@` and pressing the `@` button must use the same Astryx mention menu.
- Human mention tokens use blue; Product Agent uses purple; Research Agent uses teal.
- Agent mention selection must not simulate or promise an automated response.
- Use Astryx `ChatSendButton`, whose default send glyph is the upward arrow.
- Emoji is out of scope.

---

### Task 1: Markdown formatting and mention derivation helpers

**Files:**
- Create: `apps/web/src/features/discovery/components/composer-model.ts`
- Create: `apps/web/src/features/discovery/composer-model.test.ts`

**Interfaces:**
- Consumes: `AgentKind` from `components/agent-marker.tsx`.
- Produces:
  - `DiscoveryMentionOption`
  - `QueuedDiscoveryAttachment`
  - `DiscoveryComposerSubmission`
  - `MarkdownFormat`
  - `applyMarkdownFormat(value, selectionStart, selectionEnd, format)`
  - `deriveMentionSubmission(value, options)`
  - `validateQueuedFiles(current, incoming)`

- [ ] **Step 1: Write failing tests for Markdown selection behavior**

```ts
import { describe, expect, it } from "vitest";
import { applyMarkdownFormat } from "./components/composer-model";

describe("applyMarkdownFormat", () => {
  it("wraps a selected phrase with Markdown", () => {
    expect(applyMarkdownFormat("Key insight", 0, 3, "bold")).toEqual({
      value: "**Key** insight",
      selectionStart: 2,
      selectionEnd: 5,
    });
  });

  it("inserts a useful placeholder at a collapsed caret", () => {
    expect(applyMarkdownFormat("", 0, 0, "link")).toEqual({
      value: "[link text](https://)",
      selectionStart: 1,
      selectionEnd: 10,
    });
  });
});
```

- [ ] **Step 2: Run the formatting tests and verify they fail**

Run:

```bash
pnpm --filter @meld/web test --run src/features/discovery/composer-model.test.ts
```

Expected: FAIL because `composer-model.ts` does not exist.

- [ ] **Step 3: Add failing tests for mention derivation and attachment validation**

```ts
it("derives only mentions still present in serialized text", () => {
  const options = [
    { id: "human:user-2", label: "maya@example.com", handle: "maya@example.com", kind: "human", userId: "user-2" },
    { id: "agent:product", label: "Product Agent", handle: "product-agent", kind: "product" },
  ] as const;

  expect(
    deriveMentionSubmission(
      "Ask @maya@example.com and @Product Agent",
      options,
    ),
  ).toEqual({
    mentionedUserIds: ["user-2"],
    mentionedAgentKinds: ["product"],
  });
});

it("rejects files above the queue count and size limits", () => {
  const oversized = new File(
    [new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
    "oversized.pdf",
    { type: "application/pdf" },
  );
  expect(validateQueuedFiles([], [oversized]).errors).toContain(
    "oversized.pdf is larger than 10 MB.",
  );
});
```

- [ ] **Step 4: Implement the pure model**

```ts
import type { AgentKind } from "./agent-marker";
import { MAX_ATTACHMENT_BYTES } from "../schemas";

export const MAX_COMPOSER_ATTACHMENTS = 10;

export type DiscoveryMentionOption = {
  id: string;
  label: string;
  handle: string;
  kind: "human" | AgentKind;
  userId?: string;
  description?: string;
};

export type QueuedDiscoveryAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
};

export type DiscoveryComposerSubmission = {
  body: string;
  attachments: QueuedDiscoveryAttachment[];
  mentionedUserIds: string[];
  mentionedAgentKinds: AgentKind[];
};

export type MarkdownFormat =
  | "bold"
  | "italic"
  | "strikethrough"
  | "link"
  | "bulleted-list"
  | "numbered-list"
  | "quote"
  | "inline-code"
  | "code-block";

const FORMATTERS: Record<
  MarkdownFormat,
  (selected: string) => { text: string; selectFrom: number; selectLength: number }
> = {
  bold: (selected) => wrap("**", selected || "bold text"),
  italic: (selected) => wrap("_", selected || "italic text"),
  strikethrough: (selected) => wrap("~~", selected || "struck text"),
  link: (selected) => ({
    text: `[${selected || "link text"}](https://)`,
    selectFrom: 1,
    selectLength: (selected || "link text").length,
  }),
  "bulleted-list": (selected) => prefixLines("- ", selected || "list item"),
  "numbered-list": (selected) => prefixNumberedLines(selected || "list item"),
  quote: (selected) => prefixLines("> ", selected || "quote"),
  "inline-code": (selected) => wrap("`", selected || "code"),
  "code-block": (selected) => ({
    text: `\`\`\`\n${selected || "code"}\n\`\`\``,
    selectFrom: 4,
    selectLength: (selected || "code").length,
  }),
};
```

Complete the helper implementations so returned selection offsets refer to
the newly inserted content. Validate MIME type, 10 MB size, duplicate
`name/size/lastModified`, and the 10-file maximum. Create object URLs only
for accepted images.

- [ ] **Step 5: Run the model tests**

Run:

```bash
pnpm --filter @meld/web test --run src/features/discovery/composer-model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the model**

```bash
git add apps/web/src/features/discovery/components/composer-model.ts apps/web/src/features/discovery/composer-model.test.ts
git commit -m "feat: add discovery composer interaction model"
```

---

### Task 2: Astryx composer attachments, formatting morph, and mention picker

**Files:**
- Modify: `apps/web/src/features/discovery/components/composer.tsx`
- Create: `apps/web/src/features/discovery/composer.test.tsx`

**Interfaces:**
- Consumes:
  - `DiscoveryMentionOption`, `QueuedDiscoveryAttachment`,
    `DiscoveryComposerSubmission`, and model helpers from Task 1.
  - `AgentMarker` from `components/agent-marker.tsx`.
- Produces:
  - `DiscoveryComposer({ value, onChange, onSubmit, mentions, status })`
  - `onSubmit(submission): Promise<boolean>` where `false` preserves queued attachments.

- [ ] **Step 1: Write the failing compact composer test**

```tsx
it("renders compact attachment, formatting, mention, and arrow-up send actions", () => {
  renderComposer();
  expect(screen.getByRole("button", { name: "Add files or images" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Formatting" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Mention someone" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Send" })).toBeVisible();
});
```

- [ ] **Step 2: Write failing morph and formatting tests**

```tsx
it("morphs into the Markdown toolbar without losing the draft", async () => {
  renderComposer({ value: "Customer evidence" });
  await user.click(screen.getByRole("button", { name: "Formatting" }));
  expect(screen.getByRole("toolbar", { name: "Format message" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveTextContent("Customer evidence");
  expect(screen.getByRole("button", { name: "Formatting" })).toHaveAttribute("aria-pressed", "true");
});
```

Add one interaction assertion for bold and one for a list action, verifying
that the controlled `onChange` receives Markdown and focus returns to the
editor.

- [ ] **Step 3: Write failing attachment queue tests**

```tsx
it("queues images as thumbnails and documents as removable tokens", async () => {
  renderComposer();
  await user.upload(screen.getByLabelText("Add files or images"), [
    imageFile,
    pdfFile,
  ]);
  expect(screen.getByRole("img", { name: "interview.png" })).toBeVisible();
  expect(screen.getByText("research.pdf")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Remove research.pdf" }));
  expect(screen.queryByText("research.pdf")).not.toBeInTheDocument();
});
```

Also cover paste/drop via `ChatComposerInput.onFiles`, duplicate rejection,
count limit, and object URL revocation on removal/unmount.

- [ ] **Step 4: Write failing mention menu and inline token tests**

```tsx
it("opens the same mention picker from the button and inserts Astryx tokens", async () => {
  renderComposer({ mentions });
  await user.click(screen.getByRole("button", { name: "Mention someone" }));
  expect(screen.getByRole("listbox", { name: "Mention a teammate or agent" })).toBeVisible();
  await user.click(screen.getByText("Product Agent"));
  expect(screen.getByText("@Product Agent")).toHaveAttribute("data-variant", "purple");
});
```

Add teammate/blue and Research Agent/teal cases. Verify `TypeaheadItem`
renders a human `Avatar` or existing `AgentMarker` and that typing `@`
opens the identical option source.

- [ ] **Step 5: Implement the composer with Astryx slots**

Use:

```tsx
<ChatComposer
  value={value}
  onChange={onChange}
  onSubmit={submit}
  drawer={attachments.length > 0 ? <AttachmentDrawer /> : undefined}
  headerActions={isFormattingOpen ? <FormattingToolbar /> : undefined}
  input={
    <ChatComposerInput
      ref={editorRef}
      handleRef={inputHandleRef}
      value={value}
      onChange={onChange}
      onSubmit={submit}
      onFiles={queueFiles}
      triggers={[mentionTrigger]}
      maxRows={isFormattingOpen ? 12 : 8}
      pasteAsToken={false}
    />
  }
  footerActions={<ComposerFooterActions />}
  sendButton={<ChatSendButton />}
/>
```

Render `ChatComposerDrawer` with an Astryx `Carousel` of `Thumbnail`
images and an `HStack` of removable `Token` files. Use an accessible
native file input only as the non-layout file-picker control, activated by
the Astryx icon button. Use Boxicons `Plus`, `At`, `Bold`, `Italic`,
`Strikethrough`, `Link`, `ListUl`, `ListOl`, `QuoteLeft`, and `Code`.

The formatting toggle uses Astryx `ToggleButton`. The formatting toolbar
uses `Toolbar` with small `IconButton` actions and no emoji control.
Provide explicit labels/tooltips. Render `ChatSendButton` without a custom
`sendIcon`; Astryx supplies the approved upward arrow.

Use `createStaticSource()` and `ChatComposerTrigger` for mentions.
`onSelect` returns:

```ts
{
  value: `@${option.label}`,
  label: `@${option.label}`,
  variant:
    option.kind === "human"
      ? "blue"
      : option.kind === "product"
        ? "purple"
        : "teal",
}
```

After the mention button inserts `@`, dispatch a bubbling input event on
the editor so Astryx opens the same trigger menu used by typing.

- [ ] **Step 6: Run composer tests and lint**

Run:

```bash
pnpm --filter @meld/web test --run src/features/discovery/composer.test.tsx
pnpm --filter @meld/web exec eslint src/features/discovery/components/composer.tsx src/features/discovery/composer.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the composer UI**

```bash
git add apps/web/src/features/discovery/components/composer.tsx apps/web/src/features/discovery/composer.test.tsx
git commit -m "feat: build rich discovery room composer"
```

---

### Task 3: Persist structured mentions and queued attachments

**Files:**
- Modify: `apps/web/src/features/discovery/components/conversation.tsx`
- Modify: `apps/web/src/features/discovery/conversation.test.tsx`

**Interfaces:**
- Consumes:
  - `DiscoveryComposerSubmission` from Task 1.
  - `postMessage(input): Promise<DiscoveryMessage>`.
  - `uploadAttachment(formData): Promise<{ id: string; originalName: string; extractionStatus: string }>`.
- Produces:
  - `submit(submission): Promise<boolean>`.
  - Optional injectable `uploadFile` prop for deterministic tests.

- [ ] **Step 1: Write a failing structured submission test**

```tsx
it("posts derived teammate mentions and uploads queued files after persistence", async () => {
  const sendMessage = vi.fn().mockResolvedValue(persistedMessage);
  const uploadFile = vi.fn().mockResolvedValue({
    id: "attachment-1",
    originalName: "research.pdf",
    extractionStatus: "ready",
  });
  renderConversation({ sendMessage, uploadFile, participants });

  await queueFileAndMentionMaya();
  await user.click(screen.getByRole("button", { name: "Send" }));

  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      mentionedUserIds: ["10000000-0000-4000-8000-000000000002"],
    }),
  );
  await waitFor(() =>
    expect(uploadFile).toHaveBeenCalledWith(expect.any(FormData)),
  );
  const form = uploadFile.mock.calls[0][0] as FormData;
  expect(form.get("messageId")).toBe(persistedMessage.id);
  expect(form.get("file")).toBe(pdfFile);
});
```

- [ ] **Step 2: Write failure-ordering tests**

Cover these exact contracts:

- `uploadFile` is not called when `sendMessage` rejects;
- queued files remain when message persistence fails;
- image uploads receive the message body as `caption`;
- multiple uploads use `Promise.allSettled`;
- the error lists only failed file names;
- the message remains reconciled when one attachment upload fails.

- [ ] **Step 3: Build mention options from room participants and agents**

Create a memoized array:

```ts
const mentionOptions: DiscoveryMentionOption[] = [
  ...participants.map((participant) => ({
    id: `human:${participant.userId}`,
    userId: participant.userId,
    label: participant.email,
    handle: participant.email,
    kind: "human" as const,
    description: "Room teammate",
  })),
  ...DISCOVERY_AGENTS.map((agent) => ({
    id: agent.id,
    label: agent.name,
    handle: agent.kind === "product" ? "product-agent" : "research-agent",
    kind: agent.kind,
    description: "Room agent",
  })),
];
```

Pass it to `DiscoveryComposer`.

- [ ] **Step 4: Implement persistence ordering**

Change the submit handler to accept `DiscoveryComposerSubmission`. Keep the
optimistic message insertion, but send:

```ts
const input: MessageInput = {
  roomId,
  clientId,
  body: submission.body,
  mentionedUserIds: submission.mentionedUserIds,
  mentionsProductAgent: false,
};
```

After `sendMessage(input)` resolves, reconcile the persisted message and
upload every queued attachment with `roomId`, `messageId`, `file`, and an
image `caption` equal to `submission.body`. Return `false` only when the
message itself fails, restoring the body and preserving the attachment
queue. Return `true` after message persistence even if an upload fails;
show failed file names through the existing composer status.

- [ ] **Step 5: Render message bodies with Astryx Markdown**

Replace:

```tsx
<Text>{message.body}</Text>
```

with:

```tsx
<Markdown density="compact" autolink="gfm">
  {message.body}
</Markdown>
```

Add an assertion that `**important**` renders a `strong` element and a
list renders as a semantic list within the message row.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @meld/web test --run src/features/discovery/conversation.test.tsx src/features/discovery/composer.test.tsx
pnpm --filter @meld/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit persistence integration**

```bash
git add apps/web/src/features/discovery/components/conversation.tsx apps/web/src/features/discovery/conversation.test.tsx
git commit -m "feat: send rich discovery room messages"
```

---

### Task 4: Browser interaction and responsive verification

**Files:**
- Create: `apps/web/e2e/discovery-room-composer.spec.ts` if the repository keeps permanent E2E coverage, otherwise use `.context/discovery-room-composer-visual.spec.ts` for local visual verification.
- Modify only if needed after inspection: `apps/web/src/features/discovery/components/composer.tsx`

**Interfaces:**
- Consumes: completed composer and conversation integration.
- Produces: browser evidence for all approved composer states.

- [ ] **Step 1: Add the browser scenario**

```ts
test("uses the compact and expanded discovery composer states", async ({ page }) => {
  await openFakeDiscoveryRoom(page);

  await expect(page.getByRole("button", { name: "Add files or images" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  await page.getByRole("button", { name: "Formatting" }).click();
  await expect(page.getByRole("toolbar", { name: "Format message" })).toBeVisible();

  await page.getByRole("button", { name: "Mention someone" }).click();
  await expect(page.getByRole("listbox", { name: "Mention a teammate or agent" })).toBeVisible();
  await page.getByText("Research Agent").click();
  await expect(page.getByText("@Research Agent")).toBeVisible();

  await page.getByLabel("Add files or images").setInputFiles([
    "e2e/fixtures/interview.png",
    "e2e/fixtures/research.pdf",
  ]);
  await expect(page.getByRole("img", { name: "interview.png" })).toBeVisible();
  await expect(page.getByText("research.pdf")).toBeVisible();
});
```

- [ ] **Step 2: Capture and inspect four visual states**

Capture desktop screenshots for:

1. compact composer;
2. expanded formatting toolbar;
3. attachment drawer;
4. mention picker with people and agent markers.

Check that the composer stays docked to the footer, its surface continues
to match the sidebar, controls are not cramped, the mention menu is not
clipped, and the upward arrow remains centered in the send circle.

- [ ] **Step 3: Verify narrow layout and keyboard behavior**

Use a mobile-width viewport. Confirm the toolbar remains usable, Escape
closes the mention menu, arrow keys move through results, Enter selects a
mention, Shift+Enter inserts a newline, and Enter sends a non-empty draft.

- [ ] **Step 4: Run the final quality gate**

Run:

```bash
pnpm --filter @meld/web test --run src/features/discovery
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm exec playwright test apps/web/e2e/discovery-room-composer.spec.ts
git diff --check
```

Expected: all checks pass. If unrelated worktree files block the global
lint or E2E command, run the equivalent focused command for every file
changed by this plan and report the unrelated blocker without modifying it.

- [ ] **Step 5: Commit any visual polish**

```bash
git add apps/web/src/features/discovery/components/composer.tsx apps/web/e2e/discovery-room-composer.spec.ts
git commit -m "test: verify discovery room composer interactions"
```
