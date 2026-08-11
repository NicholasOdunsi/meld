// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
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
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import type { PostMessageResult } from "../actions";
import type { RoomAttachmentView } from "../attachment-types";
import type {
  RoomMessage,
  RoomPrdContext,
  RoomPrdContextSection,
} from "../repository";
import {
  parseRoomDraft,
  roomDraftStorageKey,
  serializeRoomDraft,
} from "./composer-model";

function postResult(message: RoomMessage): PostMessageResult {
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
  overrides: Partial<RoomMessage> = {},
): RoomMessage {
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
    proposedAction: null,
    kind: "conversation",
    prdContext: null,
    prdChange: null,
    attachments: [],
    createdAt: "2026-07-25T12:00:00.000Z",
    delivery: "persisted",
    ...overrides,
  };
}

function productAgentMessage(
  overrides: Partial<RoomMessage> = {},
): RoomMessage {
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

const persistedMessage: RoomMessage = humanMessage();

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
      fetchMessageAttachments={vi.fn().mockResolvedValue([])}
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

function stagedAttachmentView(
  id: string,
  file: File,
): RoomAttachmentView {
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

const workspaceId = "60000000-0000-4000-8000-000000000006";

it("posts derived teammate mentions with the staged attachment ids", async () => {
  const clientId = persistedMessage.clientId;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(clientId);
  const sendMessage = vi.fn().mockResolvedValue(postResult(persistedMessage));
  const file = pdfFile("research.pdf");
  const staged = stagedAttachmentView("attachment-1", file);
  const stageAttachment = vi.fn().mockResolvedValue(staged);
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
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
    attachmentIds: [staged.id],
  });
  const stagingForm = stageAttachment.mock.calls[0][0] as FormData;
  expect(stagingForm.get("roomId")).toBe(roomId);
  expect(stagingForm.get("file")).toBe(file);
});

