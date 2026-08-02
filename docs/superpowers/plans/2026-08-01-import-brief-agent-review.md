# Import Brief → Product Agent Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a brief on the home page, have the Product Agent read it and post a breakdown, fix the infinite-spinner import hang, and make attachments on an `@Product Agent` message actually reach the agent.

**Architecture:** All changes live in `apps/web`. PDF extraction is externalized from the Next server-action bundle to stop a never-settling promise. `postMessage` gains an `attachmentIds` field and links a message's attachments *before* creating its reply task, so the frozen context manifest includes them. A new `createRoomFromBrief` server action orchestrates create-room → stage brief → (ready) post an `@Product Agent` opener with the brief linked, else save a restorable draft. The accepted-file-type set is broadened to common text formats with an extension-based MIME fallback.

**Tech Stack:** Next.js 16 (App Router, server actions, Turbopack), React 19, Zod, Vitest + Testing Library, Supabase, `unpdf`/`pdfjs-dist`.

## Global Constraints

- All changes confined to `apps/web` — no connector, gateway, or Supabase migration changes.
- Attachment size floor/ceiling: `MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024` (`apps/web/src/features/discovery/schemas.ts:4`).
- `postMessage` invariant: the human message persists FIRST and unconditionally; attachment linking and reply-task creation are best-effort and must never roll back, delete, or fail the message.
- The Product Agent only reads attachments that are linked to a message (`message_id is not null`) at the instant `create_room_reply_task` freezes its manifest — so linking must precede task creation.
- Opener copy (exact): single file → `@Product Agent — please review this brief and give me a breakdown of it.`; multiple files → `@Product Agent — please review these documents and give me a breakdown of them.`
- `.docx`/`.xlsx`/`.rtf` are out of scope (deferred fast-follow).
- Test commands run from `apps/web`: `npx vitest run <path>`, `npx tsc --noEmit`, `npx eslint <path>`.
- Commit after each task with a Conventional Commit message.

---

### Task 1: Shared MIME resolution + accepted-type constants

**Files:**
- Create: `apps/web/src/features/discovery/attachment-mime.ts`
- Test: `apps/web/src/features/discovery/attachment-mime.test.ts`

**Interfaces:**
- Produces:
  - `resolveMimeType(fileName: string, declaredType: string): string`
  - `ACCEPTED_ATTACHMENT_FILE_TYPES: string` (the `accept` attribute value used by every file picker)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/discovery/attachment-mime.test.ts
import { describe, expect, it } from "vitest";
import {
  ACCEPTED_ATTACHMENT_FILE_TYPES,
  resolveMimeType,
} from "./attachment-mime";

