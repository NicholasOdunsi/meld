// Shared setup for the RoomComposer suites. Test-only: nothing in the
// app imports this, so it never reaches a bundle.
//
// The composer's tests are split by facet (formatting, attachments,
// mentions, submission) but all drive the same rendered component, so the
// fixtures and the jsdom shims live here rather than being duplicated.

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import type { RoomAttachmentView } from "../attachment-types";
import { RoomComposer } from "./composer";

export const mentions = [
  {
    id: "human:user-2",
    label: "Maya Chen",
    handle: "maya@example.com",
    kind: "human",
    userId: "user-2",
    description: "maya@example.com",
  },
  {
    id: "agent:product",
    label: "Product Agent",
    handle: "product-agent",
    kind: "product",
    description: "Synthesize product insight",
  },
  {
    id: "agent:research",
    label: "Research Agent",
    handle: "research-agent",
    kind: "research",
    description: "Review customer evidence",
  },
] as const;

export const uploadedImage: RoomAttachmentView = {
  id: "attachment-image",
  messageId: null,
  originalName: "interview.png",
  mimeType: "image/png",
  caption: null,
  extractionStatus: "pending",
  viewUrl: "/attachments/attachment-image",
};

export function uploadedAttachment(
  file: File,
): RoomAttachmentView {
  return {
    ...uploadedImage,
    id: `attachment-${file.name}`,
    originalName: file.name,
    mimeType: file.type,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export type ComposerProps = ComponentProps<typeof RoomComposer>;

// Exported because a few cases need to render without one of the optional
// callbacks, which renderComposer always supplies a default for.
export function ControlledComposer({
  initialValue,
  onChangeSpy,
  ...props
}: Omit<ComposerProps, "value" | "onChange"> & {
  initialValue: string;
  onChangeSpy: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <RoomComposer
      {...props}
      value={value}
      onChange={(nextValue) => {
        onChangeSpy(nextValue);
        setValue(nextValue);
      }}
    />
  );
}

export function renderComposer({
  value = "",
  onChange = vi.fn(),
  onSubmit = vi.fn(async () => true),
  onStageAttachment = vi.fn(async (attachment) =>
    uploadedAttachment(attachment.file),
  ),
  onDiscardStagedAttachment = vi.fn(async () => {}),
  mentions: mentionOptions = mentions,
  status,
  agentReadiness,
  onConnectPersonalAI,
  roomId = "20000000-0000-4000-8000-000000000002",
  initialProviderOverride,
  initialModelOverride,
  initialResearchScope,
}: Partial<ComposerProps> = {}) {
  const user = userEvent.setup();
  const view = render(
    <ControlledComposer
      initialValue={value}
      onChangeSpy={onChange}
      onSubmit={onSubmit}
      onStageAttachment={onStageAttachment}
      onDiscardStagedAttachment={onDiscardStagedAttachment}
      mentions={mentionOptions}
      status={status}
      agentReadiness={agentReadiness}
      onConnectPersonalAI={onConnectPersonalAI}
      roomId={roomId}
      initialProviderOverride={initialProviderOverride}
      initialModelOverride={initialModelOverride}
      initialResearchScope={initialResearchScope}
    />,
  );

  return { ...view, onChange, onSubmit, user };
}

export function selectEditorText(
  editor: HTMLElement,
  start: number,
  end: number,
) {
  const textNode = editor.firstChild;
  if (!textNode) {
    throw new Error("The editor has no text node to select.");
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function selectEditorSubstring(
  editor: HTMLElement,
  value: string,
) {
  const walker = document.createTreeWalker(
    editor,
    NodeFilter.SHOW_TEXT,
  );
  let textNode = walker.nextNode();
  while (textNode) {
    const start = textNode.textContent?.indexOf(value) ?? -1;
    if (start >= 0) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + value.length);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    textNode = walker.nextNode();
  }
  throw new Error(`The editor does not contain "${value}".`);
}

export function getFileInput() {
  return screen.getByLabelText("Add files or images", {
    selector: "input",
  });
}

export function imageFile(name = "interview.png") {
  return new File(["image"], name, {
    type: "image/png",
    lastModified: 100,
  });
}

export function pdfFile(name = "research.pdf") {
  return new File(["research"], name, {
    type: "application/pdf",
    lastModified: 200,
  });
}

// Called once per suite file. Registers the jsdom shims Astryx needs and the
// object-URL spies the attachment tests assert against.
export function setupComposerTestEnvironment() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockReturnValue(null);
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      (file) => `blob:${(file as File).name}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
}