it("preserves the draft and queue when message persistence fails", async () => {
  const sendMessage = vi
    .fn()
    .mockRejectedValue(new Error("Message persistence failed"));
  const file = pdfFile("queued.pdf");
  const stageAttachment = vi
    .fn()
    .mockResolvedValue(stagedAttachmentView("attachment-2", file));
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
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
  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("Keep this draft");
  // Scoped to the composer: the failed message bubble also renders the same
  // file name via its own attachments list, so an unscoped query would match
  // twice.
  expect(
    within(
      screen.getByTestId("room-chat-composer"),
    ).getByText("queued.pdf"),
  ).toBeVisible();
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
    emit: null as ((message: RoomMessage) => void) | null,
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
    emit: null as ((message: RoomMessage) => void) | null,
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

it("forwards attachment ids in the send input even when the action response is lost to a realtime race", async () => {
  const subscription = {
    emit: null as ((message: RoomMessage) => void) | null,
  };
  const clientId = "30000000-0000-4000-8000-000000000007";
  const realtimeMessage: RoomMessage = humanMessage({
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
  const { user } = renderConversation({
    sendMessage,
    stageAttachment,
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

  // Attachment ids travel inside the same send input the server links
  // against -- there is no separate client call left to lose, so the ids are
  // already captured on the request before the realtime race below plays out.
  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ attachmentIds: [staged.id] }),
  );

  subscription.emit?.(realtimeMessage);
  rejectAction?.(new Error("The action response was lost"));

  await waitFor(() => {
    expect(
      screen.getAllByText("Upload after the realtime race"),
    ).toHaveLength(1);
  });
  const message = screen.getByTestId(
    `conversation-message-${clientId}`,
  );
  expect(
    within(message).queryByText("Failed to send"),
  ).not.toBeInTheDocument();
});

it("keeps a message's image when the realtime echo carries no attachments", async () => {
  const subscription = {
    emit: null as ((message: RoomMessage) => void) | null,
  };
  const id = "40000000-0000-4000-8000-000000000061";
  const clientId = "30000000-0000-4000-8000-000000000061";
  const imageAttachment: RoomAttachmentView = {
    id: "a0000000-0000-4000-8000-000000000061",
    messageId: id,
    originalName: "screenshot.png",
    mimeType: "image/png",
    caption: "screenshot.png",
    extractionStatus: "unsupported",
    viewUrl: "https://example.test/signed/screenshot.png",
  };
  renderConversation({
    initialMessages: [
      humanMessage({ id, clientId, body: "", attachments: [imageAttachment] }),
    ],
    subscribe: (onMessage) => {
      subscription.emit = onMessage;
      return () => {};
    },
  });

  expect(await screen.findByTestId("message-attachments")).toBeInTheDocument();

  // The Realtime INSERT echo for the same message arrives with no attachments
  // (they link over a separate write); it must not blank the rendered image.
  subscription.emit?.(
    humanMessage({ id, clientId, body: "", attachments: [] }),
  );

  await waitFor(() => {
    expect(
      screen.getByRole("img", { name: "screenshot.png" }),
    ).toBeInTheDocument();
  });
});

it("resolves a teammate's image the moment their realtime message arrives", async () => {
  const subscription = {
    emit: null as ((message: RoomMessage) => void) | null,
  };
  const id = "40000000-0000-4000-8000-000000000062";
  const clientId = "30000000-0000-4000-8000-000000000062";
  const imageAttachment: RoomAttachmentView = {
    id: "a0000000-0000-4000-8000-000000000062",
    messageId: id,
    originalName: "teammate.png",
    mimeType: "image/png",
    caption: "teammate.png",
    extractionStatus: "unsupported",
    viewUrl: "https://example.test/signed/teammate.png",
  };
  const fetchMessageAttachments = vi
    .fn()
    .mockResolvedValue([imageAttachment]);
  renderConversation({
    fetchMessageAttachments,
    subscribe: (onMessage) => {
      subscription.emit = onMessage;
      return () => {};
    },
  });

  // A teammate's message arrives over Realtime with no attachments; the raw
  // INSERT row never carries them.
  subscription.emit?.(
    humanMessage({
      id,
      clientId,
      authorId: teammateId,
      body: "",
      attachments: [],
    }),
  );

  await waitFor(() => {
    expect(
      screen.getByRole("img", { name: "teammate.png" }),
    ).toBeInTheDocument();
  });
  expect(fetchMessageAttachments).toHaveBeenCalledWith(roomId, id);
});

it("retries a teammate's attachment lookup when linking is not visible yet", async () => {
  const subscription = {
    emit: null as ((message: RoomMessage) => void) | null,
  };
  const id = "40000000-0000-4000-8000-000000000063";
  const imageAttachment: RoomAttachmentView = {
    id: "a0000000-0000-4000-8000-000000000063",
    messageId: id,
    originalName: "eventual.png",
    mimeType: "image/png",
    caption: "eventual.png",
    extractionStatus: "unsupported",
    viewUrl: "https://example.test/signed/eventual.png",
  };
  const fetchMessageAttachments = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([imageAttachment]);
  renderConversation({
    fetchMessageAttachments,
    subscribe: (onMessage) => {
      subscription.emit = onMessage;
      return () => {};
    },
  });

  subscription.emit?.(
    humanMessage({
      id,
      clientId: "30000000-0000-4000-8000-000000000063",
      authorId: teammateId,
      body: "",
      attachments: [],
    }),
  );

  expect(
    await screen.findByRole("img", { name: "eventual.png" }),
  ).toBeInTheDocument();
  expect(fetchMessageAttachments).toHaveBeenCalledTimes(2);
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
  expect(screen.getByTestId("room-mascot")).toHaveAttribute(
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
  expect(screen.getByTestId("room-chat-composer")).toHaveStyle({
    "--color-background-popover":
      "var(--color-background-surface)",
  });
  expect(
    screen.queryByText("Start the room conversation"),
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
  expect(humanMsgEl).toHaveAttribute("data-sender", "assistant");
  expect(within(humanMsgEl).getByText("maya@example.com")).toBeVisible();
  expect(
    within(humanMsgEl).queryByText("Room participant"),
  ).not.toBeInTheDocument();

  const agentMsgEl = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000011",
  );
  expect(agentMsgEl).toHaveAttribute("data-sender", "assistant");
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
  // Provenance content: assumptions and suggested question render. Citations are
  // intentionally not shown -- a bare "Source N" chip reads as meaningless, so
  // even with citedMessageIds present the Sources UI is gone.
  expect(
    within(agentMsgEl).getByText("The beta cohort is representative."),
  ).toBeVisible();
  expect(
    within(agentMsgEl).queryByRole("button", { name: "Source 1" }),
  ).not.toBeInTheDocument();
  expect(
    within(agentMsgEl).queryByTestId("agent-citations"),
  ).not.toBeInTheDocument();
  expect(
    within(agentMsgEl).getByRole("button", {
      name: "What erodes onboarding trust?",
    }),
  ).toBeVisible();
});

it("renders Research Agent identity and external source citations", () => {
  renderConversation({
    initialMessages: [
      productAgentMessage({
        authorType: "research_agent",
        body: "The regulator published updated guidance.",
        proposedAction: null,
        webSources: [
          {
            title: "Updated guidance",
            url: "https://example.gov/guidance",
            publisher: "Example regulator",
            publishedAt: "2026-08-01",
          },
        ],
      }),
    ],
  });

  expect(screen.getByText("Research Agent")).toBeVisible();
  expect(screen.getByText("Sources")).toBeVisible();
  expect(screen.getByText("Updated guidance")).toBeVisible();
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
  const persisted: RoomMessage = {
    ...persistedMessage,
    clientId,
    body: draftBody,
  };
  const sendMessage = vi.fn().mockResolvedValue({
    message: persisted,
    agentTask: { status: "queued", taskId: "task-1" },
  });
  const { user } = renderConversation({
    workspaceId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  // The routing chip is always present; hydration of the restored draft still
  // needs to complete before the send button can submit it.
  await screen.findByTestId("agent-provider-picker");
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Message" }),
    ).toHaveTextContent(draftBody),
  );
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
    workspaceId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(NOT_READY),
  });

  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Message" }),
    ).toHaveTextContent(draftBody),
  );
  const routingChip = await screen.findByRole("button", {
    name: /Connect AI/,
  });
  await user.click(routingChip);
  await user.click(
    screen.getByRole("menuitem", { name: /Connect your AI/ }),
  );

  expect(sendMessage).not.toHaveBeenCalled();
  const expectedReturnTo = encodeURIComponent(
    `/${workspaceId}/rooms/${roomId}`,
  );
  expect(routerMocks.push).toHaveBeenCalledWith(
    `/${workspaceId}/settings/devices?returnTo=${expectedReturnTo}`,
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
  const persisted: RoomMessage = {
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
    workspaceId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  await screen.findByTestId("agent-provider-picker");
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Message" }),
    ).toHaveTextContent(draftBody),
  );
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
    kind: "room_reply",
    agentKind: "product",
    status: "running",
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:00:30.000Z",
    ...overrides,
  };
}

