# Discovery Composer Staged Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Discovery Room composer upload and validate attachments before Send, render those attachments inside the composer and their sent messages, fix single-mention Backspace deletion, modestly increase the input height, and use a plain Boxicons upward-arrow send icon.

**Architecture:** Files are persisted as room-scoped staged attachments with no `message_id`; the composer owns local upload states and disables only submission while any file is pending or failed. Sending persists the message through the existing optimistic/realtime path, then an authenticated SQL function atomically associates the already-uploaded attachment IDs and updates image captions to the final message body. Conversation state combines the signed staged-upload result with persisted page data so images and files render immediately and after reload.

**Tech Stack:** Next.js 16 server actions, React 19, TypeScript, Supabase/PostgreSQL RLS, Astryx Design System 0.1.8, Boxicons React, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve all unrelated dirty work, especially concurrent changes in `apps/web/src/features/discovery/actions.ts`, `apps/web/src/features/discovery/actions.test.ts`, home components, layout files, and `docs/product-feature-checklist.md`.
- Before editing Astryx UI, run `pnpm exec astryx build "chat composer staged uploads attachment status and message image previews"` and inspect every used component with `pnpm exec astryx component <Name>`.
- Use Astryx layout primitives rather than raw `<div>` or `<span>` layout; use token-backed values rather than raw color, spacing, radius, or size literals.
- Keep the existing maximum of ten attachments and 10 MB per file.
- Keep the message body required.
- Upload transfer must finish before Send is enabled; a failed upload blocks Send until the file is removed and re-added.
- Files and images must render inside the rounded composer body, not in `ChatComposerDrawer`.
- A sole mention token must be completely removable with one Backspace.
- Use the Boxicons plain `ArrowUp` icon in `ChatSendButton`.
- Image and file attachments must render in their associated message immediately and after page reload.

---

### Task 1: Staged Attachment Persistence Contract

**Files:**
- Create: `apps/web/src/features/discovery/attachment-types.ts`
- Create: `supabase/migrations/202607260002_link_staged_discovery_attachments.sql`
- Modify: `apps/web/src/features/discovery/schemas.ts`
- Modify: `apps/web/src/features/discovery/actions.ts`
- Modify: `apps/web/src/features/discovery/actions.test.ts`
- Modify: `apps/web/src/features/discovery/repository.ts`
- Test: `apps/web/src/features/discovery/repository.test.ts`
- Modify: `apps/web/src/features/discovery/e2e-fake.ts`
- Test: `apps/web/src/features/discovery/e2e-fake.test.ts`

**Interfaces:**
- Produces:

```ts
export type DiscoveryAttachmentView = {
  id: string;
  messageId: string | null;
  originalName: string;
  mimeType: string;
  caption: string | null;
  extractionStatus: string;
  viewUrl: string | null;
};

export async function stageDiscoveryAttachment(
  formData: FormData,
): Promise<DiscoveryAttachmentView>;

export async function discardStagedDiscoveryAttachment(input: {
  roomId: string;
  attachmentId: string;
}): Promise<void>;

export async function linkStagedDiscoveryAttachments(input: {
  roomId: string;
  messageId: string;
  attachmentIds: string[];
  caption: string;
}): Promise<string[]>;
```

- Consumes: existing `uploadAttachment`, authenticated Supabase repository, private `discovery-attachments` bucket, and nullable `attachments.message_id`.

- [ ] **Step 1: Add failing schema and action tests**

Append tests without replacing the concurrent invite-candidate coverage already present in `actions.test.ts`.

```ts
it("stages an image with a provisional caption and returns a signed view", async () => {
  const file = new File(["image"], "interview.png", { type: "image/png" });
  const form = new FormData();
  form.set("roomId", ROOM_ID);
  form.set("file", file);

  const result = await stageDiscoveryAttachment(form);

  expect(mocks.persistAttachmentUpload).toHaveBeenCalledWith(
    expect.objectContaining({
      attachment: expect.objectContaining({
        roomId: ROOM_ID,
        messageId: undefined,
        caption: "interview.png",
      }),
    }),
  );
  expect(result).toEqual(
    expect.objectContaining({
      messageId: null,
      originalName: "interview.png",
      mimeType: "image/png",
      viewUrl: expect.stringContaining("signed"),
    }),
  );
});

it("links every staged id to one message", async () => {
  mocks.rpc.mockResolvedValue({
    data: [{ attachment_id: ATTACHMENT_ID }],
    error: null,
  });

  await expect(
    linkStagedDiscoveryAttachments({
      roomId: ROOM_ID,
      messageId: MESSAGE_ID,
      attachmentIds: [ATTACHMENT_ID],
      caption: "Customer interview screenshot",
    }),
  ).resolves.toEqual([ATTACHMENT_ID]);
});

it("rejects a partial staged-link result", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });

  await expect(
    linkStagedDiscoveryAttachments({
      roomId: ROOM_ID,
      messageId: MESSAGE_ID,
      attachmentIds: [ATTACHMENT_ID],
      caption: "Customer interview screenshot",
    }),
  ).rejects.toThrow("We could not attach every uploaded file.");
});
```