describe("resolveMimeType", () => {
  it("keeps a specific declared MIME type", () => {
    expect(resolveMimeType("brief.pdf", "application/pdf")).toBe(
      "application/pdf",
    );
  });

  it("derives from the extension when the browser sends nothing", () => {
    expect(resolveMimeType("notes.md", "")).toBe("text/markdown");
    expect(resolveMimeType("data.csv", "")).toBe("text/csv");
    expect(resolveMimeType("config.yaml", "")).toBe("text/yaml");
  });

  it("derives from the extension for the generic octet-stream type", () => {
    expect(
      resolveMimeType("data.json", "application/octet-stream"),
    ).toBe("application/json");
  });

  it("returns the declared type when the extension is unknown", () => {
    expect(resolveMimeType("mystery.bin", "")).toBe("");
  });

  it("lists the broadened accepted types", () => {
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain(".html");
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain(".csv");
    expect(ACCEPTED_ATTACHMENT_FILE_TYPES).toContain("image/png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/discovery/attachment-mime.test.ts`
Expected: FAIL — module `./attachment-mime` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/discovery/attachment-mime.ts

// Browsers frequently send an empty or generic MIME type for text-family files
// (.md, .csv, .yaml, ...). Extraction and validation both key off MIME, so we
// recover the type from the extension when the browser is unhelpful.
const EXTENSION_MIME_TYPES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  tsv: "text/tab-separated-values",
};

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);

export function resolveMimeType(
  fileName: string,
  declaredType: string,
): string {
  if (!GENERIC_MIME_TYPES.has(declaredType)) {
    return declaredType;
  }
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME_TYPES[extension] ?? declaredType;
}

const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

// One source of truth for every file picker's `accept` attribute.
export const ACCEPTED_ATTACHMENT_FILE_TYPES = [
  ".txt",
  ".md",
  ".html",
  ".htm",
  ".pdf",
  ".csv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".tsv",
  ...IMAGE_MIME_TYPES,
].join(",");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/discovery/attachment-mime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/attachment-mime.ts apps/web/src/features/discovery/attachment-mime.test.ts
git commit -m "feat(discovery): add extension MIME fallback and shared accept list"
```

---

### Task 2: Extractor reads the broadened text family

**Files:**
- Modify: `apps/web/src/features/discovery/attachment-extractor.ts:7` (the `TEXT_MIME_TYPES` set)
- Modify: `apps/web/src/features/discovery/schemas.ts:48-57` (`AllowedMimeTypeSchema`)
- Test: `apps/web/src/features/discovery/attachment-extractor.test.ts` (add cases)

**Interfaces:**
- Consumes: `extractAttachmentText({ mimeType, bytes, caption })` (unchanged signature).

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/web/src/features/discovery/attachment-extractor.test.ts
import { describe, expect, it } from "vitest";
import { extractAttachmentText } from "./attachment-extractor";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("extractAttachmentText text family", () => {
  it("reads CSV as plain text", async () => {
    const text = await extractAttachmentText({
      mimeType: "text/csv",
      bytes: bytesOf("name,role\nAda,PM"),
    });
    expect(text).toBe("name,role\nAda,PM");
  });

  it("reads JSON as plain text", async () => {
    const text = await extractAttachmentText({
      mimeType: "application/json",
      bytes: bytesOf('{"goal":"ship"}'),
    });
    expect(text).toBe('{"goal":"ship"}');
  });

  it("reads YAML as plain text", async () => {
    const text = await extractAttachmentText({
      mimeType: "text/yaml",
      bytes: bytesOf("goal: ship"),
    });
    expect(text).toBe("goal: ship");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/discovery/attachment-extractor.test.ts -t "text family"`
Expected: FAIL — csv/json/yaml currently throw `Unsupported attachment MIME type.`

- [ ] **Step 3: Write minimal implementation**

In `attachment-extractor.ts:7`, replace the `TEXT_MIME_TYPES` set:

```ts
const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "text/yaml",
  "application/yaml",
  "application/json",
  "application/xml",
  "text/xml",
]);
```

(The existing `text/html` branch above `TEXT_MIME_TYPES` stays as-is — it strips tags. The new types fall through to the plain-UTF-8 branch that already exists.)

In `schemas.ts`, extend `AllowedMimeTypeSchema` (`:48-57`) to enumerate the same additions:

```ts
const AllowedMimeTypeSchema = z.enum([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "text/tab-separated-values",
  "text/yaml",
  "application/yaml",
  "application/json",
  "application/xml",
  "text/xml",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/discovery/attachment-extractor.test.ts src/features/discovery/schemas.test.ts`
Expected: PASS (new cases pass; existing html/pdf/image cases unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/attachment-extractor.ts apps/web/src/features/discovery/attachment-extractor.test.ts apps/web/src/features/discovery/schemas.ts
git commit -m "feat(discovery): extract csv/json/xml/yaml/tsv as text"
```

---

### Task 3: Wire MIME resolution into upload parsing + unify picker accept lists

**Files:**
- Modify: `apps/web/src/features/discovery/actions.ts:231-258` (`parseAttachmentForm`)
- Modify: `apps/web/src/features/home/components/use-starting-point-actions.ts:8` (drop the local constant, re-export the shared one)
- Modify: `apps/web/src/features/discovery/components/composer.tsx:62-70` (use the shared constant)
- Test: `apps/web/src/features/discovery/actions.test.ts` (add a `parseAttachmentForm`-path assertion via an existing exported action, e.g. `stageDiscoveryAttachment`)

**Interfaces:**
- Consumes: `resolveMimeType`, `ACCEPTED_ATTACHMENT_FILE_TYPES` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/discovery/actions.test.ts — add within the existing
// describe that already mocks ./backend, ./attachment-extractor, ./upload-persistence.
// The backend mock's stageAttachment should echo the metadata it receives.
it("resolves an empty browser MIME type from the file extension", async () => {
  const file = new File(["goal: ship"], "brief.md", { type: "" });
  const formData = new FormData();
  formData.set("roomId", "00000000-0000-4000-8000-000000000001");
  formData.set("file", file);

  await stageDiscoveryAttachment(formData);

  // extractAttachmentText is mocked; assert it saw the resolved MIME, not "".
  expect(extractAttachmentTextMock).toHaveBeenCalledWith(
    expect.objectContaining({ mimeType: "text/markdown" }),
  );
});
```

(Use the file's existing mock handle for `extractAttachmentText`; if none is captured, add `const extractAttachmentTextMock = vi.fn(async () => "goal: ship")` to the `vi.mock("./attachment-extractor", ...)` factory and export it via the mock.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/discovery/actions.test.ts -t "resolves an empty browser MIME"`
Expected: FAIL — `parseAttachmentForm` currently passes `file.type` (`""`) straight through, so the mock is called with `mimeType: ""`.

- [ ] **Step 3: Write minimal implementation**

In `actions.ts`, import at the top:

```ts
import { resolveMimeType } from "./attachment-mime";
```

In `parseAttachmentForm` (`:249-256`), replace the raw `file.type` with the resolved type:

```ts
  const mimeType = resolveMimeType(file.name, file.type);
  const metadata = AttachmentInputSchema.parse({
    roomId,
    messageId,
    caption,
    fileName: file.name,
    mimeType,
    size: file.size,
  });
```

Also change the caption guard just above it (`:245-248`) to use the resolved `mimeType` instead of `file.type` when checking `startsWith("image/")`.

In `use-starting-point-actions.ts:8`, replace the local constant with a re-export:

```ts
export { ACCEPTED_ATTACHMENT_FILE_TYPES as STARTING_POINT_ACCEPTED_FILE_TYPES } from "@/features/discovery/attachment-mime";
```

In `composer.tsx`, delete the local `ACCEPTED_ATTACHMENT_TYPES` block (`:62-70`) and import the shared constant; update its one usage (`accept={ACCEPTED_ATTACHMENT_TYPES}` → `accept={ACCEPTED_ATTACHMENT_FILE_TYPES}`):

```ts
import { ACCEPTED_ATTACHMENT_FILE_TYPES } from "../attachment-mime";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/discovery/actions.test.ts src/features/discovery/components/composer.attachments.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/features/discovery/actions.ts src/features/discovery/components/composer.tsx src/features/home/components/use-starting-point-actions.ts
git add -A
git commit -m "feat(discovery): resolve upload MIME by extension and share the accept list"
```

---

### Task 4: Stop the PDF import hang (externalize + per-file timeout)

**Files:**
- Modify: `apps/web/next.config.ts` (add `serverExternalPackages`)
- Create: `apps/web/src/features/discovery/with-timeout.ts`
- Modify: `apps/web/src/features/discovery/actions.ts:262-274` (`readAttachmentUpload` — wrap extraction)
- Test: `apps/web/src/features/discovery/with-timeout.test.ts`

**Interfaces:**
- Produces: `withTimeout<T>(work: () => Promise<T>, ms: number, message: string): Promise<T>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/discovery/with-timeout.test.ts
import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("resolves when the work finishes in time", async () => {
    await expect(withTimeout(async () => 42, 1000, "too slow")).resolves.toBe(
      42,
    );
  });

  it("rejects when the work never settles", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(
      () => new Promise<number>(() => {}),
      30_000,
      "extraction timed out",
    );
    const assertion = expect(pending).rejects.toThrow("extraction timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/discovery/with-timeout.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/discovery/with-timeout.ts

// A never-settling promise (e.g. a deadlocked PDF worker) is otherwise
// uncatchable and hangs the whole server action. Racing it against a timer
// converts the stall into a normal rejection the per-file catch can handle.
export function withTimeout<T>(
  work: () => Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/discovery/with-timeout.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply the real fix (config) and the guard**

In `apps/web/next.config.ts`, add to the config object (top level, alongside `allowedDevOrigins`):

```ts
  serverExternalPackages: ["unpdf", "pdfjs-dist"],
```

In `actions.ts`, import the guard and the constant:

```ts
import { withTimeout } from "./with-timeout";

const ATTACHMENT_WORK_TIMEOUT_MS = 30_000;
```

Wrap the extraction in `readAttachmentUpload` (`:268`):

```ts
  const extractedText = await withTimeout(
    () =>
      extractAttachmentText({
        mimeType: metadata.mimeType,
        bytes,
        caption: metadata.caption,
      }),
    ATTACHMENT_WORK_TIMEOUT_MS,
    "Reading this file took too long.",
  );
```

- [ ] **Step 6: Full test + typecheck**

Run: `npx vitest run src/features/discovery && npx tsc --noEmit`
Expected: PASS. (Real-app verification of the hang is Task 9.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/next.config.ts apps/web/src/features/discovery/with-timeout.ts apps/web/src/features/discovery/with-timeout.test.ts apps/web/src/features/discovery/actions.ts
git commit -m "fix(discovery): externalize pdf extraction and time-bound per-file work"
```

---

### Task 5: `postMessage` links attachments before creating the reply task

**Files:**
- Modify: `apps/web/src/features/discovery/schemas.ts:17-27` (`MessageInputSchema`)
- Modify: `apps/web/src/features/discovery/actions.ts:145-196` (`postMessage`)
- Test: `apps/web/src/features/discovery/actions.test.ts`

**Interfaces:**
- Produces: `MessageInput` now has optional `attachmentIds?: string[]`.
- Consumes: `backend.linkStagedAttachments({ roomId, messageId, attachmentIds, caption })` (existing, `backend.ts:95-100`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/discovery/actions.test.ts
it("links attachments before creating the reply task", async () => {
  const order: string[] = [];
  linkStagedAttachmentsMock.mockImplementation(async () => {
    order.push("link");
    return ["a0000000-0000-4000-8000-000000000001"];
  });
  createRoomReplyTaskMock.mockImplementation(async () => {
    order.push("task");
    return { id: "task-1" };
  });

  await postMessage({
    roomId: "20000000-0000-4000-8000-000000000001",
    clientId: "30000000-0000-4000-8000-000000000001",
    body: "@Product Agent review this",
    mentionedUserIds: [],
    mentionsProductAgent: true,
    attachmentIds: ["a0000000-0000-4000-8000-000000000001"],
  });

  expect(order).toEqual(["link", "task"]);
});
```

(Add `linkStagedAttachmentsMock` to the `./backend` mock's returned object and `createRoomReplyTaskMock` to the `vi.mock("@/features/ai/create-room-reply-task", ...)` factory, following the mocking style already in this file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/discovery/actions.test.ts -t "links attachments before"`
Expected: FAIL — `postMessage` ignores `attachmentIds` today; `link` never runs.

- [ ] **Step 3: Write minimal implementation**

In `schemas.ts`, add to `MessageInputSchema` (after `providerOverride`):

```ts
  // Ids of already-staged attachments to link to this message. Linked before
  // the reply task is created so the frozen context manifest includes them.
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
```

In `actions.ts` `postMessage`, insert between the message persist (`:155`) and the mention check (`:157`):

```ts
  // Best-effort: link staged attachments to the just-persisted message BEFORE
  // the reply task freezes its manifest, so the agent can read them. A link
  // failure never rolls back the durable human message.
  if (parsed.attachmentIds && parsed.attachmentIds.length > 0) {
    try {
      await backend.linkStagedAttachments({
        roomId: parsed.roomId,
        messageId: message.id,
        attachmentIds: parsed.attachmentIds,
        caption: parsed.body,
      });
    } catch {
      console.error(
        `Linking staged attachments failed for message "${message.id}".`,
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/discovery/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/schemas.ts apps/web/src/features/discovery/actions.ts apps/web/src/features/discovery/actions.test.ts
git commit -m "feat(discovery): link message attachments before the reply task manifest"
```

---

### Task 6: Composer submit forwards attachment ids (fresh + restored draft)

**Files:**
- Modify: `apps/web/src/features/discovery/components/conversation.tsx:566-589` (remove `linkAttachmentsToMessage`), `:591-654` (`submit`)
- Test: `apps/web/src/features/discovery/components/conversation.test.tsx`

**Interfaces:**
- Consumes: `MessageInput.attachmentIds` (Task 5); `restoredDraft.attachmentIds` (`RoomDraft`, `composer-model.ts:58-63`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/discovery/components/conversation.test.tsx
it("re-links a restored draft's attachments on the next send", async () => {
  window.sessionStorage.setItem(
    roomDraftStorageKey(roomId),
    serializeRoomDraft({
      body: "Ask @Product Agent to review",
      attachmentIds: ["a0000000-0000-4000-8000-000000000009"],
      mentionRanges: [{ start: 4, end: 18 }],
    }),
  );
  const sendMessage = vi.fn().mockResolvedValue({
    message: { ...persistedMessage, body: "Ask @Product Agent to review" },
    agentTask: { status: "queued", taskId: "task-1" },
  });
  const { user } = renderConversation({
    organizationId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: ["a0000000-0000-4000-8000-000000000009"],
      }),
    ),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/discovery/components/conversation.test.tsx -t "re-links a restored draft"`
Expected: FAIL — `submit` builds `MessageInput` without `attachmentIds`.

- [ ] **Step 3: Write minimal implementation**

Near the other refs in `conversation.tsx` (after `restoredDraft` at `:392`), add a one-shot holder for the restored ids:

```ts
  // Restored-draft attachment ids are re-linked exactly once, on the first send
  // after returning from AI setup. Fresh composer attachments are additive.
  const draftAttachmentIdsRef = useRef<string[]>(
    restoredDraft?.attachmentIds ?? [],
  );
```

(Ensure `useRef` is imported from `react`.)

In `submit` (`:591`), build the id list and consume the ref, and set it on the input:

```ts
    const freshAttachmentIds = submission.attachments.map(
      ({ uploaded }) => uploaded.id,
    );
    const attachmentIds = [
      ...freshAttachmentIds,
      ...draftAttachmentIdsRef.current,
    ];
    draftAttachmentIdsRef.current = [];
    const input: MessageInput = {
      roomId,
      clientId,
      body: submission.body,
      mentionedUserIds: submission.mentionedUserIds,
      mentionsProductAgent: submission.mentionsProductAgent,
      providerOverride: submission.providerOverride,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    };
```

Delete the now-dead `linkAttachmentsToMessage` helper (`:566-589`) and its call site (`:654`), since linking now happens inside `postMessage`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/discovery/components/conversation.test.tsx`
Expected: PASS (existing draft-restore and mention tests still green; the new re-link test passes). Fix any test that asserted the old separate `linkAttachments` call by asserting `sendMessage` received `attachmentIds` instead.

- [ ] **Step 5: Typecheck, commit**

```bash
npx tsc --noEmit
git add apps/web/src/features/discovery/components/conversation.tsx apps/web/src/features/discovery/components/conversation.test.tsx
git commit -m "feat(discovery): forward composer and restored-draft attachment ids on send"
```

---

### Task 7: `createRoomFromBrief` server action

**Files:**
- Create: `apps/web/src/features/discovery/brief-opener.ts`
- Modify: `apps/web/src/features/discovery/actions.ts` (add `createRoomFromBrief`; remove `createRoomFromUploads` once Task 8 drops its last caller)
- Test: `apps/web/src/features/discovery/actions.test.ts`

**Interfaces:**
- Produces:
  - `buildBriefOpener(fileCount: number): string`
  - `PRODUCT_AGENT_MENTION = "@Product Agent"`
  - `createRoomFromBrief(formData: FormData): Promise<CreateRoomFromBriefResult>` where
    ```ts
    type CreateRoomFromBriefResult =
      | { ready: true; roomId: string; failedFileNames: string[] }
      | {
          ready: false;
          roomId: string;
          stagedAttachmentIds: string[];
          failedFileNames: string[];
        };
    ```
- Consumes: `getAgentReadiness()` (`actions.ts:201`), `postMessage` (Task 5), `readAttachmentUpload`/`backend.stageAttachment`, `deriveRoomNameFromFiles`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/discovery/actions.test.ts
it("posts an @Product Agent opener with the brief linked when ready", async () => {
  getAgentReadinessMock.mockResolvedValue({
    ready: true,
    defaultProvider: "codex",
    defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
    providers: [
      {
        provider: "codex",
        deviceId: "d0000000-0000-4000-8000-000000000000",
        deviceName: "Ada's Mac",
      },
    ],
  });
  stageAttachmentMock.mockResolvedValue({
    id: "a0000000-0000-4000-8000-000000000010",
  });

  const formData = new FormData();
  formData.set("organizationId", "00000000-0000-4000-8000-000000000001");
  formData.append("files", new File(["brief"], "brief.pdf", { type: "application/pdf" }));

  const result = await createRoomFromBrief(formData);

  expect(result).toMatchObject({ ready: true });
  expect(postMessageSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      mentionsProductAgent: true,
      attachmentIds: ["a0000000-0000-4000-8000-000000000010"],
      body: expect.stringContaining("@Product Agent"),
    }),
  );
});

it("returns staged ids without posting when the agent is not ready", async () => {
  getAgentReadinessMock.mockResolvedValue({ ready: false, reason: "no_device" });
  stageAttachmentMock.mockResolvedValue({
    id: "a0000000-0000-4000-8000-000000000011",
  });

  const formData = new FormData();
  formData.set("organizationId", "00000000-0000-4000-8000-000000000001");
  formData.append("files", new File(["brief"], "brief.md", { type: "text/markdown" }));

  const result = await createRoomFromBrief(formData);

  expect(result).toEqual({
    ready: false,
    roomId: expect.any(String),
    stagedAttachmentIds: ["a0000000-0000-4000-8000-000000000011"],
    failedFileNames: [],
  });
});
```

(Add `getAgentReadinessMock`/`stageAttachmentMock` to the existing mocks and spy on the module's `postMessage`. `postMessage` is exercised via its real implementation with mocked backend, or spied — match the file's existing convention.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/discovery/actions.test.ts -t "opener"`
Expected: FAIL — `createRoomFromBrief` and `brief-opener` do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/discovery/brief-opener.ts
export const PRODUCT_AGENT_MENTION = "@Product Agent";

export function buildBriefOpener(fileCount: number): string {
  return fileCount > 1
    ? `${PRODUCT_AGENT_MENTION} — please review these documents and give me a breakdown of them.`
    : `${PRODUCT_AGENT_MENTION} — please review this brief and give me a breakdown of it.`;
}
```

In `actions.ts` add (imports: `buildBriefOpener` from `./brief-opener`, `randomUUID` from `node:crypto`):

```ts
export type CreateRoomFromBriefResult =
  | { ready: true; roomId: string; failedFileNames: string[] }
  | {
      ready: false;
      roomId: string;
      stagedAttachmentIds: string[];
      failedFileNames: string[];
    };

export async function createRoomFromBrief(
  formData: FormData,
): Promise<CreateRoomFromBriefResult> {
  const organizationId = String(formData.get("organizationId") ?? "");
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

  const backend = await getDiscoveryBackend();
  const stagedAttachmentIds: string[] = [];
  const failedFileNames: string[] = [];
  for (const file of files) {
    const staged = new FormData();
    staged.set("roomId", room.id);
    staged.set("file", file);
    try {
      const upload = await readAttachmentUpload(staged, true);
      const view = await backend.stageAttachment(upload);
      stagedAttachmentIds.push(view.id);
    } catch {
      console.error(`Brief staging failed for "${file.name}".`);
      failedFileNames.push(file.name);
    }
  }

  const readiness = await getAgentReadiness();

  // No brief made it through, or no agent to review it: hand back a room the
  // caller can open. The not-ready branch also covers "nothing staged".
  if (readiness.ready !== true || stagedAttachmentIds.length === 0) {
    return {
      ready: false,
      roomId: room.id,
      stagedAttachmentIds,
      failedFileNames,
    };
  }

  await postMessage({
    roomId: room.id,
    clientId: randomUUID(),
    body: buildBriefOpener(stagedAttachmentIds.length),
    mentionedUserIds: [],
    mentionsProductAgent: true,
    attachmentIds: stagedAttachmentIds,
  });

  return { ready: true, roomId: room.id, failedFileNames };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/discovery/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/discovery/brief-opener.ts apps/web/src/features/discovery/actions.ts apps/web/src/features/discovery/actions.test.ts
git commit -m "feat(discovery): add createRoomFromBrief import-and-review action"
```

---

### Task 8: Home import uses `createRoomFromBrief` (ready + not-ready)

**Files:**
- Modify: `apps/web/src/features/home/components/use-starting-point-actions.ts`
- Modify: `apps/web/src/features/discovery/actions.ts` (delete now-unused `createRoomFromUploads`)
- Test: `apps/web/src/features/home/components/use-starting-point-actions.test.ts` (create if absent)

**Interfaces:**
- Consumes: `createRoomFromBrief` (Task 7); `serializeRoomDraft`, `roomDraftStorageKey` (`composer-model.ts:412,476`); `buildBriefOpener`, `PRODUCT_AGENT_MENTION` (Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/home/components/use-starting-point-actions.test.ts
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRoomFromBrief = vi.fn();
const push = vi.fn();
vi.mock("@/features/discovery/actions", () => ({ createRoomFromBrief }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => vi.fn() }));

import { useStartingPointActions } from "./use-starting-point-actions";
import { roomDraftStorageKey } from "@/features/discovery/components/composer-model";

function selectFile(hook: ReturnType<typeof renderHook>) {
  const file = new File(["brief"], "brief.pdf", { type: "application/pdf" });
  const event = { target: { files: [file], value: "x" } } as unknown as React.ChangeEvent<HTMLInputElement>;
  return act(async () => {
    await hook.result.current.handleFilesSelected(event);
  });
}

describe("useStartingPointActions import", () => {
  beforeEach(() => {
    push.mockClear();
    window.sessionStorage.clear();
  });

  it("navigates to the room when the agent reviewed the brief", async () => {
    createRoomFromBrief.mockResolvedValue({ ready: true, roomId: "room-1", failedFileNames: [] });
    const hook = renderHook(() => useStartingPointActions("org-1"));
    await selectFile(hook);
    expect(push).toHaveBeenCalledWith("/org-1/discovery/room-1");
  });

  it("saves a restorable draft with the brief when the agent is not ready", async () => {
    createRoomFromBrief.mockResolvedValue({
      ready: false,
      roomId: "room-2",
      stagedAttachmentIds: ["att-1"],
      failedFileNames: [],
    });
    const hook = renderHook(() => useStartingPointActions("org-1"));
    await selectFile(hook);
    const draft = JSON.parse(window.sessionStorage.getItem(roomDraftStorageKey("room-2")) ?? "{}");
    expect(draft.attachmentIds).toEqual(["att-1"]);
    expect(draft.body).toContain("@Product Agent");
    expect(push).toHaveBeenCalledWith("/org-1/discovery/room-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/home/components/use-starting-point-actions.test.ts`
Expected: FAIL — the hook still calls `createRoomFromUploads` and never writes a draft.

- [ ] **Step 3: Write minimal implementation**

Rewrite `handleFilesSelected` in `use-starting-point-actions.ts` (imports: `createRoomFromBrief` from `@/features/discovery/actions`; `serializeRoomDraft`, `roomDraftStorageKey` from `@/features/discovery/components/composer-model`; `buildBriefOpener`, `PRODUCT_AGENT_MENTION` from `@/features/discovery/brief-opener`):

```ts
    setIsImporting(true);
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const result = await createRoomFromBrief(formData);
      if (result.failedFileNames.length > 0) {
        toast({
          type: "info",
          body: `These files did not attach: ${result.failedFileNames.join(", ")}.`,
        });
      }
      if (!result.ready) {
        const body = buildBriefOpener(result.stagedAttachmentIds.length);
        const start = body.indexOf(PRODUCT_AGENT_MENTION);
        window.sessionStorage.setItem(
          roomDraftStorageKey(result.roomId),
          serializeRoomDraft({
            body,
            attachmentIds: result.stagedAttachmentIds,
            mentionRanges:
              start >= 0
                ? [{ start, end: start + PRODUCT_AGENT_MENTION.length }]
                : [],
          }),
        );
      }
      router.push(`/${organizationId}/discovery/${result.roomId}`);
      router.refresh();
    } catch (error) {
      toast({
        type: "error",
        body:
          error instanceof Error ? error.message : "We could not import those files.",
      });
    } finally {
      setIsImporting(false);
    }
```

Then delete `createRoomFromUploads` from `actions.ts` (its only caller is gone) and its now-unused import of `deriveRoomNameFromFiles` if `createRoomFromBrief` is the sole remaining user (keep the import — `createRoomFromBrief` uses it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/home src/features/discovery/actions.test.ts`
Expected: PASS. Remove any obsolete `createRoomFromUploads` test.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/features/home/components/use-starting-point-actions.ts src/features/discovery/actions.ts
git add -A
git commit -m "feat(home): import a brief through createRoomFromBrief with not-ready draft"
```

---

### Task 9: Real-app verification (import a PDF end to end)

**Files:** none (manual/Playwright verification per `meld-e2e-catches-what-build-cannot` and `local-verification-setup` notes).

**Interfaces:** none.

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: PASS.

- [ ] **Step 2: Start the app against the Dockerized Supabase**

Follow `local-verification-setup`: bring up the web app and sign in to an organization that has a connected agent/device.

- [ ] **Step 3: Import a real PDF brief**

On the home page, click **Import Project**, choose a valid multi-paragraph PDF.
Expected: the spinner clears within a few seconds (no infinite hang), you land in a new Discovery Room, and the Product Agent posts a breakdown of the brief. Capture a screenshot.

- [ ] **Step 4: Import with no agent connected**

Repeat in an org with no connected provider.
Expected: the room is created, the brief is attached, the composer shows the restored `@Product Agent` opener plus the "Connect your AI to reply" prompt; after connecting and pressing Send, the breakdown appears.

- [ ] **Step 5: Attach a `.html`/`.md` in the composer**

In a room, use the ＋ button to attach an `.html` and a `.md` file, mention `@Product Agent`, send.
Expected: files attach without error and the agent's reply reflects their contents.

- [ ] **Step 6: Commit any verification notes**

```bash
git add -A
git commit -m "test(discovery): verify import-brief review flow in the running app" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- Piece 1 (hang fix) → Task 4 (externalize + timeout).
- Piece 2 (attachment ordering) → Task 5 (`postMessage` link-before-task) + Task 6 (composer/draft forwards ids).
- Piece 3 (import → review) → Task 7 (`createRoomFromBrief`) + Task 8 (home wiring, ready + not-ready).
- Piece 4 (file types) → Task 1 (MIME + accept list) + Task 2 (extractor) + Task 3 (wiring).
- Testing/verification requirement → Task 9.

**Type consistency:** `resolveMimeType`, `ACCEPTED_ATTACHMENT_FILE_TYPES` (Task 1) consumed in Task 3; `MessageInput.attachmentIds` (Task 5) consumed in Tasks 6 and 7; `CreateRoomFromBriefResult` (Task 7) consumed in Task 8; `buildBriefOpener`/`PRODUCT_AGENT_MENTION` (Task 7) consumed in Task 8; `withTimeout` (Task 4) consumed within Task 4.

**Placeholder scan:** no TBD/TODO; each code and test step carries concrete content. `.docx` explicitly deferred, not left ambiguous.

**Ordering:** Tasks 1→2→3 (types), 4 (hang), 5→6 (ordering), 7→8 (feature), 9 (verify). Task 6 depends on 5; Task 8 depends on 7; both honored.