it("confirms PRD generation once, announces the queue, and navigates to its tab", async () => {
  let resolveGeneration: ((value: {
    status: "queued";
    taskId: string;
  }) => void) | undefined;
  const generatePrdAction = vi.fn(
    () =>
      new Promise<{ status: "queued"; taskId: string }>((resolve) => {
        resolveGeneration = resolve;
      }),
  );
  const onTaskQueued = vi.fn();
  const { user } = renderConversation({
    workspaceId,
    basePath: `/${workspaceId}/rooms/${roomId}`,
    initialMessages: [
      productAgentMessage({ proposedAction: { kind: "prd_generate" } }),
    ],
    generatePrdAction,
    onTaskQueued,
  });

  const generate = screen.getByRole("button", { name: "Generate PRD" });
  await user.dblClick(generate);
  expect(generatePrdAction).toHaveBeenCalledOnce();
  expect(generate).toBeDisabled();

  resolveGeneration?.({ status: "queued", taskId: "task-1" });
  await waitFor(() =>
    expect(onTaskQueued).toHaveBeenCalledWith({
      kind: "prd_generate",
      taskId: "task-1",
    }),
  );
  expect(routerMocks.push).toHaveBeenCalledWith(
    `/${workspaceId}/rooms/${roomId}?tab=prd`,
  );
});

it("offers Update PRD for a revise proposal and queues the revision", async () => {
  const revisePrdAction = vi.fn(
    async () => ({ status: "queued" as const, taskId: "revise-1" }),
  );
  const onTaskQueued = vi.fn();
  const { user } = renderConversation({
    workspaceId,
    basePath: `/${workspaceId}/rooms/${roomId}`,
    hasPrd: true,
    initialMessages: [
      productAgentMessage({ proposedAction: { kind: "prd_revise" } }),
    ],
    revisePrdAction,
    onTaskQueued,
  });

  const update = screen.getByRole("button", { name: "Update PRD" });
  await user.click(update);

  await waitFor(() =>
    expect(revisePrdAction).toHaveBeenCalledWith({
      roomId,
      sourceTaskId: "70000000-0000-4000-8000-000000000007",
    }),
  );
  await waitFor(() =>
    expect(onTaskQueued).toHaveBeenCalledWith({
      kind: "prd_revise",
      taskId: "revise-1",
    }),
  );
  expect(routerMocks.push).toHaveBeenCalledWith(
    `/${workspaceId}/rooms/${roomId}?tab=prd`,
  );
});