Add repository/action coverage that discarding only targets an attachment
uploaded by the authenticated user, with `message_id is null`, removes the
private storage object, and then deletes its metadata.

- [ ] **Step 2: Run the focused persistence tests and verify the red state**

Run:

```bash
pnpm --filter @meld/web test --run \
  src/features/discovery/actions.test.ts \
  src/features/discovery/repository.test.ts
```

Expected: failures because the shared attachment type, staging/link/discard
actions, and repository methods do not exist.

- [ ] **Step 3: Add shared types and strict input schemas**

Create `attachment-types.ts` with the exact `DiscoveryAttachmentView` type
above. Add schemas:

```ts
export const StagedAttachmentLinkInputSchema = z.object({
  roomId: z.string().uuid(),
  messageId: z.string().uuid(),
  attachmentIds: z.array(z.string().uuid()).min(1).max(10),
  caption: z.string().trim().min(1).max(2_000),
});

export const StagedAttachmentDiscardInputSchema = z.object({
  roomId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});
```

Do not relax the existing transport limit or allowed MIME types.

- [ ] **Step 4: Add the transactional link migration**

Create an authenticated, security-invoker SQL function that updates only the
current user's unattached uploads and only for a message authored by that user:

```sql
create or replace function public.link_staged_discovery_attachments(
  target_room_id uuid,
  target_message_id uuid,
  target_attachment_ids uuid[],
  final_caption text
)
returns table (attachment_id uuid)
language sql
security invoker
set search_path = public
as $$
  update public.attachments as attachment
  set
    message_id = target_message_id,
    caption = case
      when attachment.mime_type like 'image/%' then final_caption
      else attachment.caption
    end,
    extracted_text = case
      when attachment.mime_type like 'image/%' then final_caption
      else attachment.extracted_text
    end
  where attachment.room_id = target_room_id
    and attachment.uploaded_by = auth.uid()
    and attachment.message_id is null
    and attachment.id = any(target_attachment_ids)
    and exists (
      select 1
      from public.messages as message
      where message.id = target_message_id
        and message.room_id = target_room_id
        and message.author_id = auth.uid()
    )
  returning attachment.id;
$$;

revoke all on function public.link_staged_discovery_attachments(
  uuid, uuid, uuid[], text
) from public;
grant execute on function public.link_staged_discovery_attachments(
  uuid, uuid, uuid[], text
) to authenticated;
```

Keep RLS enabled; do not use `security definer`.

- [ ] **Step 5: Implement staging, linking, and discard**

`stageDiscoveryAttachment` calls the existing persistence path without a
message ID. For images, use `formData.caption || file.name` as the provisional
caption so an empty draft can upload, then create a one-hour signed URL and
return `DiscoveryAttachmentView`.

`linkStagedDiscoveryAttachments` parses the strict input, calls
`link_staged_discovery_attachments`, compares the returned unique IDs with the
requested IDs, and throws `"We could not attach every uploaded file."` on RPC
error or a partial result.

`discardStagedDiscoveryAttachment` reads an unattached metadata row scoped by
room, ID, and authenticated uploader, removes its storage path from the private
bucket, then deletes the metadata row. Missing/already-linked rows return
without deleting a message attachment.

In discovery fake mode, stage the same metadata in the existing fake room
store. Use a deterministic `data:` URL for image fixtures, support discard only
while `messageId` is null, and link the same attachment IDs to the fake message
ID. `fakeGetRoom` must return the fake attachments so browser reload exercises
the same page-data contract as Supabase.

- [ ] **Step 6: Run persistence and fake-store tests**

Run:

