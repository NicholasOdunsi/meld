// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DiscoveryMessage } from "./repository";

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

import { Conversation } from "./components/conversation";

const roomId = "20000000-0000-4000-8000-000000000001";
const currentUserId = "10000000-0000-4000-8000-000000000001";
const teammateId = "10000000-0000-4000-8000-000000000002";
const persistedMessage: DiscoveryMessage = {
  id: "40000000-0000-4000-8000-000000000020",
  roomId,
  clientId: "30000000-0000-4000-8000-000000000020",
  authorId: currentUserId,
  authorName: "Owner Example",
  body: "Ask @maya@example.com to review",
  createdAt: "2026-07-25T12:00:00.000Z",
  delivery: "persisted",
};

type ConversationProps = ComponentProps<typeof Conversation>;

function renderConversation(
  props: Partial<ConversationProps> = {},
) {
  const user = userEvent.setup();
  const view = render(
    <Conversation
      roomId={roomId}
      roomName="Customer interviews"
      currentUserId={currentUserId}
      currentUserName="Owner Example"
      participants={[
        {
          userId: teammateId,
          email: "maya@example.com",
        },
      ]}
      initialMessages={[]}
      sendMessage={vi.fn()}
      subscribe={() => () => {}}
      {...props}
    />,
  );

  return { ...view, user };
}

function getFileInput() {
  return screen.getByLabelText("Add files or images", {
    selector: "input",
  });
}

function pdfFile(name: string) {
  return new File(["research"], name, {
    type: "application/pdf",
    lastModified: 200,
  });
}

function imageFile(name: string) {
  return new File(["image"], name, {
    type: "image/png",
    lastModified: 100,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

it("posts derived teammate mentions and uploads queued files after persistence", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue(persistedMessage);
  const uploadFile = vi.fn().mockResolvedValue({
    id: "attachment-1",
    originalName: "research.pdf",
    extractionStatus: "ready",
  });
  const file = pdfFile("research.pdf");
  const { user } = renderConversation({ sendMessage, uploadFile });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Ask @maya@example.com to review",
  );
  await user.upload(getFileInput(), file);
  await user.click(screen.getByRole("button", { name: "Send" }));

  expect(sendMessage).toHaveBeenCalledWith({
    roomId,
    clientId,
    body: "Ask @maya@example.com to review",
    mentionedUserIds: [teammateId],
    mentionsProductAgent: false,
  });
  await waitFor(() =>
    expect(uploadFile).toHaveBeenCalledWith(expect.any(FormData)),
  );
  const form = uploadFile.mock.calls[0][0] as FormData;
  expect(form.get("roomId")).toBe(roomId);
  expect(form.get("messageId")).toBe(persistedMessage.id);
  expect(form.get("file")).toBe(file);
});

it("does not upload and preserves the draft and queue when message persistence fails", async () => {
  const sendMessage = vi
    .fn()
    .mockRejectedValue(new Error("Message persistence failed"));
  const uploadFile = vi.fn();
  const { user } = renderConversation({ sendMessage, uploadFile });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Keep this draft",
  );
  await user.upload(getFileInput(), pdfFile("queued.pdf"));
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Message persistence failed",
    ),
  );
  expect(uploadFile).not.toHaveBeenCalled();
  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("Keep this draft");
  expect(screen.getByText("queued.pdf")).toBeVisible();
});

it("uses the message body as the caption for image uploads", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue({
    ...persistedMessage,
    body: "An annotated interview",
  });
  const uploadFile = vi.fn().mockResolvedValue({
    id: "attachment-2",
    originalName: "interview.png",
    extractionStatus: "ready",
  });
  const { user } = renderConversation({ sendMessage, uploadFile });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "An annotated interview",
  );
  await user.upload(getFileInput(), imageFile("interview.png"));
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());
  const form = uploadFile.mock.calls[0][0] as FormData;
  expect(form.get("caption")).toBe("An annotated interview");
});