it("hides Generate PRD until the initial room task-status read settles", async () => {
  let resolveStatuses: ((statuses: RoomTaskStatus[]) => void) | undefined;
  const fetchTaskStatuses = vi.fn(
    () =>
      new Promise<RoomTaskStatus[]>((resolve) => {
        resolveStatuses = resolve;
      }),
  );
  render(
    <RoomTaskStatusProvider
      roomId={roomId}
      hasPrd={false}
      fetchTaskStatuses={fetchTaskStatuses}
    >
      <Conversation
        roomId={roomId}
        roomName="Customer interviews"
        currentUserId={currentUserId}
        currentUserName="Owner Example"
        initialMessages={[
          productAgentMessage({ proposedAction: { kind: "prd_generate" } }),
        ]}
        fetchReadiness={vi.fn().mockResolvedValue(NOT_READY)}
        fetchMessageAttachments={vi.fn().mockResolvedValue([])}
        subscribe={() => () => {}}
      />
    </RoomTaskStatusProvider>,
  );

  expect(screen.queryByRole("button", { name: "Generate PRD" })).toBeNull();
  resolveStatuses?.([]);
  expect(
    await screen.findByRole("button", { name: "Generate PRD" }),
  ).toBeVisible();
});

it("prevents overlapping generation from separate proposal messages", () => {
  const generatePrdAction = vi.fn(
    () => new Promise<{ status: "queued"; taskId: string }>(() => {}),
  );
  renderConversation({
    initialMessages: [
      productAgentMessage({
        id: "40000000-0000-4000-8000-000000000091",
        clientId: "70000000-0000-4000-8000-000000000091",
        proposedAction: { kind: "prd_generate" },
      }),
      productAgentMessage({
        id: "40000000-0000-4000-8000-000000000092",
        clientId: "70000000-0000-4000-8000-000000000092",
        proposedAction: { kind: "prd_generate" },
      }),
    ],
    generatePrdAction,
  });

  const controls = screen.getAllByRole("button", { name: "Generate PRD" });
  fireEvent.click(controls[0]);
  fireEvent.click(controls[1]);
  expect(generatePrdAction).toHaveBeenCalledOnce();
});

it("surfaces a PRD generation error and allows a retry", async () => {
  const generatePrdAction = vi.fn().mockResolvedValue({
    status: "error",
    message: "Could not start PRD generation.",
  });
  const { user } = renderConversation({
    initialMessages: [
      productAgentMessage({ proposedAction: { kind: "prd_generate" } }),
    ],
    generatePrdAction,
  });

  await user.click(screen.getByRole("button", { name: "Generate PRD" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not start PRD generation.",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Generate PRD" }),
    ).toBeEnabled(),
  );
});

it("dismisses the proposal and hides it when a PRD already exists", async () => {
  const message = productAgentMessage({
    proposedAction: { kind: "prd_generate" },
  });
  const { rerender, user } = renderConversation({ initialMessages: [message] });

  expect(
    screen.getByRole("button", { name: "Generate PRD" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Not yet" }));
  expect(screen.queryByRole("button", { name: "Generate PRD" })).toBeNull();

  rerender(
    <Conversation
      roomId={roomId}
      roomName="Customer interviews"
      currentUserId={currentUserId}
      currentUserName="Owner Example"
      initialMessages={[message]}
      hasPrd
      subscribe={() => () => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Generate PRD" })).toBeNull();
});

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

it("shows Research Agent in the pending state for a research task", async () => {
  const fetchTaskStatuses = vi.fn().mockResolvedValue([
    runningStatus({ agentKind: "research" }),
  ]);
  renderConversation({
    initialMessages: [
      humanMessage({
        id: SOURCE_MESSAGE_ID,
        clientId: SOURCE_CLIENT_ID,
        body: "Ask @Research Agent for the signal",
      }),
    ],
    fetchTaskStatuses,
  });

  const sourceMessage = await screen.findByTestId(
    `conversation-message-${SOURCE_CLIENT_ID}`,
  );
  expect(
    await within(sourceMessage).findByText(
      "Research Agent is responding via Codex",
    ),
  ).toBeVisible();
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
    // A tiny interval so the second (empty) poll lands promptly instead of
    // waiting out the 2s production cadence.
    taskPollIntervalMs: 10,
  });

  const sourceMessage = await screen.findByTestId(
    `conversation-message-${SOURCE_CLIENT_ID}`,
  );
  await within(sourceMessage).findByTestId("agent-task-state");
  // The next poll returns nothing (e.g. access revoked or the task settled and
  // its reply arrived over Realtime): the pending affordance is removed.
  await waitFor(() =>
    expect(
      within(sourceMessage).queryByTestId("agent-task-state"),
    ).not.toBeInTheDocument(),
  );
});

it("tags the Product Agent when a follow-up question is chosen", async () => {
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

  // Tapping a follow-up question auto-mentions the Product Agent so the user
  // never has to tag it by hand -- the composer body carries both.
  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("@Product Agent What erodes onboarding trust?");
});

it("routes a connection blocker to AI setup with a validated returnTo", async () => {
  const fetchTaskStatuses = vi
    .fn()
    .mockResolvedValue([runningStatus({ status: "needs_reauthentication" })]);
  const { user } = renderConversation({
    workspaceId,
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
  await user.click(
    await within(sourceMessage).findByRole("button", {
      name: "Fix connection",
    }),
  );

  const expectedReturnTo = encodeURIComponent(
    `/${workspaceId}/rooms/${roomId}`,
  );
  expect(routerMocks.push).toHaveBeenCalledWith(
    `/${workspaceId}/settings/devices?returnTo=${expectedReturnTo}`,
  );
});

it("asks the Product Agent again with a semantic mention when a reply failed, without navigating", async () => {
  const fetchTaskStatuses = vi
    .fn()
    .mockResolvedValue([runningStatus({ status: "failed" })]);
  const { user } = renderConversation({
    workspaceId,
    initialMessages: [
      humanMessage({
        id: SOURCE_MESSAGE_ID,
        clientId: SOURCE_CLIENT_ID,
        body: "Ask @Product Agent for the signal",
      }),
    ],
    fetchTaskStatuses,
    // Ready so a re-derived product mention would surface the per-task picker,
    // proving the refill is a real semantic mention, not a bare substring.
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  const sourceMessage = await screen.findByTestId(
    `conversation-message-${SOURCE_CLIENT_ID}`,
  );
  await user.click(
    await within(sourceMessage).findByRole("button", { name: "Ask again" }),
  );

  expect(
    screen.getByRole("combobox", { name: "Message" }),
  ).toHaveTextContent("Ask @Product Agent for the signal");
  // A failed reply is not a device problem: it must not route to settings.
  expect(routerMocks.push).not.toHaveBeenCalled();
  // The refilled prompt is a real @Product Agent mention: the per-task provider
  // picker only appears when the mention is semantically derived.
  await screen.findByTestId("agent-provider-picker");
});

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
    workspaceId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Message" }),
    ).toHaveTextContent("Ask @Product Agent to review"),
  );
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: ["a0000000-0000-4000-8000-000000000009"],
      }),
    ),
  );
});

