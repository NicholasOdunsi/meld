// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  MAX_COMPOSER_ATTACHMENTS,
  type QueuedDiscoveryAttachment,
} from "./components/composer-model";
import { DiscoveryComposer } from "./components/composer";

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
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();

const mentions = [
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

type ComposerProps = ComponentProps<typeof DiscoveryComposer>;

function ControlledComposer({
  initialValue,
  onChangeSpy,
  ...props
}: Omit<ComposerProps, "value" | "onChange"> & {
  initialValue: string;
  onChangeSpy: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <DiscoveryComposer
      {...props}
      value={value}
      onChange={(nextValue) => {
        onChangeSpy(nextValue);
        setValue(nextValue);
      }}
    />
  );
}

function renderComposer({
  value = "",
  onChange = vi.fn(),
  onSubmit = vi.fn(async () => true),
  mentions: mentionOptions = mentions,
  status,
}: Partial<ComposerProps> = {}) {
  const user = userEvent.setup();
  const view = render(
    <ControlledComposer
      initialValue={value}
      onChangeSpy={onChange}
      onSubmit={onSubmit}
      mentions={mentionOptions}
      status={status}
    />,
  );

  return { ...view, onChange, onSubmit, user };
}

function selectEditorText(editor: HTMLElement, start: number, end: number) {
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

function selectEditorSubstring(editor: HTMLElement, value: string) {
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

function getFileInput() {
  return screen.getByLabelText("Add files or images", {
    selector: "input",
  });
}

function imageFile(name = "interview.png") {
  return new File(["image"], name, {
    type: "image/png",
    lastModified: 100,
  });
}

function pdfFile(name = "research.pdf") {
  return new File(["research"], name, {
    type: "application/pdf",
    lastModified: 200,
  });
}

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

it("renders compact attachment, formatting, mention, and arrow-up send actions", () => {
  renderComposer();

  expect(
    screen.getByRole("button", { name: "Add files or images" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Formatting" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(
    screen.getByRole("button", { name: "Mention someone" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Send" })).toBeVisible();
});

it("morphs into the Markdown toolbar without losing the draft", async () => {
  const { user } = renderComposer({ value: "Customer evidence" });

  await user.click(
    screen.getByRole("button", { name: "Formatting" }),
  );

  expect(
    screen.getByRole("toolbar", { name: "Format message" }),
  ).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("Customer evidence");
  expect(
    screen.getByRole("button", { name: "Formatting" }),
  ).toHaveAttribute("aria-pressed", "true");
});

it("bolds the active selection and returns focus to the editor", async () => {
  const onChange = vi.fn();
  const { user } = renderComposer({
    value: "Customer evidence",
    onChange,
  });
  await user.click(
    screen.getByRole("button", { name: "Formatting" }),
  );
  const editor = screen.getByRole("combobox", { name: "Message" });
  editor.focus();
  selectEditorText(editor, 0, 8);

  await user.click(screen.getByRole("button", { name: "Bold" }));

  expect(onChange).toHaveBeenCalledWith("**Customer** evidence");
  await waitFor(() => expect(editor).toHaveFocus());
});

it("formats every selected line as a bulleted list", async () => {
  const onChange = vi.fn();
  const { user } = renderComposer({
    value: "First\nSecond",
    onChange,
  });
  await user.click(
    screen.getByRole("button", { name: "Formatting" }),
  );
  const editor = screen.getByRole("combobox", { name: "Message" });
  editor.focus();
  selectEditorText(editor, 0, "First\nSecond".length);

  await user.click(
    screen.getByRole("button", { name: "Bulleted list" }),
  );

  expect(onChange).toHaveBeenCalledWith("- First\n- Second");
  await waitFor(() => expect(editor).toHaveFocus());
});

it("queues images as thumbnails and documents as removable tokens", async () => {
  const { user } = renderComposer();

  await user.upload(getFileInput(), [
    imageFile(),
    pdfFile(),
  ]);

  expect(
    screen.getByRole("img", { name: "interview.png" }),
  ).toBeVisible();
  expect(screen.getByText("research.pdf")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Remove research.pdf" }),
  );
  expect(screen.queryByText("research.pdf")).not.toBeInTheDocument();
});

it("prevents dragover before queuing pasted and dropped files", () => {
  renderComposer();
  const editor = screen.getByRole("combobox", { name: "Message" });

  fireEvent.paste(editor, {
    clipboardData: {
      files: [pdfFile("pasted.pdf")],
      getData: () => "",
    },
  });
  const dragOver = createEvent.dragOver(editor, {
    dataTransfer: {
      files: [pdfFile("dropped.pdf")],
      types: ["Files"],
    },
  });
  fireEvent(editor, dragOver);
  expect(dragOver.defaultPrevented).toBe(true);
  fireEvent.drop(editor, {
    dataTransfer: {
      files: [pdfFile("dropped.pdf")],
    },
  });

  expect(screen.getByText("pasted.pdf")).toBeVisible();
  expect(screen.getByText("dropped.pdf")).toBeVisible();
});

it("preserves mention token DOM when formatting adjacent text", async () => {
  const onChange = vi.fn();
  const { user } = renderComposer({ onChange });

  await user.click(
    screen.getByRole("button", { name: "Mention someone" }),
  );
  await user.click(screen.getByText("Product Agent"));

  const editor = screen.getByRole("combobox", { name: "Message" });
  await user.type(editor, " evidence");
  await user.click(
    screen.getByRole("button", { name: "Formatting" }),
  );
  selectEditorSubstring(editor, "evidence");

  await user.click(screen.getByRole("button", { name: "Bold" }));

  const mentionBadge = screen.getByText("@Product Agent");
  expect(mentionBadge).toHaveAttribute(
    "data-variant",
    "purple",
  );
  expect(
    mentionBadge.closest("[data-astryx-token]"),
  ).toBeInTheDocument();
  expect(editor).toHaveTextContent("@Product Agent **evidence**");
  expect(onChange).toHaveBeenLastCalledWith(
    expect.stringContaining("**evidence**"),
  );
});

it("reports duplicate and count-limit attachment rejections", async () => {
  const { user } = renderComposer();
  const input = getFileInput();
  const duplicate = new File(["research"], "duplicate.pdf", {
    type: "application/pdf",
    lastModified: 300,
  });

  await user.upload(input, duplicate);
  await user.upload(
    input,
    new File(["research"], "duplicate.pdf", {
      type: "application/pdf",
      lastModified: 300,
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "duplicate.pdf is already queued.",
  );

  const remaining = Array.from(
    { length: MAX_COMPOSER_ATTACHMENTS },
    (_, index) =>
      new File(["notes"], `notes-${index}.txt`, {
        type: "text/plain",
        lastModified: index,
      }),
  );
  await user.upload(input, remaining);

  expect(screen.getByRole("alert")).toHaveTextContent(
    "You can attach up to 10 files.",
  );
  expect(screen.getByText("notes-8.txt")).toBeVisible();
  expect(screen.queryByText("notes-9.txt")).not.toBeInTheDocument();
});

it("revokes image object URLs on removal and unmount", async () => {
  const { unmount, user } = renderComposer();
  const input = getFileInput();

  await user.upload(input, imageFile("removed.png"));
  await user.click(
    screen.getByRole("button", { name: /Remove removed\.png/ }),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:removed.png");

  await user.upload(input, imageFile("unmounted.png"));
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(
    "blob:unmounted.png",
  );
});

describe.each([
  ["Maya Chen", "blue"],
  ["Product Agent", "purple"],
  ["Research Agent", "teal"],
] as const)("mention token %s", (label, variant) => {
  it(`inserts the ${variant} Astryx token from the shared mention picker`, async () => {
    const { user } = renderComposer();

    await user.click(
      screen.getByRole("button", { name: "Mention someone" }),
    );
    expect(
      screen.getByRole("listbox", {
        name: "Mention a teammate or agent",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Maya Chen" }),
    ).toBeVisible();
    expect(
      screen.getByTestId("product-agent-avatar"),
    ).toBeVisible();
    expect(
      screen.getByTestId("research-agent-avatar"),
    ).toBeVisible();

    await user.click(screen.getByText(label));

    expect(screen.getByText(`@${label}`)).toHaveAttribute(
      "data-variant",
      variant,
    );
  });
});

it("typing @ opens the same teammate and agent option source", async () => {
  const { user } = renderComposer();
  const editor = screen.getByRole("combobox", { name: "Message" });

  await user.click(editor);
  await user.type(editor, "@");

  const picker = screen.getByRole("listbox", {
    name: "Mention a teammate or agent",
  });
  expect(picker).toBeVisible();
  expect(screen.getByText("Maya Chen")).toBeVisible();
  expect(screen.getByText("Product Agent")).toBeVisible();
  expect(screen.getByText("Research Agent")).toBeVisible();
});

it("submits structured mentions and keeps queued files when submission fails", async () => {
  const onSubmit = vi.fn(async () => false);
  const { user } = renderComposer({
    value: "Ask @Maya Chen and @Product Agent",
    onSubmit,
  });
  await user.upload(
    getFileInput(),
    pdfFile(),
  );

  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({
      body: "Ask @Maya Chen and @Product Agent",
      attachments: [
        expect.objectContaining({
          file: expect.objectContaining({ name: "research.pdf" }),
        }),
      ],
      mentionedUserIds: ["user-2"],
      mentionedAgentKinds: ["product"],
    });
  });
  expect(screen.getByText("research.pdf")).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("Ask @Maya Chen and @Product Agent");
});

it("keeps a newer draft when an earlier submission fails", async () => {
  let resolveSubmission: ((didSubmit: boolean) => void) | undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolveSubmission = resolve;
      }),
  );
  const { user } = renderComposer({
    value: "Original draft",
    onSubmit,
  });

  await user.click(screen.getByRole("button", { name: "Send" }));
  const editor = screen.getByRole("combobox", { name: "Message" });
  await user.type(editor, "Newer draft");

  await act(async () => {
    resolveSubmission?.(false);
  });

  expect(editor).toHaveTextContent("Newer draft");
});

it("excludes attachments reserved by an in-flight send from a newer submission", async () => {
  let resolveFirstSubmission: ((didSubmit: boolean) => void) | undefined;
  const onSubmit = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirstSubmission = resolve;
        }),
    )
    .mockResolvedValueOnce(true);
  const { user } = renderComposer({
    value: "Original evidence",
    onSubmit,
  });
  await user.upload(getFileInput(), pdfFile("original.pdf"));

  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());

  const editor = screen.getByRole("combobox", { name: "Message" });
  await user.type(editor, "Clean follow-up");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  expect(
    onSubmit.mock.calls[0][0].attachments.map(
      (attachment: QueuedDiscoveryAttachment) =>
        attachment.file.name,
    ),
  ).toEqual(["original.pdf"]);
  expect(onSubmit.mock.calls[1][0].attachments).toEqual([]);

  await act(async () => {
    resolveFirstSubmission?.(true);
  });
});

it("enforces the attachment limit across queued and reserved files", async () => {
  let rejectSubmission: ((reason: Error) => void) | undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise<boolean>((_resolve, reject) => {
        rejectSubmission = reject;
      }),
  );
  const { user } = renderComposer({
    value: "Ten interview transcripts",
    onSubmit,
  });
  const originalFiles = Array.from(
    { length: MAX_COMPOSER_ATTACHMENTS },
    (_, index) => pdfFile(`original-${index}.pdf`),
  );
  await user.upload(getFileInput(), originalFiles);

  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  await user.upload(
    getFileInput(),
    Array.from(
      { length: MAX_COMPOSER_ATTACHMENTS },
      (_, index) => pdfFile(`newer-${index}.pdf`),
    ),
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "You can attach up to 10 files.",
  );
  expect(screen.queryByText("newer-0.pdf")).not.toBeInTheDocument();

  await act(async () => {
    rejectSubmission?.(new Error("Message persistence failed"));
  });

  for (const file of originalFiles) {
    expect(screen.getByText(file.name)).toBeVisible();
  }
  expect(screen.queryByText("newer-0.pdf")).not.toBeInTheDocument();
});

it("rejects a duplicate of an attachment reserved by an in-flight send", async () => {
  let resolveSubmission: ((didSubmit: boolean) => void) | undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolveSubmission = resolve;
      }),
  );
  const { user } = renderComposer({
    value: "Original evidence",
    onSubmit,
  });
  await user.upload(getFileInput(), pdfFile("original.pdf"));

  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  await user.upload(getFileInput(), pdfFile("original.pdf"));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "original.pdf is already queued.",
  );
  expect(screen.queryByText("original.pdf")).not.toBeInTheDocument();

  await act(async () => {
    resolveSubmission?.(true);
  });
});