it("settles every upload, reports only failed files, and keeps the persisted message", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue({
    ...persistedMessage,
    body: "Compare the reports",
  });
  let resolveSuccessfulUpload:
    | ((value: {
        id: string;
        originalName: string;
        extractionStatus: string;
      }) => void)
    | undefined;
  const uploadFile = vi.fn((form: FormData) => {
    const file = form.get("file") as File;
    if (file.name === "failed.pdf") {
      return Promise.reject(new Error("Upload failed"));
    }
    return new Promise<{
      id: string;
      originalName: string;
      extractionStatus: string;
    }>((resolve) => {
      resolveSuccessfulUpload = resolve;
    });
  });
  const { user } = renderConversation({ sendMessage, uploadFile });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Compare the reports",
  );
  await user.upload(getFileInput(), [
    pdfFile("failed.pdf"),
    pdfFile("uploaded.pdf"),
  ]);
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  resolveSuccessfulUpload?.({
    id: "attachment-3",
    originalName: "uploaded.pdf",
    extractionStatus: "ready",
  });

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("failed.pdf");
  });
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "uploaded.pdf",
  );
  const message = screen.getByTestId(
    `conversation-message-${clientId}`,
  );
  expect(within(message).getByText("Compare the reports")).toBeVisible();
  expect(
    within(message).queryByText("Failed to send"),
  ).not.toBeInTheDocument();
});

it("renders message Markdown as semantic strong text and a list", () => {
  renderConversation({
    initialMessages: [
      {
        ...persistedMessage,
        body: "**important**\n\n- First signal\n- Second signal",
      },
    ],
  });

  const message = screen.getByTestId(
    `conversation-message-${persistedMessage.clientId}`,
  );
  expect(
    within(message).getByText("important").tagName,
  ).toBe("STRONG");
  const list = within(message).getByRole("list");
  expect(
    within(list).getAllByRole("listitem"),
  ).toHaveLength(2);
});

it("adds an optimistic message and idempotently reconciles its persisted event", async () => {
  const subscription = {
    emit: null as ((message: DiscoveryMessage) => void) | null,
  };
  const clientId = "30000000-0000-4000-8000-000000000003";
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn(
    async (): Promise<DiscoveryMessage> =>
      new Promise(() => {
        // The realtime event is deliberately emitted before this request
        // settles, exercising optimistic reconciliation.
      }),
  );

  render(
    <Conversation
      roomId={roomId}
      roomName="Customer interviews"
      currentUserId={currentUserId}
      currentUserName="Owner Example"
      initialMessages={[]}
      sendMessage={sendMessage}
      subscribe={(onMessage) => {
        subscription.emit = onMessage;
        return () => {};
      }}
    />,
  );

  await userEvent.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Customer interviews disagree",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(screen.getByText("Customer interviews disagree")).toBeVisible();
  const optimisticMessage = screen.getByTestId(
    `conversation-message-${clientId}`,
  );
  expect(
    optimisticMessage.querySelector(".astryx-chat-message-bubble"),
  ).not.toBeInTheDocument();
  expect(
    within(optimisticMessage).getByRole("img", {
      name: "Owner Example",
    }),
  ).toBeVisible();
  expect(sendMessage).toHaveBeenCalledWith({
    roomId,
    clientId,
    body: "Customer interviews disagree",
    mentionedUserIds: [],
    mentionsProductAgent: false,
  });

  subscription.emit?.({
    id: "40000000-0000-4000-8000-000000000004",
    roomId,
    clientId,
    authorId: currentUserId,
    authorName: "Owner Example",
    body: "Customer interviews disagree",
    createdAt: "2026-07-25T12:00:00.000Z",
    delivery: "persisted",
  });

  await waitFor(() => {
    expect(
      screen.getAllByText("Customer interviews disagree"),
    ).toHaveLength(1);
  });
});