it("does not resend a restored draft's attachment ids on a second send", async () => {
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
    workspaceId,
    sendMessage,
    fetchReadiness: vi.fn().mockResolvedValue(readyReadiness()),
  });

  // First send: includes the restored draft's attachment ids
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Message" }),
    ).toHaveTextContent("Ask @Product Agent to review"),
  );
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: ["a0000000-0000-4000-8000-000000000009"],
      }),
    ),
  );

  // Type a new message
  await user.type(
    screen.getByRole("combobox", { name: "Message" }),
    "Follow up question",
  );

  // Second send: should NOT include the consumed draft attachment ids
  await user.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const secondCall = sendMessage.mock.calls[1][0];
    expect(secondCall.attachmentIds).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// PRD context in Conversation
// -----------------------------------------------------------------------------

const prdId = "80000000-0000-4000-8000-000000000001";
const assistRequestId = "90000000-0000-4000-8000-000000000001";
const proposalId = "90000000-0000-4000-8000-000000000002";
const basePath = `/${workspaceId}/rooms/${roomId}`;

const EXECUTIVE_SUMMARY: RoomPrdContextSection = {
  field: "executiveSummary",
  label: "Executive summary",
  quotedText: "Guide new teams to their first shared decision.",
};
const MVP_SCOPE: RoomPrdContextSection = {
  field: "mvpScope",
  label: "MVP scope",
  quotedText: "One shared room, one PRD.",
};
const RISKS: RoomPrdContextSection = {
  field: "risksAndMitigations",
  label: "Risks & mitigations",
  quotedText: "Teams may abandon the room after the first session.",
};

function prdContext(
  overrides: Partial<RoomPrdContext> = {},
): RoomPrdContext {
  return {
    prdId,
    version: 4,
    sections: [EXECUTIVE_SUMMARY],
    assistRequestId,
    proposalId: null,
    ...overrides,
  };
}

function contextualQuestion(
  overrides: Partial<RoomMessage> = {},
): RoomMessage {
  return humanMessage({
    id: "40000000-0000-4000-8000-000000000040",
    clientId: "30000000-0000-4000-8000-000000000040",
    authorId: teammateId,
    body: "Why did we choose this?",
    kind: "prd_context",
    prdContext: prdContext(),
    createdAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  });
}

