// @vitest-environment jsdom

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
import type { DiscoveryAttachmentView } from "./attachment-types";
import type { DiscoveryMessage } from "./repository";

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

function stagedAttachmentView(
  id: string,
  file: File,
): DiscoveryAttachmentView {
  return {
    id,
    messageId: null,
    originalName: file.name,
    mimeType: file.type,
    caption: null,
    extractionStatus: "ready",
    viewUrl: null,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

it("posts derived teammate mentions and links staged attachments after persistence", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue(persistedMessage);
  const file = pdfFile("research.pdf");
  const staged = stagedAttachmentView("attachment-1", file);
  const stageAttachment = vi.fn().mockResolvedValue(staged);
  const linkAttachments = vi.fn().mockResolvedValue([staged.id]);
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
    linkAttachments,
  });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Ask @maya@example.com to review",
  );
  await user.upload(getFileInput(), file);
  await waitFor(() => expect(stageAttachment).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "Send" }));

  expect(sendMessage).toHaveBeenCalledWith({
    roomId,
    clientId,
    body: "Ask @maya@example.com to review",
    mentionedUserIds: [teammateId],
    mentionsProductAgent: false,
  });
  const stagingForm = stageAttachment.mock.calls[0][0] as FormData;
  expect(stagingForm.get("roomId")).toBe(roomId);
  expect(stagingForm.get("file")).toBe(file);
  await waitFor(() =>
    expect(linkAttachments).toHaveBeenCalledWith({
      roomId,
      messageId: persistedMessage.id,
      attachmentIds: [staged.id],
      caption: "Ask @maya@example.com to review",
    }),
  );
});

it("does not link attachments and preserves the draft and queue when message persistence fails", async () => {
  const sendMessage = vi
    .fn()
    .mockRejectedValue(new Error("Message persistence failed"));
  const file = pdfFile("queued.pdf");
  const stageAttachment = vi
    .fn()
    .mockResolvedValue(stagedAttachmentView("attachment-2", file));
  const linkAttachments = vi.fn();
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
    linkAttachments,
  });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Keep this draft",
  );
  await user.upload(getFileInput(), file);
  await waitFor(() => expect(stageAttachment).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Message persistence failed",
    ),
  );
  expect(linkAttachments).not.toHaveBeenCalled();
  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("Keep this draft");
  expect(screen.getByText("queued.pdf")).toBeVisible();
});

it("uses the message body as the caption when linking image uploads", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue({
    ...persistedMessage,
    body: "An annotated interview",
  });
  const file = imageFile("interview.png");
  const staged = stagedAttachmentView("attachment-2", file);
  const stageAttachment = vi.fn().mockResolvedValue(staged);
  const linkAttachments = vi.fn().mockResolvedValue([staged.id]);
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
    linkAttachments,
  });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "An annotated interview",
  );
  await user.upload(getFileInput(), file);
  await waitFor(() => expect(stageAttachment).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(linkAttachments).toHaveBeenCalledWith(
      expect.objectContaining({ caption: "An annotated interview" }),
    ),
  );
});

it("reports a linking failure without marking the persisted message as failed", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue({
    ...persistedMessage,
    body: "Compare the reports",
  });
  const file = pdfFile("uploaded.pdf");
  const staged = stagedAttachmentView("attachment-3", file);
  const stageAttachment = vi.fn().mockResolvedValue(staged);
  const linkAttachments = vi
    .fn()
    .mockRejectedValue(
      new Error("We could not attach every uploaded file."),
    );
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
    linkAttachments,
  });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Compare the reports",
  );
  await user.upload(getFileInput(), file);
  await waitFor(() => expect(stageAttachment).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not attach every uploaded file.",
    );
  });
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

it("links staged attachments against the realtime message when the action response is lost", async () => {
  const subscription = {
    emit: null as ((message: DiscoveryMessage) => void) | null,
  };
  const clientId = "30000000-0000-4000-8000-000000000007";
  const realtimeMessage: DiscoveryMessage = {
    id: "40000000-0000-4000-8000-000000000008",
    roomId,
    clientId,
    authorId: currentUserId,
    authorName: "Owner Example",
    body: "Upload after the realtime race",
    createdAt: "2026-07-25T12:00:00.000Z",
    delivery: "persisted",
  };
  const file = pdfFile("race-failed.pdf");
  const staged = stagedAttachmentView("attachment-4", file);
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  let rejectAction: ((reason: Error) => void) | undefined;
  const sendMessage = vi.fn(
    () =>
      new Promise<DiscoveryMessage>((_resolve, reject) => {
        rejectAction = reject;
      }),
  );
  const stageAttachment = vi.fn().mockResolvedValue(staged);
  const linkAttachments = vi
    .fn()
    .mockRejectedValue(
      new Error("We could not attach every uploaded file."),
    );
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
    linkAttachments,
    subscribe: (onMessage) => {
      subscription.emit = onMessage;
      return () => {};
    },
  });

  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    realtimeMessage.body,
  );
  await user.upload(getFileInput(), file);
  await waitFor(() => expect(stageAttachment).toHaveBeenCalledOnce());
  await user.click(screen.getByRole("button", { name: "Send" }));

  subscription.emit?.(realtimeMessage);
  rejectAction?.(new Error("The action response was lost"));

  await waitFor(() =>
    expect(linkAttachments).toHaveBeenCalledWith({
      roomId,
      messageId: realtimeMessage.id,
      attachmentIds: [staged.id],
      caption: realtimeMessage.body,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not attach every uploaded file.",
    ),
  );
  const message = screen.getByTestId(
    `conversation-message-${clientId}`,
  );
  expect(
    within(message).queryByText("Failed to send"),
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
