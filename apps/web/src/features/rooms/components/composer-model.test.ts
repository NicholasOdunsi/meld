import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../schemas";
import {
  applyMarkdownFormat,
  buildRoomReturnPath,
  deriveMentionSubmission,
  deriveProductMentionRanges,
  isReadyComposerAttachment,
  isValidRoomReturnPath,
  MAX_COMPOSER_ATTACHMENTS,
  parseRoomDraft,
  roomDraftStorageKey,
  serializeRoomDraft,
  type QueuedRoomAttachment,
  type RoomDraft,
  type StagedComposerAttachment,
  validateQueuedFiles,
} from "./composer-model";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const ROOM_ID = "20000000-0000-4000-8000-000000000002";

const PRODUCT_OPTION = {
  id: "agent:product",
  label: "Product Agent",
  handle: "product-agent",
  kind: "product",
} as const;

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

  it("prefixes every selected line and selects the inserted content", () => {
    expect(
      applyMarkdownFormat("First\nSecond", 0, 12, "numbered-list"),
    ).toEqual({
      value: "1. First\n2. Second",
      selectionStart: 3,
      selectionEnd: 18,
    });
  });
});

describe("deriveMentionSubmission", () => {
  it("derives only mentions still present in serialized text", () => {
    const options = [
      {
        id: "human:user-2",
        label: "maya@example.com",
        handle: "maya@example.com",
        kind: "human",
        userId: "user-2",
      },
      {
        id: "agent:product",
        label: "Product Agent",
        handle: "product-agent",
        kind: "product",
      },
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

  it("does not derive deleted mentions or partial mention matches", () => {
    const options = [
      {
        id: "human:user-2",
        label: "maya@example.com",
        handle: "maya@example.com",
        kind: "human",
        userId: "user-2",
      },
      {
        id: "agent:research",
        label: "Research Agent",
        handle: "research-agent",
        kind: "research",
      },
    ] as const;

    expect(
      deriveMentionSubmission(
        "Ask @maya@example.com.au instead",
        options,
      ),
    ).toEqual({
      mentionedUserIds: [],
      mentionedAgentKinds: [],
    });
  });

  it.each([
    ["bold", "**"],
    ["italic", "_"],
    ["strikethrough", "~~"],
    ["inline code", "`"],
  ])(
    "derives human and agent mentions wrapped in Markdown %s delimiters",
    (_, delimiter) => {
      const options = [
        {
          id: "human:user-2",
          label: "maya@example.com",
          handle: "maya@example.com",
          kind: "human",
          userId: "user-2",
        },
        {
          id: "agent:product",
          label: "Product Agent",
          handle: "product-agent",
          kind: "product",
        },
      ] as const;

      expect(
        deriveMentionSubmission(
          `${delimiter}@maya@example.com${delimiter} and ${delimiter}@Product Agent${delimiter}`,
          options,
        ),
      ).toEqual({
        mentionedUserIds: ["user-2"],
        mentionedAgentKinds: ["product"],
      });
    },
  );

  it.each([
    ["@Product Agent_extra", "agent mention followed by an underscore"],
    ["@maya@example.com_extra", "human mention followed by an underscore"],
    ["@Product Agent~draft", "agent mention followed by a tilde"],
  ])("does not derive a partial %s (%s)", (value) => {
    const options = [
      {
        id: "human:user-2",
        label: "maya@example.com",
        handle: "maya@example.com",
        kind: "human",
        userId: "user-2",
      },
      {
        id: "agent:product",
        label: "Product Agent",
        handle: "product-agent",
        kind: "product",
      },
    ] as const;

    expect(deriveMentionSubmission(value, options)).toEqual({
      mentionedUserIds: [],
      mentionedAgentKinds: [],
    });
  });

  it.each([
    "_**@Product Agent**_",
    "**_@Product Agent_**",
    "~~`@Product Agent`~~",
  ])("derives an agent mention inside nested Markdown: %s", (value) => {
    const options = [
      {
        id: "agent:product",
        label: "Product Agent",
        handle: "product-agent",
        kind: "product",
      },
    ] as const;

    expect(deriveMentionSubmission(value, options)).toEqual({
      mentionedUserIds: [],
      mentionedAgentKinds: ["product"],
    });
  });
});

describe("validateQueuedFiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    const current = Array.from(
      { length: MAX_COMPOSER_ATTACHMENTS },
      (_, index): QueuedRoomAttachment => ({
        id: `queued-${index}`,
        file: new File(["file"], `queued-${index}.txt`, {
          type: "text/plain",
          lastModified: index,
        }),
      }),
    );
    expect(
      validateQueuedFiles(current, [
        new File(["extra"], "extra.txt", { type: "text/plain" }),
      ]).errors,
    ).toContain("You can attach up to 10 files.");
  });

  it("rejects unsupported and duplicate files", () => {
    const queuedFile = new File(["notes"], "notes.txt", {
      type: "text/plain",
      lastModified: 100,
    });
    const duplicate = new File(["notes"], "notes.txt", {
      type: "text/plain",
      lastModified: 100,
    });

    const result = validateQueuedFiles(
      [{ id: "queued", file: queuedFile }],
      [
        duplicate,
        new File(["data"], "data.zip", { type: "application/zip" }),
      ],
    );

    expect(result.accepted).toEqual([]);
    expect(result.errors).toEqual([
      "notes.txt is already queued.",
      "data.zip is not a supported file type.",
    ]);
  });

  it("accepts every extractor/schema MIME type, resolving an empty MIME from the extension", () => {
    const csv = new File(["a,b"], "data.csv", { type: "text/csv" });
    const json = new File(["{}"], "data.json", { type: "application/json" });
    const markdownWithNoBrowserMime = new File(["# Title"], "notes.md", {
      type: "",
    });

    const result = validateQueuedFiles(
      [],
      [csv, json, markdownWithNoBrowserMime],
    );

    expect(result.errors).toEqual([]);
    expect(result.accepted.map(({ file }) => file.name)).toEqual([
      "data.csv",
      "data.json",
      "notes.md",
    ]);
  });

  it("still rejects a genuinely unsupported MIME type", () => {
    const zip = new File(["zip"], "archive.zip", {
      type: "application/zip",
    });

    expect(validateQueuedFiles([], [zip]).errors).toEqual([
      "archive.zip is not a supported file type.",
    ]);
  });

  it("creates object URLs only for accepted images", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:preview");
    const acceptedImage = new File(["image"], "evidence.png", {
      type: "image/png",
    });
    const rejectedImage = new File(
      [new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
      "oversized.png",
      { type: "image/png" },
    );

    const result = validateQueuedFiles([], [
      acceptedImage,
      rejectedImage,
    ]);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({
      file: acceptedImage,
      previewUrl: "blob:preview",
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(acceptedImage);
  });
});

describe("deriveProductMentionRanges", () => {
  it("returns boundary-checked offsets for each Product Agent token", () => {
    expect(
      deriveProductMentionRanges(
        "Ask @Product Agent and again @Product Agent!",
        [PRODUCT_OPTION],
      ),
    ).toEqual([
      { start: 4, end: 18 },
      { start: 29, end: 43 },
    ]);
  });

  it("ignores the words without a mention token", () => {
    expect(
      deriveProductMentionRanges(
        "I like the product agent concept",
        [PRODUCT_OPTION],
      ),
    ).toEqual([]);
  });
});

describe("room draft persistence", () => {
  const draft: RoomDraft = {
    body: "Ask @Product Agent for signals",
    providerOverride: "claude",
    attachmentIds: ["a1", "a2"],
    mentionRanges: [{ start: 4, end: 18 }],
  };

  it("round-trips a draft through serialize and parse", () => {
    expect(parseRoomDraft(serializeRoomDraft(draft))).toEqual(draft);
  });

  it("keys the draft per room", () => {
    expect(roomDraftStorageKey(ROOM_ID)).toBe(
      `room-draft:${ROOM_ID}`,
    );
  });

  it("returns null for missing or malformed storage", () => {
    expect(parseRoomDraft(null)).toBeNull();
    expect(parseRoomDraft("not json")).toBeNull();
    expect(parseRoomDraft("[]")).toBeNull();
    expect(parseRoomDraft(JSON.stringify({ body: 5 }))).toBeNull();
  });

  it("drops untrusted fields, keeping only the room-scoped draft shape", () => {
    const parsed = parseRoomDraft(
      JSON.stringify({
        body: "Recovered draft",
        providerOverride: "gemini",
        attachmentIds: ["keep", 42, { nope: true }],
        mentionRanges: [{ start: 0, end: 3 }, { start: "x" }],
        // Never persisted; must not survive parsing.
        bytes: [1, 2, 3],
        serverContent: "secret",
      }),
    );

    expect(parsed).toEqual({
      body: "Recovered draft",
      providerOverride: undefined,
      attachmentIds: ["keep"],
      mentionRanges: [{ start: 0, end: 3 }],
    });
    expect(parsed).not.toHaveProperty("bytes");
    expect(parsed).not.toHaveProperty("serverContent");
  });
});

describe("isValidRoomReturnPath", () => {
  it("accepts a relative room path inside the workspace", () => {
    expect(
      isValidRoomReturnPath(
        `/${WORKSPACE_ID}/rooms/${ROOM_ID}`,
        WORKSPACE_ID,
      ),
    ).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["absolute http URL", "https://evil.example/steal"],
    [
      "absolute URL to a room path",
      `https://evil.example/${WORKSPACE_ID}/rooms/${ROOM_ID}`,
    ],
    ["protocol-relative URL", `//evil.example/${WORKSPACE_ID}/room`],
    ["backslash host trick", `/\\evil.example/${WORKSPACE_ID}`],
    [
      "encoded traversal",
      `/${WORKSPACE_ID}/rooms/..%2f..%2f..%2fadmin`,
    ],
    ["plain traversal", `/${WORKSPACE_ID}/rooms/../../other`],
    [
      "another workspace's id",
      `/50000000-0000-4000-8000-000000000005/rooms/${ROOM_ID}`,
    ],
    ["a non-room path in the org", `/${WORKSPACE_ID}/settings/devices`],
    [
      "CRLF header smuggling",
      `/${WORKSPACE_ID}/rooms/${ROOM_ID}%0d%0aSet-Cookie:x`,
    ],
    ["a trailing path segment", `/${WORKSPACE_ID}/rooms/${ROOM_ID}/edit`],
  ])("rejects %s", (_label, value) => {
    expect(isValidRoomReturnPath(value, WORKSPACE_ID)).toBe(false);
  });
});

describe("buildRoomReturnPath", () => {
  it("composes a valid in-workspace room path", () => {
    expect(buildRoomReturnPath(WORKSPACE_ID, ROOM_ID)).toBe(
      `/${WORKSPACE_ID}/rooms/${ROOM_ID}`,
    );
  });

  it("returns null rather than an unsafe path for a malformed id", () => {
    expect(buildRoomReturnPath("../evil", ROOM_ID)).toBeNull();
  });
});

describe("isReadyComposerAttachment", () => {
  it("narrows only uploaded attachments as ready for submission", () => {
    const file = new File(["research"], "research.pdf", {
      type: "application/pdf",
    });
    const attachments: StagedComposerAttachment[] = [
      { id: "uploading", file, status: "uploading" },
      {
        id: "failed",
        file,
        status: "failed",
        error: "Upload failed",
      },
      {
        id: "uploaded",
        file,
        status: "uploaded",
        uploaded: {
          id: "persisted",
          messageId: null,
          originalName: file.name,
          mimeType: file.type,
          caption: null,
          extractionStatus: "pending",
          viewUrl: null,
        },
      },
      {
        id: "discarding",
        file,
        status: "discarding",
        uploaded: {
          id: "persisted-discarding",
          messageId: null,
          originalName: file.name,
          mimeType: file.type,
          caption: null,
          extractionStatus: "pending",
          viewUrl: null,
        },
      },
    ];

    expect(attachments.filter(isReadyComposerAttachment)).toEqual([
      expect.objectContaining({ id: "uploaded", status: "uploaded" }),
    ]);
  });
});