function contextualAnswer(
  overrides: Partial<RoomMessage> = {},
): RoomMessage {
  return productAgentMessage({
    id: "40000000-0000-4000-8000-000000000041",
    clientId: "30000000-0000-4000-8000-000000000041",
    initiatedBy: teammateId,
    provider: "codex",
    body: "We chose it because shoppers asked for it.",
    kind: "prd_context",
    prdContext: prdContext(),
    createdAt: "2026-08-08T12:00:01.000Z",
    ...overrides,
  });
}

function appliedChange(
  overrides: Partial<RoomMessage> = {},
): RoomMessage {
  return humanMessage({
    id: "40000000-0000-4000-8000-000000000042",
    clientId: "30000000-0000-4000-8000-000000000042",
    authorId: teammateId,
    body: "Applied a Product Agent edit to Executive summary.",
    kind: "prd_change",
    prdContext: prdContext({ version: 5, proposalId }),
    prdChange: {
      instruction: "Rewrite this for small teams.",
      previousValue: "Guide new teams to their first shared decision.",
      proposedValue: "Guide small teams to their first shared decision.",
    },
    createdAt: "2026-08-08T12:05:00.000Z",
    ...overrides,
  });
}

function renderRoom(messages: RoomMessage[], props: Partial<ConversationProps> = {}) {
  return renderConversation({
    workspaceId,
    basePath,
    initialMessages: messages,
    ...props,
  });
}

it("shows frozen PRD context once and labels only the human question", () => {
  renderRoom([contextualQuestion(), contextualAnswer()]);

  const question = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000040",
  );
  const answer = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000041",
  );

  const context = within(question).getByTestId("prd-context");
  expect(within(context).getByText("Selected from")).toBeVisible();
  expect(within(context).getByText("PRD")).toBeVisible();
  expect(
    within(context).getByRole("link", { name: "Executive summary" }),
  ).toBeVisible();
  expect(within(context).getByText("v4")).toBeVisible();
  expect(
    within(context).getByText(
      "“Guide new teams to their first shared decision.”",
    ),
  ).toBeVisible();
  expect(within(context).getByTestId("prd-context-excerpt")).toHaveStyle({
    backgroundColor: "var(--color-background-muted)",
    borderInlineStartColor: "var(--color-accent)",
  });

  expect(within(answer).queryByTestId("prd-context")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("prd-context")).toHaveLength(1);
  expect(within(question).getByText("Question")).toBeVisible();
  expect(within(answer).queryByText("Answer")).not.toBeInTheDocument();
});

it("keeps the provider and Asked by provenance on a contextual answer", () => {
  renderRoom([contextualQuestion(), contextualAnswer()]);

  const answer = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000041",
  );
  expect(within(answer).getByText("Product Agent")).toBeVisible();
  expect(within(answer).getByText("via Codex")).toBeVisible();
  expect(within(answer).getByText("Asked by maya@example.com")).toBeVisible();
  expect(
    within(answer).getByText("We chose it because shoppers asked for it."),
  ).toBeVisible();
});

it("links a single-section context to that section's PRD anchor", () => {
  renderRoom([contextualQuestion()]);

  expect(
    within(screen.getByTestId("prd-context")).getByRole("link", {
      name: "Executive summary",
    }),
  ).toHaveAttribute("href", `${basePath}?tab=prd#executive-summary`);
});

it("orders a multi-section context by the rendered document order, one link each", async () => {
  // Handed to the component out of order on purpose: PRD_SECTION_ORDER is the
  // single ordering authority, and mvpScope precedes risksAndMitigations there
  // even though PRDDocumentSchema declares them the other way round.
  const { user } = renderRoom([
    contextualQuestion({
      prdContext: prdContext({
        sections: [RISKS, EXECUTIVE_SUMMARY, MVP_SCOPE],
      }),
    }),
  ]);

  const context = screen.getByTestId("prd-context");
  expect(within(context).getByText("3 selected sections")).toBeVisible();
  expect(within(context).getByText("v4")).toBeVisible();

  const links = within(context).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual([
    "Executive summary",
    "MVP scope",
    "Risks & mitigations",
  ]);
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    `${basePath}?tab=prd#executive-summary`,
    `${basePath}?tab=prd#mvp-scope`,
    `${basePath}?tab=prd#risks`,
  ]);

  const disclosure = within(context).getByRole("button", {
    name: "Show full selection",
  });
  expect(disclosure).toHaveAttribute("aria-expanded", "false");
  expect(
    within(context).getByTestId("prd-context-disclosure"),
  ).toHaveAttribute("data-direction", "horizontal");
  expect(disclosure).toHaveStyle({
    minHeight: "var(--spacing-0)",
    padding: "var(--spacing-0)",
  });
  expect(
    within(disclosure).getByText("Show full selection"),
  ).toHaveAttribute("data-type", "supporting");
  expect(
    within(disclosure).getByText("Show full selection"),
  ).toHaveAttribute("data-color", "secondary");
  const preview = within(context)
    .getAllByText(`“${EXECUTIVE_SUMMARY.quotedText}”`)
    .find(
      (excerpt) =>
        excerpt.style.getPropertyValue("-webkit-line-clamp") === "2",
    );
  expect(preview).toBeVisible();
  await user.click(disclosure);
  expect(disclosure).toHaveAttribute("aria-expanded", "true");
  expect(disclosure).toHaveAccessibleName("Show less");
  const expandedSelection = within(context).getByRole("region", {
    name: "Full selected text",
  });
  expect(expandedSelection.nextElementSibling).toBe(
    within(context).getByTestId("prd-context-disclosure"),
  );

  for (const section of [EXECUTIVE_SUMMARY, MVP_SCOPE, RISKS]) {
    expect(
      within(context).getByText(`“${section.quotedText}”`),
    ).toBeVisible();
  }
});

