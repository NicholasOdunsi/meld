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

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

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
    screen.getByRole("textbox", { name: "Message" }),
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
    screen.getByRole("textbox", { name: "Message" }),
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

it("shows Product Agent but keeps it disabled with the exact Task 10 explanation", () => {
  render(
    <Conversation
      roomId={roomId}
      roomName="Customer interviews"
      currentUserId={currentUserId}
      currentUserName="Owner Example"
      initialMessages={[]}
      sendMessage={vi.fn()}
      subscribe={() => () => {}}
    />,
  );

  expect(
    screen.getByRole("button", { name: "@Product Agent" }),
  ).toBeDisabled();
  expect(
    screen.getByText("Connect personal AI to use the Product Agent"),
  ).toBeVisible();
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
      "Share observations, customer evidence, and questions with your team. Mention a connected agent to synthesize the discussion and suggest next steps.",
    ),
  ).toBeVisible();
  expect(screen.getByTestId("discovery-chat-composer")).toHaveStyle({
    "--color-background-popover":
      "var(--color-background-surface)",
  });
  expect(
    screen.getByText("Ask a question or share a discovery note"),
  ).toBeVisible();
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