```bash
pnpm --filter @meld/web test --run \
  src/features/discovery/actions.test.ts \
  src/features/discovery/repository.test.ts \
  src/features/discovery/e2e-fake.test.ts
pnpm --filter @meld/web typecheck
pnpm exec eslint \
  apps/web/src/features/discovery/actions.ts \
  apps/web/src/features/discovery/actions.test.ts \
  apps/web/src/features/discovery/repository.ts \
  apps/web/src/features/discovery/repository.test.ts \
  apps/web/src/features/discovery/e2e-fake.ts \
  apps/web/src/features/discovery/e2e-fake.test.ts \
  apps/web/src/features/discovery/schemas.ts \
  apps/web/src/features/discovery/attachment-types.ts
git diff --check
```

Expected: all pass, with concurrent invite action changes preserved.

- [ ] **Step 7: Commit the staged persistence contract**

```bash
git add \
  apps/web/src/features/discovery/attachment-types.ts \
  apps/web/src/features/discovery/schemas.ts \
  apps/web/src/features/discovery/actions.ts \
  apps/web/src/features/discovery/actions.test.ts \
  apps/web/src/features/discovery/repository.ts \
  apps/web/src/features/discovery/repository.test.ts \
  apps/web/src/features/discovery/e2e-fake.ts \
  apps/web/src/features/discovery/e2e-fake.test.ts \
  supabase/migrations/202607260002_link_staged_discovery_attachments.sql
git commit -m "feat: stage discovery room attachments"
```

---

### Task 2: Composer Upload States, Mention Deletion, and Layout

**Files:**
- Create: `apps/web/src/features/discovery/components/composer-attachments.tsx`
- Modify: `apps/web/src/features/discovery/components/composer-model.ts`
- Modify: `apps/web/src/features/discovery/components/composer.tsx`
- Modify: `apps/web/src/features/discovery/composer-model.test.ts`
- Modify: `apps/web/src/features/discovery/composer.test.tsx`

**Interfaces:**
- Consumes: `DiscoveryAttachmentView`, `stageDiscoveryAttachment`, and
  `discardStagedDiscoveryAttachment` callbacks supplied by Conversation.
- Produces:

```ts
export type StagedComposerAttachment =
  | (QueuedDiscoveryAttachment & { status: "uploading" })
  | (QueuedDiscoveryAttachment & {
      status: "failed";
      error: string;
    })
  | (QueuedDiscoveryAttachment & {
      status: "uploaded";
      uploaded: DiscoveryAttachmentView;
    });

export type ReadyDiscoveryComposerAttachment = Extract<
  StagedComposerAttachment,
  { status: "uploaded" }
>;

export type DiscoveryComposerSubmission = {
  body: string;
  attachments: ReadyDiscoveryComposerAttachment[];
  mentionedUserIds: string[];
  mentionedAgentKinds: AgentKind[];
};
```

`DiscoveryComposer` adds:

```ts
onStageAttachment: (
  attachment: QueuedDiscoveryAttachment,
) => Promise<DiscoveryAttachmentView>;
onDiscardStagedAttachment: (attachmentId: string) => Promise<void>;
```

- [ ] **Step 1: Add failing composer regressions**

Add focused tests:

```ts
it("removes a sole mention token with one Backspace", async () => {
  const { user } = renderComposer();
  await user.click(screen.getByRole("button", { name: "Mention someone" }));
  await user.click(screen.getByText("Research Agent"));

  const editor = screen.getByRole("combobox", { name: "Message" });
  await user.click(editor);
  await user.keyboard("{Backspace}");

  expect(editor).toHaveTextContent("");
  expect(screen.queryByText("@Research Agent")).not.toBeInTheDocument();
});

it("blocks send until every staged upload succeeds", async () => {
  const upload = deferred<DiscoveryAttachmentView>();
  const onStageAttachment = vi.fn(() => upload.promise);
  const { user } = renderComposer({
    value: "Review this image",
    onStageAttachment,
  });

  await user.upload(getFileInput(), imageFile());
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(screen.getByRole("img", { name: "interview.png" }))
    .toHaveAttribute("data-loading", "true");

  upload.resolve(uploadedImage);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
  );
});

it("keeps send blocked and reports the file when staging fails", async () => {
  const { user } = renderComposer({
    value: "Review this image",
    onStageAttachment: vi.fn().mockRejectedValue(
      new Error("Upload failed"),
    ),
  });
  await user.upload(getFileInput(), imageFile());

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "interview.png: Upload failed",
  );
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});
```

Also assert that invalid/oversized input never calls `onStageAttachment`, Enter
does not clear the draft while uploads block submission, attachment previews
are descendants of `data-testid="discovery-chat-composer"`, and the custom
send icon is a plain Boxicons `ArrowUp`.