it("keeps an earlier question's frozen quote and version when a newer PRD change arrives", async () => {
  let deliver: ((message: RoomMessage) => void) | undefined;
  renderRoom([contextualQuestion(), contextualAnswer()], {
    subscribe: (onMessage) => {
      deliver = onMessage;
      return () => {};
    },
  });

  deliver?.(appliedChange());

  await screen.findByTestId("prd-change-event");
  const question = screen.getByTestId(
    "conversation-message-30000000-0000-4000-8000-000000000040",
  );
  const context = within(question).getByTestId("prd-context");
  expect(within(context).getByText("v4")).toBeVisible();
  expect(
    within(context).getByText(
      "“Guide new teams to their first shared decision.”",
    ),
  ).toBeVisible();
  // The applied change moved the PRD to v5; the question still reads v4.
  expect(
    within(screen.getByTestId("prd-change-event")).getByText("v5"),
  ).toBeVisible();
});

it("renders a PRD context message delivered over Realtime with its frozen context", async () => {
  let deliver: ((message: RoomMessage) => void) | undefined;
  renderRoom([], {
    subscribe: (onMessage) => {
      deliver = onMessage;
      return () => {};
    },
  });

  deliver?.(contextualAnswer());

  const context = await screen.findByTestId("prd-context");
  expect(
    within(context).getByRole("link", { name: "Executive summary" }),
  ).toHaveAttribute("href", `${basePath}?tab=prd#executive-summary`);
  expect(within(context).getByText("v4")).toBeVisible();
  expect(
    within(context).getByText(
      "“Guide new teams to their first shared decision.”",
    ),
  ).toBeVisible();
});

it("renders an applied change once, as an event with its instruction and diff", async () => {
  const { user } = renderRoom([contextualQuestion(), appliedChange()]);

  const events = screen.getAllByTestId("prd-change-event");
  expect(events).toHaveLength(1);
  const event = events[0];
  expect(event.style.marginInlineStart).toBe("var(--spacing-8)");
  expect(
    within(event).getByText("Applied a Product Agent edit to Executive summary."),
  ).toBeVisible();
  // Not a Product Agent chat bubble: no avatar, no author line, no provider.
  expect(
    screen.queryByTestId(
      "conversation-message-30000000-0000-4000-8000-000000000042",
    ),
  ).not.toBeInTheDocument();
  expect(within(event).queryByText("Product Agent")).not.toBeInTheDocument();
  expect(within(event).queryByText("via Codex")).not.toBeInTheDocument();

  const disclosure = within(event).getByRole("button", {
    name: "Instruction and change",
  });
  expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await user.click(disclosure);
  expect(disclosure).toHaveAttribute("aria-expanded", "true");

  expect(
    within(event).getByText("“Rewrite this for small teams.”"),
  ).toBeVisible();
  expect(
    within(event).getByText("Guide new teams to their first shared decision."),
  ).toBeVisible();
  expect(
    within(event).getByText("Guide small teams to their first shared decision."),
  ).toBeVisible();
});

it("re-reads the room once when an applied change arrives without its proposal", async () => {
  // A Realtime INSERT is the bare row, so it carries no embedded proposal and
  // the instruction/diff would be missing. One re-read resolves it.
  const bare = appliedChange({ prdChange: null });
  const fetchMessages = vi.fn().mockResolvedValue([appliedChange()]);
  let deliver: ((message: RoomMessage) => void) | undefined;
  renderRoom([], {
    fetchMessages,
    subscribe: (onMessage) => {
      deliver = onMessage;
      return () => {};
    },
  });

  deliver?.(bare);

  const event = await screen.findByTestId("prd-change-event");
  await waitFor(() => expect(fetchMessages).toHaveBeenCalledWith(roomId));
  expect(
    await within(event).findByRole("button", {
      name: "Instruction and change",
    }),
  ).toBeVisible();
});

