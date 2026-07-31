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
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { PostMessageResult } from "../actions";
import type { DiscoveryAttachmentView } from "../attachment-types";
import type { DiscoveryMessage } from "../repository";
import {
  parseRoomDraft,
  roomDraftStorageKey,
  serializeRoomDraft,
} from "./composer-model";

function postResult(message: DiscoveryMessage): PostMessageResult {
  return { message, agentTask: { status: "not_requested" } };
}

const NOT_READY: AgentReadiness = { ready: false, reason: "no_device" };

function readyReadiness(): AgentReadiness {
  return {
    ready: true,
    defaultProvider: "codex",
    defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
    providers: [
      {
        provider: "codex",
        deviceId: "d0000000-0000-4000-8000-000000000000",
        deviceName: "Ada's MacBook",
      },
      {
        provider: "claude",
        deviceId: "d0000000-0000-4000-8000-000000000000",
        deviceName: "Ada's MacBook",
      },
    ],
  };
}

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

import { Conversation } from "./conversation";

const roomId = "20000000-0000-4000-8000-000000000001";
const currentUserId = "10000000-0000-4000-8000-000000000001";
const teammateId = "10000000-0000-4000-8000-000000000002";

function humanMessage(
  overrides: Partial<DiscoveryMessage> = {},
): DiscoveryMessage {
  return {
    id: "40000000-0000-4000-8000-000000000020",
    roomId,
    clientId: "30000000-0000-4000-8000-000000000020",
    authorType: "human",
    authorId: currentUserId,
    initiatedBy: null,
    aiTaskId: null,
    provider: null,
    body: "Ask @maya@example.com to review",
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
    createdAt: "2026-07-25T12:00:00.000Z",
    delivery: "persisted",
    ...overrides,
  };
}

function productAgentMessage(
  overrides: Partial<DiscoveryMessage> = {},
): DiscoveryMessage {
  return humanMessage({
    id: "40000000-0000-4000-8000-000000000099",
    clientId: "70000000-0000-4000-8000-000000000099",
    authorType: "product_agent",
    authorId: null,
    initiatedBy: teammateId,
    aiTaskId: "70000000-0000-4000-8000-000000000007",
    provider: "codex",
    body: "The strongest signal is onboarding trust.",
    ...overrides,
  });
}

const persistedMessage: DiscoveryMessage = humanMessage();

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
      fetchReadiness={vi.fn().mockResolvedValue(NOT_READY)}
      fetchTaskStatuses={vi.fn().mockResolvedValue([])}
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
  routerMocks.push.mockReset();
  window.sessionStorage.clear();
});

afterEach(cleanup);

const organizationId = "60000000-0000-4000-8000-000000000006";