- [ ] **Step 2: Run focused composer tests and verify failures**

Run:

```bash
pnpm --filter @meld/web test --run \
  src/features/discovery/composer-model.test.ts \
  src/features/discovery/composer.test.tsx
```

Expected: the new upload-state, Backspace, inside-composer, and send-icon
assertions fail.

- [ ] **Step 3: Extend the composer attachment model**

Add the discriminated union and type guard:

```ts
export function isReadyComposerAttachment(
  attachment: StagedComposerAttachment,
): attachment is ReadyDiscoveryComposerAttachment {
  return attachment.status === "uploaded";
}
```

Keep `validateQueuedFiles` responsible only for synchronous count, duplicate,
MIME, and byte-size validation. It must validate against queued, uploading,
failed, uploaded, and reserved attachments so the total never exceeds ten.

- [ ] **Step 4: Build the inside-composer attachment presentation**

Create `composer-attachments.tsx` using Astryx `Carousel`, `HStack`,
`Thumbnail`, `Token`, `Text`, and `VStack`.

- Images use their object URL immediately and `Thumbnail isLoading` while
  status is `uploading`.
- Documents use compact tokens with `"Uploading"` or `"Upload failed"` in the
  accessible label.
- Failed items remain removable.
- The component receives `attachments` and `onRemove`; it owns presentation
  only and contains no upload calls.

Place this component in a `VStack` with `ChatComposerInput` through the
composer's `input` slot. Remove `ChatComposerDrawer` entirely so the rounded
composer body contains both previews and editor.

- [ ] **Step 5: Implement staged upload orchestration**

When files pass `validateQueuedFiles`:

1. add each accepted file as `status: "uploading"`;
2. call `onStageAttachment` once per file;
3. replace only that file's state with `uploaded` or `failed`;
4. preserve object URLs until explicit removal, successful send, or unmount.

Remove calls `onDiscardStagedAttachment` only for a persisted staged upload.
If server discard fails, retain the item and show its error rather than hiding
an attachment that may still exist.

Submission is allowed only when the body is non-empty, at least zero
attachments are present, and every present attachment is `uploaded`.
Reserve only ready attachments for the submission; a failed message send
restores the ready records without uploading again.

- [ ] **Step 6: Fix atomic Backspace and blocked Enter**

Pass `onKeyDownCapture` to the `ChatComposerInput` root. For Backspace, inspect
the collapsed selection and remove the adjacent
`[data-astryx-token]` plus its NBSP text node, then dispatch one bubbling
`input` event. Handle both a caret in the trailing text node and a caret whose
container is the editor root after its final child.

When an attachment is uploading or failed, intercept Enter without Shift in
capture phase and prevent submission/clearing. Do not block normal typing or
Shift+Enter.

- [ ] **Step 7: Apply the requested visual polish**

- Keep `density="compact"`.
- Set the `ChatComposerInput` wrapper minimum block size to
  `var(--spacing-8)` so the empty input grows modestly.
- Render:

```tsx
<ChatSendButton
  isDisabled={!canSubmit}
  sendIcon={<Icon icon={ArrowUp} size="sm" />}
/>
```

Import `ArrowUp` from `@boxicons/react`. Do not use the icon registry's boxed
upload glyph.

- [ ] **Step 8: Run composer tests and checks**

Run:

```bash
pnpm --filter @meld/web test --run \
  src/features/discovery/composer-model.test.ts \
  src/features/discovery/composer.test.tsx
pnpm --filter @meld/web typecheck
pnpm exec eslint \
  apps/web/src/features/discovery/components/composer-model.ts \
  apps/web/src/features/discovery/components/composer-attachments.tsx \
  apps/web/src/features/discovery/components/composer.tsx \
  apps/web/src/features/discovery/composer-model.test.ts \
  apps/web/src/features/discovery/composer.test.tsx
git diff --check
```

Expected: all pass.

- [ ] **Step 9: Commit the composer behavior and UI**

```bash
git add \
  apps/web/src/features/discovery/components/composer-model.ts \
  apps/web/src/features/discovery/components/composer-attachments.tsx \
  apps/web/src/features/discovery/components/composer.tsx \
  apps/web/src/features/discovery/composer-model.test.ts \
  apps/web/src/features/discovery/composer.test.tsx
git commit -m "feat: stage files in the discovery composer"
```

---

### Task 3: Associate and Render Message Attachments