it("leaves an ordinary conversation message untouched", () => {
  renderRoom([
    humanMessage({ body: "The interviews point to a trust problem." }),
    productAgentMessage({ body: "I grouped the strongest signals." }),
  ]);

  expect(screen.queryByTestId("prd-context")).not.toBeInTheDocument();
  expect(screen.queryByTestId("prd-change-event")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(
    screen.getByText("The interviews point to a trust problem."),
  ).toBeVisible();
  const agent = screen.getByTestId(
    "conversation-message-70000000-0000-4000-8000-000000000099",
  );
  expect(within(agent).getByText("Product Agent")).toBeVisible();
  expect(within(agent).getByText("via Codex")).toBeVisible();
});

it("anchors every message so a PRD answer can deep-link to it", () => {
  renderRoom([contextualQuestion(), contextualAnswer()]);

  expect(
    screen.getByTestId(
      "conversation-message-30000000-0000-4000-8000-000000000041",
    ),
  ).toHaveAttribute("id", "message-40000000-0000-4000-8000-000000000041");
});

// `prd_proposals.quoted_text` is nullable and `apply_prd_proposal` copies it
// straight into the message's frozen context, so this row is legal and must
// still say which section changed, at which version, and what the change was.
it("renders an applied change whose frozen quote was never recorded", async () => {
  const { user } = renderRoom([
    appliedChange({
      prdContext: prdContext({
        version: 5,
        proposalId,
        sections: [{ ...EXECUTIVE_SUMMARY, quotedText: "" }],
      }),
    }),
  ]);

  const event = screen.getByTestId("prd-change-event");
  const context = within(event).getByTestId("prd-context");
  expect(
    within(context).getByRole("link", { name: "Executive summary" }),
  ).toBeVisible();
  expect(within(context).getByText("v5")).toBeVisible();
  // No quote was recorded, so no empty pair of quote marks is invented.
  expect(within(context).queryByText("“”")).not.toBeInTheDocument();

  await user.click(
    within(event).getByRole("button", { name: "Instruction and change" }),
  );
  expect(
    within(event).getByText("“Rewrite this for small teams.”"),
  ).toBeVisible();
});

it("keeps the instruction and diff when the frozen context is unreadable", () => {
  renderRoom([appliedChange({ prdContext: null })]);

  const event = screen.getByTestId("prd-change-event");
  expect(within(event).queryByTestId("prd-context")).not.toBeInTheDocument();
  expect(
    within(event).getByRole("button", { name: "Instruction and change" }),
  ).toBeVisible();
});

it("expands a clamped multi-section preview and leaves short selections open", async () => {
  const { user } = renderRoom([
    contextualQuestion({
      prdContext: prdContext({
        sections: [EXECUTIVE_SUMMARY, MVP_SCOPE, RISKS],
      }),
    }),
    contextualAnswer({
      clientId: "30000000-0000-4000-8000-000000000051",
      id: "40000000-0000-4000-8000-000000000051",
      prdContext: prdContext({
        assistRequestId: "90000000-0000-4000-8000-000000000051",
      }),
    }),
  ]);

  const [multi, single] = screen.getAllByTestId("prd-context");

  // A short single-section selection is already the whole useful excerpt, so
  // it stays visible without a redundant disclosure.
  const singleExcerpt = within(single).getByText(
    `“${EXECUTIVE_SUMMARY.quotedText}”`,
  );
  expect(singleExcerpt.style.getPropertyValue("-webkit-line-clamp")).toBe("");
  expect(within(single).queryByRole("button")).not.toBeInTheDocument();

  const multiPreview = within(multi)
    .getAllByText(`“${EXECUTIVE_SUMMARY.quotedText}”`)
    .find(
      (excerpt) =>
        excerpt.style.getPropertyValue("-webkit-line-clamp") === "2",
    );
  expect(multiPreview).toBeVisible();

  // The disclosure exists to show the frozen excerpts. Clipping them there
  // would leave Conversation with no record of what text was discussed.
  await user.click(
    within(multi).getByRole("button", { name: "Show full selection" }),
  );
  for (const section of [EXECUTIVE_SUMMARY, MVP_SCOPE, RISKS]) {
    const excerpt = within(multi).getByText(`“${section.quotedText}”`);
    expect(excerpt.style.getPropertyValue("-webkit-line-clamp")).toBe("");
  }
});