it("posts derived teammate mentions and links staged attachments after persistence", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue(postResult(persistedMessage));
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
  const sendMessage = vi.fn().mockResolvedValue(
    postResult({
      ...persistedMessage,
      body: "An annotated interview",
    }),
  );
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
  const sendMessage = vi.fn().mockResolvedValue(
    postResult({
      ...persistedMessage,
      body: "Compare the reports",
    }),
  );
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
    async (): Promise<PostMessageResult> =>
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
      fetchReadiness={vi.fn().mockResolvedValue(NOT_READY)}
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

  subscription.emit?.(
    humanMessage({
      id: "40000000-0000-4000-8000-000000000004",
      clientId,
      body: "Customer interviews disagree",
    }),
  );

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
      new Promise<PostMessageResult>((_resolve, reject) => {
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
      fetchReadiness={vi.fn().mockResolvedValue(NOT_READY)}
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

  subscription.emit?.(
    humanMessage({
      id: "40000000-0000-4000-8000-000000000006",
      clientId,
      body: "The event won the race",
    }),
  );
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
  const realtimeMessage: DiscoveryMessage = humanMessage({
    id: "40000000-0000-4000-8000-000000000008",
    clientId,
    body: "Upload after the realtime race",
  });
  const file = pdfFile("race-failed.pdf");
  const staged = stagedAttachmentView("attachment-4", file);
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  let rejectAction: ((reason: Error) => void) | undefined;
  const sendMessage = vi.fn(
    () =>
      new Promise<PostMessageResult>((_resolve, reject) => {
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

it("renders a human as its author and a Product Agent reply from its provenance", () => {
  // The Product Agent reply was initiated by the teammate, not the current
  // user, yet it must render as the Product Agent -- proving the identity comes
  // from author_type provenance, never from who asked.
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
      initialMessages={[
        humanMessage({
          id: "40000000-0000-4000-8000-000000000010",
          clientId: "30000000-0000-4000-8000-000000000010",
          authorId: teammateId,
          body: "The interviews point to a trust problem.",
        }),
        productAgentMessage({
          clientId: "30000000-0000-4000-8000-000000000011",
          provider: "claude",
          initiatedBy: teammateId,
          body: "I grouped the strongest signals.",
          assumptions: ["The beta cohort is representative."],
          citedMessageIds: ["40000000-0000-4000-8000-000000000010"],
          suggestedNextQuestions: ["What erodes onboarding trust?"],
        }),
      ]}
      subscribe={() => () => {}}
    />,
  );

  const humanMsgEl = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000010",
  );
  expect(within(humanMsgEl).getByText("maya@example.com")).toBeVisible();
  expect(
    within(humanMsgEl).queryByText("Room participant"),
  ).not.toBeInTheDocument();

  const agentMsgEl = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000011",
  );
  expect(within(agentMsgEl).getByText("Product Agent")).toBeVisible();
  expect(within(agentMsgEl).getByText(/Claude/)).toBeVisible();
  expect(
    within(agentMsgEl).getByText("Asked by maya@example.com"),
  ).toBeVisible();
  expect(
    within(agentMsgEl).getByTestId("product-agent-avatar"),
  ).toHaveStyle({
    backgroundColor: "var(--color-icon-purple)",
    color: "var(--color-on-dark)",
  });
  // Provenance content: assumptions, citation source action, suggested question.
  expect(
    within(agentMsgEl).getByText("The beta cohort is representative."),
  ).toBeVisible();
  expect(
    within(agentMsgEl).getByRole("button", { name: "Source 1" }),
  ).toBeVisible();
  expect(
    within(agentMsgEl).getByRole("button", {
      name: "What erodes onboarding trust?",
    }),
  ).toBeVisible();
});

it("restores the saved draft and queues a Product Agent reply with the restored provider", async () => {
  const draftBody = "Ask @Product Agent to help";
  window.sessionStorage.setItem(
    roomDraftStorageKey(roomId),
    serializeRoomDraft({
      body: draftBody,
      providerOverride: "claude",
      attachmentIds: [],
      mentionRanges: [{ start: 4, end: 18 }],
    }),
  );
  const clientId = "30000000-0000-4000-8000-000000000030";
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const persisted: DiscoveryMessage = {
    ...persistedMessage,
    clientId,
    body: draftBody,
  };
  const sendMessage = vi.fn().mockResolvedValue({
    message: persisted,
    agentTask: { status: "queued", taskId: "task-1" },
  });
  const { user } = renderConversation({
    organizationId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  // The picker only appears if the product-mention draft was restored and
  // readiness resolved ready.
  await screen.findByTestId("agent-provider-picker");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: draftBody,
        mentionsProductAgent: true,
        providerOverride: "claude",
      }),
    ),
  );
  // The draft is cleared only after the human message persisted.
  await waitFor(() =>
    expect(
      window.sessionStorage.getItem(roomDraftStorageKey(roomId)),
    ).toBeNull(),
  );
});

it("preserves the draft and routes to AI setup when no provider is ready", async () => {
  const draftBody = "Ask @Product Agent for signals";
  window.sessionStorage.setItem(
    roomDraftStorageKey(roomId),
    serializeRoomDraft({
      body: draftBody,
      attachmentIds: [],
      mentionRanges: [{ start: 4, end: 18 }],
    }),
  );
  const sendMessage = vi.fn();
  const { user } = renderConversation({
    organizationId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(NOT_READY),
  });

  const connect = await screen.findByRole("button", {
    name: "Connect personal AI",
  });
  await user.click(connect);

  expect(sendMessage).not.toHaveBeenCalled();
  const expectedReturnTo = encodeURIComponent(
    `/${organizationId}/discovery/${roomId}`,
  );
  expect(routerMocks.push).toHaveBeenCalledWith(
    `/${organizationId}/settings/devices?returnTo=${expectedReturnTo}`,
  );
  const stored = parseRoomDraft(
    window.sessionStorage.getItem(roomDraftStorageKey(roomId)),
  );
  expect(stored?.body).toBe(draftBody);
});

it("keeps the persisted message and offers a retry when the agent task fails after persistence", async () => {
  const draftBody = "Ask @Product Agent now";
  window.sessionStorage.setItem(
    roomDraftStorageKey(roomId),
    serializeRoomDraft({
      body: draftBody,
      attachmentIds: [],
      mentionRanges: [{ start: 4, end: 18 }],
    }),
  );
  const clientId = "30000000-0000-4000-8000-000000000031";
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const persisted: DiscoveryMessage = {
    ...persistedMessage,
    clientId,
    body: draftBody,
  };
  const sendMessage = vi.fn().mockResolvedValue({
    message: persisted,
    agentTask: {
      status: "retryable_error",
      message: "We could not ask the Product Agent to reply.",
    },
  });
  const { user } = renderConversation({
    organizationId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  await screen.findByTestId("agent-provider-picker");
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not ask the Product Agent to reply.",
    ),
  );
  const message = screen.getByTestId(
    `conversation-message-${clientId}`,
  );
  // The body renders with the mention as a badge, so assert the persisted
  // message is present (not marked failed) rather than matching split text.
  expect(within(message).getByText("@Product Agent")).toBeVisible();
  expect(
    within(message).queryByText("Failed to send"),
  ).not.toBeInTheDocument();
});

const SOURCE_MESSAGE_ID = "40000000-0000-4000-8000-000000000010";
const SOURCE_CLIENT_ID = "30000000-0000-4000-8000-000000000010";

function runningStatus(
  overrides: Partial<RoomTaskStatus> = {},
): RoomTaskStatus {
  return {
    taskId: "70000000-0000-4000-8000-000000000007",
    sourceMessageId: SOURCE_MESSAGE_ID,
    initiatingUserId: currentUserId,
    provider: "codex",
    status: "running",
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:00:30.000Z",
    ...overrides,
  };
}

it("shows safe pending task state under the source message from the status projection", async () => {
  const fetchTaskStatuses = vi
    .fn()
    .mockResolvedValue([runningStatus()]);
  renderConversation({
    initialMessages: [
      humanMessage({
        id: SOURCE_MESSAGE_ID,
        clientId: SOURCE_CLIENT_ID,
        body: "Ask @Product Agent for the signal",
      }),
    ],
    fetchTaskStatuses,
  });

  const sourceMessage = await screen.findByTestId(
    `conversation-message-${SOURCE_CLIENT_ID}`,
  );
  await waitFor(() =>
    expect(
      within(sourceMessage).getByTestId("agent-task-state"),
    ).toBeVisible(),
  );
  expect(
    within(sourceMessage).getByText(
      "Product Agent is responding via Codex",
    ),
  ).toBeVisible();
  expect(fetchTaskStatuses).toHaveBeenCalledWith(roomId);
});

it("cancels a pending task through the authenticated cancel action", async () => {
  const fetchTaskStatuses = vi
    .fn()
    .mockResolvedValue([runningStatus()]);
  const cancelTask = vi.fn().mockResolvedValue(undefined);
  const { user } = renderConversation({
    initialMessages: [
      humanMessage({
        id: SOURCE_MESSAGE_ID,
        clientId: SOURCE_CLIENT_ID,
      }),
    ],
    fetchTaskStatuses,
    cancelTask,
  });

  const sourceMessage = await screen.findByTestId(
    `conversation-message-${SOURCE_CLIENT_ID}`,
  );
  const cancel = await within(sourceMessage).findByRole("button", {
    name: "Cancel",
  });
  await user.click(cancel);

  expect(cancelTask).toHaveBeenCalledWith(
    "70000000-0000-4000-8000-000000000007",
  );
});

it("removes the pending state when the task is no longer visible", async () => {
  const fetchTaskStatuses = vi
    .fn()
    .mockResolvedValueOnce([runningStatus()])
    .mockResolvedValue([]);
  renderConversation({
    initialMessages: [
      humanMessage({
        id: SOURCE_MESSAGE_ID,
        clientId: SOURCE_CLIENT_ID,
      }),
    ],
    fetchTaskStatuses,
  });

  const sourceMessage = await screen.findByTestId(
    `conversation-message-${SOURCE_CLIENT_ID}`,
  );
  await within(sourceMessage).findByTestId("agent-task-state");
  // The next poll returns nothing (e.g. access revoked or the task settled and
  // its reply arrived over Realtime): the pending affordance is removed. The
  // poll interval is two seconds, so allow past it.
  await waitFor(
    () =>
      expect(
        within(sourceMessage).queryByTestId("agent-task-state"),
      ).not.toBeInTheDocument(),
    { timeout: 3000 },
  );
});

it("fills the composer when a suggested next question is chosen", async () => {
  const { user } = renderConversation({
    initialMessages: [
      productAgentMessage({
        clientId: "30000000-0000-4000-8000-000000000055",
        suggestedNextQuestions: ["What erodes onboarding trust?"],
      }),
    ],
  });

  await user.click(
    screen.getByRole("button", { name: "What erodes onboarding trust?" }),
  );

  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("What erodes onboarding trust?");
});