it("keeps a persisted realtime message when the matching action later rejects", async () => {
  const subscription = {
    emit: null as ((message: DiscoveryMessage) => void) | null,
  };
  const clientId = "30000000-0000-4000-8000-000000000005";
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  let rejectAction: ((reason: Error) => void) | undefined;
  const sendMessage = vi.fn(
    () =>
      new Promise<DiscoveryMessage>((_resolve, reject) => {
        rejectAction = reject;
      }),
  );

  render(
    <Conversation
      roomId={roomId}
      roomName="Customer interviews"
      currentUserId={currentUserId}
      currentUserName="Owner Example"
      initialMessages={[]}
      sendMessage={sendMessage}
      subscribe={(onMessage) => {
        subscription.emit = onMessage;
        return () => {};
      }}
    />,
  );

  await userEvent.type(
    screen.getByRole("combobox", { name: "Message" }),
    "The event won the race",
  );
  await userEvent.click(screen.getByRole("button", { name: "Send" }));

  subscription.emit?.({
    id: "40000000-0000-4000-8000-000000000006",
    roomId,
    clientId,
    authorId: currentUserId,
    authorName: "Owner Example",
    body: "The event won the race",
    createdAt: "2026-07-25T12:00:00.000Z",
    delivery: "persisted",
  });
  rejectAction?.(new Error("The action response was lost"));

  await waitFor(() => {
    expect(screen.getAllByText("The event won the race")).toHaveLength(1);
  });
  expect(screen.queryByText("Failed to send")).not.toBeInTheDocument();
  expect(
    screen.queryByText("The action response was lost"),
  ).not.toBeInTheDocument();
});

it("offers teammate and agent mentions in the shared picker", async () => {
  const user = userEvent.setup();
  render(
    <Conversation
      roomId={roomId}
      roomName="Customer interviews"
      currentUserId={currentUserId}
      currentUserName="Owner Example"
      participants={[
        {
          userId: teammateId,
          email: "maya@example.com",
        },
      ]}
      initialMessages={[]}
      sendMessage={vi.fn()}
      subscribe={() => () => {}}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Mention someone" }),
  );
  expect(
    screen.getByRole("listbox", {
      name: "Mention a teammate or agent",
    }),
  ).toBeVisible();
  expect(screen.getByText("maya@example.com")).toBeVisible();
  expect(screen.getByText("Product Agent")).toBeVisible();
  expect(screen.getByText("Research Agent")).toBeVisible();
  expect(screen.getByTestId("empty-room-welcome")).toBeVisible();
  expect(screen.getByTestId("discovery-room-mascot")).toHaveAttribute(
    "src",
    expect.stringContaining("%2Fmascots%2Fmeld-spark.png"),
  );
  expect(
    screen.getByRole("heading", {
      name: "Start exploring Customer interviews together",
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Share observations, evidence, and questions with your team. Mention a connected agent to synthesize insights and suggest next steps.",
    ),
  ).toBeVisible();
  expect(screen.getByTestId("discovery-chat-composer")).toHaveStyle({
    "--color-background-popover":
      "var(--color-background-surface)",
  });
  expect(
    screen.queryByText("Start the discovery conversation"),
  ).not.toBeInTheDocument();
});

it("shows the actual sender name and a stable marker for agent messages", () => {
  render(
    <Conversation
      roomId={roomId}
      roomName="Customer interviews"
      currentUserId={currentUserId}
      currentUserName="Owner Example"
      participants={[
        {
          userId: "10000000-0000-4000-8000-000000000002",
          email: "maya@example.com",
        },
      ]}
      initialMessages={[
        {
          id: "40000000-0000-4000-8000-000000000010",
          roomId,
          clientId: "30000000-0000-4000-8000-000000000010",
          authorId: "10000000-0000-4000-8000-000000000002",
          authorName: "Room participant",
          body: "The interviews point to a trust problem.",
          createdAt: "2026-07-25T12:00:00.000Z",
          delivery: "persisted",
        },
        {
          id: "40000000-0000-4000-8000-000000000011",
          roomId,
          clientId: "30000000-0000-4000-8000-000000000011",
          authorId: "agent:research",
          authorName: "Research Agent",
          body: "I grouped the strongest signals.",
          createdAt: "2026-07-25T12:01:00.000Z",
          delivery: "persisted",
        },
      ]}
      subscribe={() => () => {}}
    />,
  );

  const humanMessage = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000010",
  );
  expect(within(humanMessage).getByText("maya@example.com")).toBeVisible();
  expect(
    within(humanMessage).queryByText("Room participant"),
  ).not.toBeInTheDocument();

  const agentMessage = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000011",
  );
  expect(within(agentMessage).getByText("Research Agent")).toBeVisible();
  expect(
    within(agentMessage).getByTestId("research-agent-avatar"),
  ).toHaveStyle({
    backgroundColor: "var(--color-icon-teal)",
    color: "var(--color-on-dark)",
  });
});
