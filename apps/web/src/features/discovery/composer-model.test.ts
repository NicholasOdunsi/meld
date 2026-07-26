import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "./schemas";
import {
  applyMarkdownFormat,
  deriveMentionSubmission,
  MAX_COMPOSER_ATTACHMENTS,
  type QueuedDiscoveryAttachment,
  validateQueuedFiles,
} from "./components/composer-model";

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
      (_, index): QueuedDiscoveryAttachment => ({
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
        new File(["data"], "data.csv", { type: "text/csv" }),
      ],
    );

    expect(result.accepted).toEqual([]);
    expect(result.errors).toEqual([
      "notes.txt is already queued.",
      "data.csv is not a supported file type.",
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