**Files:**
- Modify: `apps/web/src/features/discovery/actions.ts`
- Modify: `apps/web/src/features/discovery/components/conversation.tsx`
- Modify: `apps/web/src/features/discovery/conversation.test.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- Test: `apps/web/src/features/discovery/actions.test.ts`

**Interfaces:**
- Consumes: staged upload/discard/link actions from Task 1 and uploaded
  attachment submissions from Task 2.
- Produces: `Conversation.initialAttachments: DiscoveryAttachmentView[]` and
  per-message attachment rendering.

- [ ] **Step 1: Add failing conversation and page-data tests**

Replace post-send transfer expectations with pre-send staging expectations:

```ts
it("uploads before send and links the staged id after persistence", async () => {
  const stageAttachment = vi.fn().mockResolvedValue(uploadedPdf);
  const linkAttachments = vi.fn().mockResolvedValue([uploadedPdf.id]);
  const sendMessage = vi.fn().mockResolvedValue(persistedMessage);
  const { user } = renderConversation({
    stageAttachment,
    linkAttachments,
    sendMessage,
  });

  await user.type(screen.getByRole("combobox", { name: "Message" }), "Review");
  await user.upload(getFileInput(), pdfFile("research.pdf"));
  await waitFor(() => expect(stageAttachment).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "Send" }));

  expect(sendMessage).toHaveBeenCalledOnce();
  expect(linkAttachments).toHaveBeenCalledWith({
    roomId,
    messageId: persistedMessage.id,
    attachmentIds: [uploadedPdf.id],
    caption: "Review",
  });
});

it("renders persisted images under their message", () => {
  renderConversation({
    initialMessages: [persistedMessage],
    initialAttachments: [{
      ...uploadedImage,
      messageId: persistedMessage.id,
    }],
  });

  expect(
    within(screen.getByTestId(`conversation-message-${persistedMessage.clientId}`))
      .getByRole("img", { name: "interview.png" }),
  ).toBeVisible();
});
```

Add coverage for:

- a completed staged upload enabling Send;
- initial documents rendering as downloadable items;
- unattached uploads not rendering in any message;
- newly linked attachments rendering without page refresh;
- realtime-wins/action-rejects using the realtime message ID for linking;
- link failure reporting file names without uploading again;
- message persistence failure restoring ready staged attachments.

- [ ] **Step 2: Run conversation/action tests and verify failures**

Run:

```bash
pnpm --filter @meld/web test --run \
  src/features/discovery/conversation.test.tsx \
  src/features/discovery/actions.test.ts
```

Expected: failures because Conversation still uploads after persistence and
does not accept/render initial attachments.

- [ ] **Step 3: Include message associations in page data**

Update the attachment query to select `message_id` and map it to `messageId`.
Pass `data.attachments` into Conversation:

```tsx
<Conversation
  // existing props
  initialAttachments={data.attachments}
/>
```

Do not pass unattached uploads to message rows; Conversation filters by
`messageId`.

- [ ] **Step 4: Replace post-send uploads with staged callbacks**

Conversation provides Composer callbacks:

```ts
const stageAttachment = async (
  attachment: QueuedDiscoveryAttachment,
) => {
  const form = new FormData();
  form.set("roomId", roomId);
  form.set("file", attachment.file);
  return stageDiscoveryAttachment(form);
};

const discardAttachment = (attachmentId: string) =>
  discardStagedDiscoveryAttachment({ roomId, attachmentId });
```

Delete the old `uploadAttachments` transfer phase. On submit, persist/reconcile
the message first, call `linkStagedDiscoveryAttachments` with the ready IDs and
final body, then add those attachments to local attachment state with the
persisted `messageId`. The transfer action must not run during Send.

- [ ] **Step 5: Render attachments inside each message**

For each message, derive:

```ts
const messageAttachments = attachments.filter(
  (attachment) => attachment.messageId === message.id,
);
```

Render below Markdown:

- images as Astryx `Thumbnail` using the signed `viewUrl`, accessible file name,
  and a token-backed larger inline/block size suitable for chat;
- documents as Astryx `Item` or `Button` with original name, extraction status,
  and `href={viewUrl}` in a compact edge-to-edge list.

Do not Card-wrap each file. Do not render attachments whose `messageId` is
null.

- [ ] **Step 6: Preserve optimistic and failure semantics**

- If message persistence fails with no realtime reconciliation, return `false`;
  Composer restores the ready staged records without re-uploading.
- If realtime wins while the action rejects, use the realtime persisted
  message ID for the link action.
- If linking fails, keep the persisted message visible, set an error naming
  the affected files, and do not call the staging upload again.
- Normalize injected synchronous link/upload callback throws through
  `Promise.resolve().then(...)` so they enter the same error path.

- [ ] **Step 7: Run integration tests and full discovery gate**

Run:

```bash
pnpm --filter @meld/web test --run src/features/discovery
pnpm --filter @meld/web typecheck
pnpm exec eslint \
  apps/web/src/features/discovery/actions.ts \
  apps/web/src/features/discovery/actions.test.ts \
  apps/web/src/features/discovery/components/conversation.tsx \
  apps/web/src/features/discovery/conversation.test.tsx \
  'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx'