it("clears stale attachment validation errors after a successful send", async () => {
  const onSubmit = vi.fn(async () => true);
  const { user } = renderComposer({
    value: "Original evidence",
    onSubmit,
  });
  await user.upload(getFileInput(), pdfFile("original.pdf"));
  await user.upload(getFileInput(), pdfFile("original.pdf"));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "original.pdf is already queued.",
  );

  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

it("restores only a rejected send's attachments alongside a newer draft queue", async () => {
  let rejectFirstSubmission: ((reason: Error) => void) | undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise<boolean>((_resolve, reject) => {
        rejectFirstSubmission = reject;
      }),
  );
  const { user } = renderComposer({
    value: "Original evidence",
    onSubmit,
  });
  await user.upload(getFileInput(), pdfFile("original.pdf"));

  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  expect(screen.queryByText("original.pdf")).not.toBeInTheDocument();

  const editor = screen.getByRole("combobox", { name: "Message" });
  await user.type(editor, "Newer draft");
  await user.upload(getFileInput(), pdfFile("newer.pdf"));

  await act(async () => {
    rejectFirstSubmission?.(new Error("Message persistence failed"));
  });

  expect(editor).toHaveTextContent("Newer draft");
  expect(screen.getByText("original.pdf")).toBeVisible();
  expect(screen.getByText("newer.pdf")).toBeVisible();
});

it("clears sent files and revokes their object URLs after successful submission", async () => {
  const onSubmit = vi.fn(async () => true);
  const { user } = renderComposer({
    value: "Interview context",
    onSubmit,
  });
  await user.upload(
    getFileInput(),
    imageFile(),
  );

  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(
      screen.queryByRole("img", { name: "interview.png" }),
    ).not.toBeInTheDocument();
  });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(
    "blob:interview.png",
  );
});