git diff --check
```

Expected: all Discovery tests, typecheck, scoped lint, and whitespace checks
pass.

- [ ] **Step 8: Commit conversation attachment rendering**

```bash
git add \
  apps/web/src/features/discovery/actions.ts \
  apps/web/src/features/discovery/actions.test.ts \
  apps/web/src/features/discovery/components/conversation.tsx \
  apps/web/src/features/discovery/conversation.test.tsx \
  'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx'
git commit -m "feat: render discovery message attachments"
```

---

### Task 4: Browser Interaction and Visual Verification

**Files:**
- Modify: `.context/discovery-room-composer-visual.spec.ts`
- Modify: `.context/playwright-discovery-room-composer.config.ts`
- Modify only when browser evidence proves a defect:
  `apps/web/src/features/discovery/components/composer.tsx`
  `apps/web/src/features/discovery/components/composer-attachments.tsx`
  `apps/web/src/features/discovery/components/conversation.tsx`

**Interfaces:**
- Consumes: completed staged upload and message rendering flow.
- Produces: desktop and narrow browser evidence for requested states.

- [ ] **Step 1: Confirm the local fake staged-upload path**

Use the Task 1 fake actions through the existing discovery fake gate. Confirm
that staging returns deterministic `DiscoveryAttachmentView` records, linking
associates them with the fake message, and reloading the fake room returns the
same attachment metadata. Do not bypass the product action boundary in
Playwright.

- [ ] **Step 2: Add the requested browser scenario**

Cover:

```ts
test("stages and renders composer attachments before send", async ({ page }) => {
  await openFakeDiscoveryRoom(page);
  const composer = page.getByTestId("discovery-chat-composer");

  await page.getByLabel("Add files or images").setInputFiles("e2e/fixtures/interview.png");
  await expect(composer.getByRole("img", { name: "interview.png" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(composer.getByText("Uploading")).toBeVisible();

  await expect(composer.getByText("Uploaded")).toBeVisible();
  await page.getByRole("combobox", { name: "Message" }).fill("Review this image");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await page.getByRole("button", { name: "Send" }).click();

  const sent = page.getByTestId(/conversation-message-/).last();
  await expect(sent.getByRole("img", { name: "interview.png" })).toBeVisible();
});
```

Also verify:

- the attachment preview is geometrically inside the rounded composer;
- the composer grows when the attachment appears;
- the empty composer is modestly taller than before;
- the send icon is `ArrowUp` without the box glyph;
- a sole selected mention disappears after one Backspace;
- oversize and failed uploads show errors and keep Send disabled;
- Shift+Enter and the previously approved mention keyboard flow still work.

- [ ] **Step 3: Capture visual states**

Capture ignored screenshots under `.context` for:

1. slightly taller empty composer;
2. image uploading inside composer;
3. image uploaded and Send enabled;
4. upload failure with Send disabled;
5. sent message displaying its image.

Inspect that the composer remains docked, attachments do not escape its rounded
surface, and controls retain comfortable spacing.

- [ ] **Step 4: Run the final quality gate**

Run:

```bash
pnpm --filter @meld/web test --run src/features/discovery
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm exec playwright test \
  --config .context/playwright-discovery-room-composer.config.ts \
  --grep "stages and renders composer attachments before send" \
  --retries 0
git diff --check
```

Expected: all tests pass. Report unrelated lint warnings or concurrent dirty
files without modifying them.

- [ ] **Step 5: Commit only proven product polish**

If browser inspection requires tracked product changes:

```bash
git add \
  apps/web/src/features/discovery/components/composer.tsx \
  apps/web/src/features/discovery/components/composer-attachments.tsx \
  apps/web/src/features/discovery/components/conversation.tsx
git commit -m "fix: polish staged discovery attachments"
```

If no tracked product change is needed, create no Task 4 commit and record the
passing browser evidence in the task report.
