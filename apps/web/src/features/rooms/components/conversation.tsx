"use client";

import {
  ChatLayout,
  ChatMessage,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Citation } from "@astryxdesign/core/Citation";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AgentKind,
  Provider,
  RoomProposedAction,
} from "@meld/contracts";
import { createClient } from "@/lib/supabase/client";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { AgentTaskState } from "@/features/ai/components/agent-task-state";
import {
  RoomTaskStatusPoller,
  type RoomTaskStatus,
} from "@/features/ai/room-task-status";
import {
  generatePrd,
  revisePrd,
  type GeneratePrdResult,
} from "@/features/prd/actions";
import {
  useRoomTaskStatus,
  type RoomTaskQueueNotice,
} from "@/features/prd/components/room-task-status-provider";
import {
  cancelRoomReplyTask,
  discardStagedRoomAttachment,
  getAgentReadiness,
  listRoomMessageAttachments,
  listRoomMessages,
  listRoomTaskStatuses,
  postMessage,
  stageRoomAttachment,
  type PostMessageResult,
} from "../actions";
import type { RoomAttachmentView } from "../attachment-types";
import {
  mapRoomMessageRow,
  type RoomMessage,
  type RoomMessageRow,
} from "../repository";
import {
  acceptProposedUserFlow,
  captureProposedDecision,
  dismissMessageProposal,
  listRoomProposalResponses,
  type ProposalResponse,
} from "../proposals";
import type { MessageInput } from "../schemas";
import { RoomComposer } from "./composer";
import { RoomProposalAction } from "./room-proposal-action";
import {
  buildRoomReturnPath,
  parseRoomDraft,
  roomDraftStorageKey,
  serializeRoomDraft,
  type RoomComposerSubmission,
  type RoomMentionOption,
  type QueuedRoomAttachment,
  type RoomDraft,
} from "./composer-model";
import { AgentMarker, DISCOVERY_AGENTS } from "./agent-marker";
import { buildMentionInlinePlugins } from "./mention-highlight";
import { MessageAttachments } from "./message-attachments";
import { PrdChangeEvent } from "./prd-change-event";
import { PrdContextRow } from "./prd-context-row";
import { formatProductRole } from "@/features/workspaces/product-roles";
import { actionErrorMessage } from "@/ui/action-error";

export type RoomSubscription = (
  onMessage: (message: RoomMessage) => void,
  onRoomDeleted: () => void,
) => () => void;

const ATTACHMENT_RESOLVE_ATTEMPTS = 3;
const ATTACHMENT_RESOLVE_RETRY_MS = 250;
const PROPOSAL_ERROR = "We could not answer that suggestion.";

// Whether a proposal is still worth offering. The PRD proposals answer a
// question the Room may have already settled -- a PRD exists, or one is being
// written right now -- while a Decision or a user flow stands on its own until
// the participant answers it.
function isProposalOffered({
  action,
  aiTaskId,
  hasPrd,
  isPrdTaskSettled,
}: {
  action: RoomProposedAction;
  aiTaskId: string | null;
  hasPrd: boolean;
  isPrdTaskSettled: boolean;
}) {
  switch (action.kind) {
    case "prd_generate":
      return !hasPrd && isPrdTaskSettled;
    case "prd_revise":
      return hasPrd && aiTaskId !== null && isPrdTaskSettled;
    default:
      return true;
  }
}

type RoomParticipant = {
  userId: string;
  email: string;
  access?: "view" | "edit";
  role?: "admin" | "member";
  productRole?: string | null;
};

const NO_PARTICIPANTS: RoomParticipant[] = [];

// The role shown as a human's mention subtext, most specific first: their
// product role ("Product designer") if set, else their org role (Admin /
// Member), falling back to room access when no workspace role is known.
function humanRoleLabel(participant: RoomParticipant) {
  const productRole = formatProductRole(participant.productRole);
  if (productRole) return productRole;
  if (participant.role === "admin") return "Admin";
  if (participant.role === "member") return "Member";
  if (participant.access === "edit") return "Can edit";
  if (participant.access === "view") return "Can view";
  return "Room teammate";
}

function readRoomDraft(roomId: string): RoomDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return parseRoomDraft(
      window.sessionStorage.getItem(roomDraftStorageKey(roomId)),
    );
  } catch {
    return null;
  }
}

function writeRoomDraft(roomId: string, draft: RoomDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      roomDraftStorageKey(roomId),
      serializeRoomDraft(draft),
    );
  } catch {
    // A storage write that fails (quota, private mode) simply means the draft
    // is not preserved across the setup detour; the room still functions.
  }
}

function clearRoomDraft(roomId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(roomDraftStorageKey(roomId));
  } catch {
    // Ignore: a failed clear at worst leaves a stale draft to be overwritten.
  }
}

function formatMessageTime(message: RoomMessage) {
  if (message.delivery === "sending") return "Sending";
  if (message.delivery === "failed") return "Failed to send";
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
  }).format(new Date(message.createdAt));
}

function messageDayKey(message: RoomMessage) {
  const date = new Date(message.createdAt);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMessageDay(message: RoomMessage) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
  }).format(new Date(message.createdAt));
}

const PRODUCT_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "product")?.name ??
  "Product Agent";
const RESEARCH_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "research")?.name ??
  "Research Agent";

const PROVIDER_LABEL: Record<Provider, string> = {
  codex: "Codex",
  claude: "Claude",
};

// A message renders as the Product Agent purely from its provenance
// (author_type = 'product_agent'), never from a denormalized name, so it stays
// the Product Agent even when another participant initiated the reply.
function messageAgentKind(message: RoomMessage) {
  if (message.authorType === "product_agent") return "product" as const;
  if (message.authorType === "research_agent") return "research" as const;
  return null;
}

function resolveHumanName({
  userId,
  currentUserId,
  currentUserName,
  participantNames,
}: {
  userId: string | null;
  currentUserId: string;
  currentUserName: string;
  participantNames: Map<string, string>;
}) {
  if (!userId) return "Unknown member";
  if (userId === currentUserId) return currentUserName;
  return participantNames.get(userId) ?? "Unknown member";
}

function resolveAuthorName({
  message,
  currentUserId,
  currentUserName,
  participantNames,
}: {
  message: RoomMessage;
  currentUserId: string;
  currentUserName: string;
  participantNames: Map<string, string>;
}) {
  if (message.authorType === "product_agent") return PRODUCT_AGENT_NAME;
  if (message.authorType === "research_agent") return RESEARCH_AGENT_NAME;
  return resolveHumanName({
    userId: message.authorId,
    currentUserId,
    currentUserName,
    participantNames,
  });
}

// The Product Agent reply's shared content: the answer, its assumptions as a
// compact labelled list, its citations as room-local source actions, and its
// suggested questions as composer-fill actions.
function AgentContent({
  message,
  inlinePlugins,
  onFillQuestion,
  proposalControl,
}: {
  message: RoomMessage;
  inlinePlugins: ReturnType<typeof buildMentionInlinePlugins>;
  onFillQuestion: (question: string) => void;
  proposalControl: ReactNode;
}) {
  return (
    <VStack gap={1} width="100%">
      <Markdown
        density="compact"
        autolink="gfm"
        inlinePlugins={inlinePlugins}
        contentWidth="100%"
      >
        {message.body}
      </Markdown>

      {message.assumptions.length > 0 ? (
        <List
          density="compact"
          header={<Text type="label">Assumptions</Text>}
          data-testid="agent-assumptions"
        >
          {message.assumptions.map((assumption, index) => (
            <ListItem key={`assumption-${index}`} label={assumption} />
          ))}
        </List>
      ) : null}

      {(message.webSources?.length ?? 0) > 0 ? (
        <VStack gap={1} width="100%">
          <Text type="label">Sources</Text>
          <HStack gap={1} wrap="wrap">
            {message.webSources?.map((source, index) => (
              <Citation
                key={`${source.url}-${index}`}
                source={{ title: source.title, url: source.url }}
                number={index + 1}
                variant="label"
              />
            ))}
          </HStack>
        </VStack>
      ) : null}

      {message.suggestedNextQuestions.length > 0 ? (
        <List
          density="compact"
          listStyle="disc"
          header={<Text type="label">Follow-up questions</Text>}
          data-testid="agent-suggested-questions"
        >
          {message.suggestedNextQuestions.map((question, index) => (
            <ListItem
              key={`question-${index}`}
              label={question}
              onClick={() => onFillQuestion(question)}
            />
          ))}
        </List>
      ) : null}

      {proposalControl}
    </VStack>
  );
}

function reconcileMessage(
  messages: RoomMessage[],
  incoming: RoomMessage,
) {
  const existing = messages.find(
    (message) =>
      message.clientId === incoming.clientId ||
      message.id === incoming.id,
  );
  // A Realtime INSERT echo carries no attachments -- files link to the message
  // over a separate write that lands after the insert, so the raw row never
  // includes them. Keep the attachments we already resolved locally (the
  // sender's uploaded views, or the read path's signed views) rather than
  // letting the echo blank them and make the image disappear.
  const resolved =
    incoming.attachments.length === 0 &&
    existing &&
    existing.attachments.length > 0
      ? { ...incoming, attachments: existing.attachments }
      : incoming;
  const withoutDuplicate = messages.filter(
    (message) =>
      message.clientId !== incoming.clientId &&
      message.id !== incoming.id,
  );
  return [...withoutDuplicate, resolved].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function subscribeToProductionRoom(
  roomId: string,
  onMessage: (message: RoomMessage) => void,
  onRoomDeleted: () => void,
) {
  const supabase = createClient();
  const channel = supabase
    .channel(`room:${roomId}`, { config: { private: true } })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${roomId}`,
      },
      (event) => {
        // The raw INSERT row is shaped differently from a query row, so it goes
        // through the same shared mapper the initial query uses -- this is what
        // carries the full Product Agent provenance (provider, initiator, and
        // the citation/assumption/suggested-question arrays) over Realtime, and
        // makes the persisted message the authority for the completed reply.
        onMessage(
          mapRoomMessageRow(event.new as RoomMessageRow),
        );
      },
    )
    .on(
      "broadcast",
      { event: "room-deleted" },
      () => {
        onRoomDeleted();
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

function subscribeToDevelopmentRoom(
  roomId: string,
  onMessage: (message: RoomMessage) => void,
  onRoomDeleted: () => void,
) {
  let active = true;
  const poll = async () => {
    try {
      const messages = await listRoomMessages(roomId);
      if (active) messages.forEach(onMessage);
    } catch {
      if (active) onRoomDeleted();
      return;
    }
    if (active) window.setTimeout(poll, 200);
  };
  void poll();
  return () => {
    active = false;
  };
}

export function Conversation({
  roomId,
  roomName,
  workspaceId,
  currentUserId,
  currentUserName,
  participants = NO_PARTICIPANTS,
  initialMessages,
  realtimeMode = "production",
  sendMessage = postMessage,
  stageAttachment = stageRoomAttachment,
  discardAttachment = discardStagedRoomAttachment,
  fetchReadiness = getAgentReadiness,
  fetchTaskStatuses = listRoomTaskStatuses,
  fetchMessageAttachments = listRoomMessageAttachments,
  fetchMessages = listRoomMessages,
  cancelTask = cancelRoomReplyTask,
  generatePrdAction = generatePrd,
  revisePrdAction = revisePrd,
  fetchProposalResponses = listRoomProposalResponses,
  dismissProposal = dismissMessageProposal,
  captureDecision = captureProposedDecision,
  acceptUserFlow = acceptProposedUserFlow,
  onTaskQueued,
  hasPrd = false,
  basePath,
  emptyStateActions,
  focusedMessageId,
  taskPollIntervalMs,
  subscribe,
}: {
  roomId: string;
  roomName: string;
  workspaceId?: string;
  currentUserId: string;
  currentUserName: string;
  participants?: RoomParticipant[];
  initialMessages: RoomMessage[];
  realtimeMode?: "production" | "development-poll";
  sendMessage?: (input: MessageInput) => Promise<PostMessageResult>;
  stageAttachment?: typeof stageRoomAttachment;
  discardAttachment?: typeof discardStagedRoomAttachment;
  fetchReadiness?: () => Promise<AgentReadiness>;
  fetchTaskStatuses?: (roomId: string) => Promise<RoomTaskStatus[]>;
  fetchMessageAttachments?: (
    roomId: string,
    messageId: string,
  ) => Promise<RoomAttachmentView[]>;
  fetchMessages?: (roomId: string) => Promise<RoomMessage[]>;
  cancelTask?: (taskId: string) => Promise<unknown>;
  generatePrdAction?: (input: {
    roomId: string;
    provider?: Provider;
  }) => Promise<GeneratePrdResult>;
  revisePrdAction?: (input: {
    roomId: string;
    sourceTaskId: string;
    provider?: Provider;
  }) => Promise<GeneratePrdResult>;
  fetchProposalResponses?: (
    roomId: string,
  ) => Promise<Record<string, ProposalResponse>>;
  dismissProposal?: (messageId: string) => Promise<ProposalResponse>;
  captureDecision?: (messageId: string) => Promise<unknown>;
  acceptUserFlow?: (messageId: string) => Promise<unknown>;
  onTaskQueued?: (notice?: RoomTaskQueueNotice) => void;
  hasPrd?: boolean;
  basePath?: string;
  emptyStateActions?: ReactNode;
  focusedMessageId?: string;
  // Poll cadence for the task-status projection. Defaults to the poller's 2s
  // production interval; overridable so tests can drive it fast.
  taskPollIntervalMs?: number;
  subscribe?: RoomSubscription;
}) {
  const router = useRouter();
  const roomTaskStatus = useRoomTaskStatus();
  const hasRoomTaskStatusProvider = roomTaskStatus !== null;
  const [messages, setMessages] = useState(initialMessages);
  const focusedMessageIdRef = useRef<string | null>(null);
  // Server HTML and the first client render both start empty. The room-scoped
  // sessionStorage draft is applied after hydration as one coherent handoff.
  const [restoredDraft, setRestoredDraft] = useState<RoomDraft | null>(null);
  // Restored-draft attachment ids are re-linked exactly once, on the first send
  // after returning from AI setup. Fresh composer attachments are additive.
  const draftAttachmentIdsRef = useRef<string[]>(
    [],
  );
  // Starts empty so the server-rendered HTML and the first client render match
  // (sessionStorage is client-only); the restored draft body is applied in a
  // mount effect below, avoiding a hydration mismatch on the composer.
  const [value, setValue] = useState("");
  const [readiness, setReadiness] = useState<AgentReadiness>();
  const [error, setError] = useState<string>();
  const [answeringProposalId, setAnsweringProposalId] =
    useState<string | null>(null);
  // Every proposal this participant has already answered, whether in this
  // session or a previous one. Read once from the durable per-user responses
  // so a dismissal survives a reload instead of coming back on every visit.
  const [proposalResponses, setProposalResponses] = useState<
    Map<string, ProposalResponse>
  >(new Map());
  const pendingProposalIdsRef = useRef(new Set<string>());
  const canEditRoom = participants.some(
    (participant) =>
      participant.userId === currentUserId &&
      participant.access === "edit",
  );
  const participantNames = new Map(
    participants.map((participant) => [
      participant.userId,
      participant.email,
    ]),
  );
  const mentionOptions = useMemo<RoomMentionOption[]>(
    () => [
      ...participants.map((participant) => ({
        id: `human:${participant.userId}`,
        userId: participant.userId,
        label: participant.email,
        handle: participant.email,
        kind: "human" as const,
        description: humanRoleLabel(participant),
      })),
      ...DISCOVERY_AGENTS.map((agent) => ({
        id: agent.id,
        label: agent.name,
        handle:
          agent.kind === "product"
            ? "product-agent"
            : "research-agent",
        kind: agent.kind,
        description: agent.description,
      })),
    ],
    [participants],
  );
  const mentionInlinePlugins = useMemo(
    () => buildMentionInlinePlugins(mentionOptions),
    [mentionOptions],
  );
  const persistedMessagesByClientId = useRef(
    new Map<string, RoomMessage>(
      initialMessages
        .filter((message) => message.delivery === "persisted")
        .map((message) => [message.clientId, message]),
    ),
  );
  const reconcile = useCallback((message: RoomMessage) => {
    if (message.delivery === "persisted") {
      persistedMessagesByClientId.current.set(
        message.clientId,
        message,
      );
    }
    setMessages((current) => reconcileMessage(current, message));
  }, []);

  useEffect(() => {
    if (
      !focusedMessageId ||
      focusedMessageIdRef.current === focusedMessageId ||
      !messages.some(
        (message) =>
          message.id === focusedMessageId &&
          message.delivery === "persisted",
      )
    ) {
      return;
    }

    let resetFocusStyle: ((restorePriorFocus: boolean) => void) | undefined;
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(
        `message-${focusedMessageId}`,
      );
      if (!target) return;
      focusedMessageIdRef.current = focusedMessageId;
      const previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const originalTabIndex = target.getAttribute("tabindex");
      const originalOutline = target.style.outline;
      const originalOutlineOffset = target.style.outlineOffset;
      let hasReset = false;
      target.tabIndex = -1;
      target.style.outline =
        "var(--border-width) solid var(--color-border-blue)";
      target.style.outlineOffset = "var(--spacing-0-5)";
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      target.focus({ preventScroll: true });
      const handleBlur = () => {
        if (timer !== undefined) window.clearTimeout(timer);
        resetFocusStyle?.(false);
      };
      resetFocusStyle = (restorePriorFocus) => {
        if (hasReset) return;
        hasReset = true;
        target.removeEventListener("blur", handleBlur);
        if (originalTabIndex === null) {
          target.removeAttribute("tabindex");
        } else {
          target.setAttribute("tabindex", originalTabIndex);
        }
        target.style.outline = originalOutline;
        target.style.outlineOffset = originalOutlineOffset;
        if (restorePriorFocus && document.activeElement === target) {
          if (
            previousFocus &&
            previousFocus !== target &&
            previousFocus !== document.body &&
            previousFocus.isConnected
          ) {
            previousFocus.focus({ preventScroll: true });
          }
          if (document.activeElement === target) target.blur();
        }
      };
      target.addEventListener("blur", handleBlur, { once: true });
      timer = window.setTimeout(() => resetFocusStyle?.(true), 2400);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
      resetFocusStyle?.(true);
    };
  }, [focusedMessageId, messages]);

  const resolutionActiveRef = useRef(true);
  const attachmentResolutionTimersRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    resolutionActiveRef.current = true;
    const timers = attachmentResolutionTimersRef.current;
    return () => {
      resolutionActiveRef.current = false;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const resolveRealtimeAttachments = useCallback(
    (message: RoomMessage) => {
      let attempt = 0;
      const resolve = async () => {
        attempt += 1;
        try {
          const attachments = await fetchMessageAttachments(
            roomId,
            message.id,
          );
          if (!resolutionActiveRef.current) return;
          if (attachments.length > 0) {
            reconcile({ ...message, attachments });
            return;
          }
        } catch {
          if (!resolutionActiveRef.current) return;
        }

        if (attempt < ATTACHMENT_RESOLVE_ATTEMPTS) {
          const timer = window.setTimeout(() => {
            attachmentResolutionTimersRef.current.delete(timer);
            void resolve();
          }, ATTACHMENT_RESOLVE_RETRY_MS);
          attachmentResolutionTimersRef.current.add(timer);
        }
      };
      void resolve();
    },
    [fetchMessageAttachments, reconcile, roomId],
  );

  // An applied change carries its instruction and diff on the proposal it
  // links to, which only the read path embeds. Re-reading the room once picks
  // it up -- the same "a Realtime row never embeds its related rows, so resolve
  // them after delivery" rule the attachments path follows. Applying an edit is
  // rare, so this costs one query per applied change and nothing otherwise.
  const resolveAppliedChange = useCallback(() => {
    fetchMessages(roomId)
      .then((resolved) => {
        if (!resolutionActiveRef.current) return;
        resolved.forEach(reconcile);
      })
      .catch(() => {
        // The change still renders with its frozen context; only the
        // expandable detail waits for the next room load.
      });
  }, [fetchMessages, reconcile, roomId]);

  // The Realtime entry point: reconcile the message, then resolve a teammate's
  // attachments so their image appears immediately. A Realtime row never
  // embeds its related files, and a bounded retry covers short visibility lag.
  // The sender's message already kept its local attachments in reconcile, so
  // only another participant's still-empty message is worth a fetch.
  const reconcileFromSubscription = useCallback(
    (message: RoomMessage) => {
      reconcile(message);
      if (
        message.delivery === "persisted" &&
        message.attachments.length === 0 &&
        message.authorId !== currentUserId
      ) {
        resolveRealtimeAttachments(message);
      }
      if (message.kind === "prd_change" && message.prdChange === null) {
        resolveAppliedChange();
      }
    },
    [
      currentUserId,
      reconcile,
      resolveAppliedChange,
      resolveRealtimeAttachments,
    ],
  );

  const handleRoomDeleted = useCallback(() => {
    router.push(workspaceId ? `/${workspaceId}` : "/");
    router.refresh();
  }, [workspaceId, router]);

  // Pending Product Agent task state, keyed by the human source message it
  // answers. Fed only by the safe list_room_ai_task_statuses projection -- never
  // a direct ai_tasks read -- and rebuilt from each poll so a task that vanishes
  // (revoked access, or one this participant may no longer see) drops its
  // pending affordance. The completed reply itself still arrives over Realtime
  // as a persisted message; this only surfaces the interim state.
  const [polledTaskStatuses, setPolledTaskStatuses] = useState<
    Map<string, RoomTaskStatus>
  >(new Map());
  const pollerRef = useRef<RoomTaskStatusPoller | null>(null);

  const taskStatuses = useMemo(
    () =>
      roomTaskStatus
        ? new Map(
            roomTaskStatus.statuses
              .filter((task) => task.sourceMessageId !== null)
              .map((task) => [task.sourceMessageId as string, task]),
          )
        : polledTaskStatuses,
    [polledTaskStatuses, roomTaskStatus],
  );

  useEffect(() => {
    if (hasRoomTaskStatusProvider) return;
    const poller = new RoomTaskStatusPoller({
      intervalMs: taskPollIntervalMs,
      fetchStatuses: () => fetchTaskStatuses(roomId),
      onStatuses: (statuses) => {
        setPolledTaskStatuses(
          new Map(
            statuses
              .filter((task) => task.sourceMessageId !== null)
              .map((task) => [task.sourceMessageId as string, task]),
          ),
        );
      },
      onError: () => {
        // A failed status read (e.g. revoked access) stops the poll; the room
        // stays usable and the completed reply still arrives over Realtime.
      },
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [
    fetchTaskStatuses,
    hasRoomTaskStatusProvider,
    roomId,
    taskPollIntervalMs,
  ]);

  const notifyTaskQueued = useCallback(
    (notice?: RoomTaskQueueNotice) => {
      onTaskQueued?.(notice);
      roomTaskStatus?.notifyQueued(notice);
      if (!onTaskQueued && !roomTaskStatus) {
        pollerRef.current?.notifyQueued();
      }
    },
    [onTaskQueued, roomTaskStatus],
  );

  useEffect(() => {
    const roomSubscription =
      subscribe ??
      ((onMessage, onRoomDeleted) =>
        realtimeMode === "development-poll"
          ? subscribeToDevelopmentRoom(roomId, onMessage, onRoomDeleted)
          : subscribeToProductionRoom(roomId, onMessage, onRoomDeleted));
    // Development polling already re-lists messages with their attachments each
    // tick, so resolving per message there would just refetch on a loop -- only
    // the Realtime path needs it.
    const onMessage =
      realtimeMode === "development-poll"
        ? reconcile
        : reconcileFromSubscription;
    return roomSubscription(onMessage, handleRoomDeleted);
  }, [
    handleRoomDeleted,
    realtimeMode,
    reconcile,
    reconcileFromSubscription,
    roomId,
    subscribe,
  ]);

  const handleStageAttachment = useCallback(
    (attachment: QueuedRoomAttachment) => {
      const formData = new FormData();
      formData.append("roomId", roomId);
      formData.append("file", attachment.file);
      return stageAttachment(formData);
    },
    [roomId, stageAttachment],
  );

  const handleDiscardStagedAttachment = useCallback(
    (attachmentId: string) =>
      discardAttachment({ roomId, attachmentId }),
    [discardAttachment, roomId],
  );

  // The proposals this participant already answered, read once per room. A
  // failed read leaves every proposal offered rather than breaking the room,
  // and an answer given while the read was in flight wins over it -- that
  // answer is newer than the query that started before it.
  useEffect(() => {
    let active = true;
    fetchProposalResponses(roomId)
      .then((responses) => {
        if (!active) return;
        setProposalResponses((current) => {
          const merged = new Map<string, ProposalResponse>(
            Object.entries(responses),
          );
          for (const [messageId, response] of current) {
            merged.set(messageId, response);
          }
          return merged;
        });
      })
      .catch(() => {
        // A proposal simply stays offered; answering it is still idempotent.
      });
    return () => {
      active = false;
    };
  }, [fetchProposalResponses, roomId]);

  // Readiness is resolved once from the authenticated session on mount. It is
  // never inferred from client state; a failure leaves it undefined, which the
  // composer treats as "not ready yet" and simply hides the agent controls.
  useEffect(() => {
    let active = true;
    fetchReadiness()
      .then((resolved) => {
        if (active) {
          setReadiness(resolved);
        }
      })
      .catch(() => {
        // A readiness read that fails must not break the room; the composer
        // still posts ordinary messages and gates the agent behind "not ready".
      });
    return () => {
      active = false;
    };
  }, [fetchReadiness]);

  // The restored draft is a one-shot post-hydration handoff. Scheduling the
  // read keeps server HTML and the first client render identical, while the
  // callback boundary avoids a synchronous setState cascade inside the effect.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      const draft = readRoomDraft(roomId);
      if (!draft) return;
      draftAttachmentIdsRef.current = draft.attachmentIds;
      setRestoredDraft(draft);
      setValue(draft.body);
      clearRoomDraft(roomId);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [roomId]);

  // No ready provider: persist the full room-scoped draft and route to AI
  // setup, carrying a validated returnTo back to this exact room. The draft is
  // stored, never the message -- nothing has been posted.
  const handleConnectPersonalAI = useCallback(
    (draft: RoomDraft) => {
      if (!workspaceId) {
        return;
      }
      const returnTo = buildRoomReturnPath(workspaceId, roomId);
      if (!returnTo) {
        return;
      }
      writeRoomDraft(roomId, draft);
      router.push(
        `/${workspaceId}/settings/devices?returnTo=${encodeURIComponent(
          returnTo,
        )}`,
      );
    },
    [workspaceId, roomId, router],
  );

  const submit = async (
    submission: RoomComposerSubmission,
  ): Promise<boolean> => {
    const clientId = crypto.randomUUID();
    // The uploaded views (already carrying a signed viewUrl) let the sender see
    // their own files immediately -- on the optimistic bubble and on the
    // persisted message -- without waiting for a server read. The read path
    // resupplies them for everyone else.
    const submittedAttachments = submission.attachments.map(
      (attachment) => attachment.uploaded,
    );
    // Fresh composer attachments are additive to a restored draft's surviving
    // ids; the draft's ids are consumed exactly once, on this first send.
    const freshAttachmentIds = submittedAttachments.map(
      (attachment) => attachment.id,
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
      agentKind: submission.agentKind,
      researchScope: submission.researchScope,
      providerOverride: submission.providerOverride,
      modelOverride: submission.modelOverride,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    };
    reconcile({
      id: `optimistic:${clientId}`,
      roomId,
      clientId,
      authorType: "human",
      authorId: currentUserId,
      initiatedBy: null,
      aiTaskId: null,
      provider: null,
      body: submission.body,
      citedMessageIds: [],
      citedEvidenceIds: [],
      assumptions: [],
      suggestedNextQuestions: [],
      proposedAction: null,
      kind: "conversation",
      prdContext: null,
      prdChange: null,
      // Shown on the pending bubble so an attachment-only send is not a blank
      // message while it settles. On failure the bubble's attachments are
      // cleared (below), because the composer re-shows the staged files for
      // retry and we must not render them twice.
      attachments: submittedAttachments,
      createdAt: new Date().toISOString(),
      delivery: "sending",
    });
    setError(undefined);

    let persistedMessage: RoomMessage;
    // Best-effort task outcome; the human message is authoritative regardless.
    let agentTask: PostMessageResult["agentTask"] = {
      status: "not_requested",
    };
    try {
      const result = await sendMessage(input);
      // The post response carries no attachments (they link after the insert),
      // so keep the sender's uploaded views on the persisted message until the
      // read path resupplies them.
      persistedMessage =
        submittedAttachments.length > 0
          ? { ...result.message, attachments: submittedAttachments }
          : result.message;
      agentTask = result.agentTask;
      reconcile(persistedMessage);
    } catch (reason: unknown) {
      const realtimeMessage =
        persistedMessagesByClientId.current.get(clientId);
      if (!realtimeMessage) {
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId &&
            message.delivery === "sending"
              ? // Drop the bubble's attachments: the composer re-shows the
                // staged files for retry, so keeping them here would double them.
                { ...message, delivery: "failed", attachments: [] }
              : message,
          ),
        );
        setError(
          actionErrorMessage(reason, "We could not post the message."),
        );
        return false;
      }
      persistedMessage = realtimeMessage;
    }

    // The human message persisted. A readiness race -- the provider vanishing
    // between the preflight and the send -- surfaces here as a retryable agent
    // error over the still-posted message, never as a rollback.
    if (agentTask.status === "retryable_error") {
      setError(agentTask.message);
    }

    // A mention just queued a reply: poll the safe status projection now so the
    // pending state appears without waiting out the interval.
    if (agentTask.status === "queued") {
      notifyTaskQueued();
    }

    // Clear the room-scoped draft only now, after human persistence.
    clearRoomDraft(roomId);
    return true;
  };

  // Every non-cancel recovery (bring the device back online, re-authenticate,
  // switch or re-authorize a provider, re-ask after a failure) is resolved from
  // the authenticated AI setup, so those actions route there with a validated
  // returnTo back to this room. Cancel is the one action that mutates the task
  // directly, through the authenticated cancel RPC with its own ownership check.
  const handleAgentSetupRecovery = useCallback(() => {
    if (!workspaceId) {
      return;
    }
    const returnTo = buildRoomReturnPath(workspaceId, roomId);
    if (!returnTo) {
      return;
    }
    router.push(
      `/${workspaceId}/settings/devices?returnTo=${encodeURIComponent(
        returnTo,
      )}`,
    );
  }, [workspaceId, roomId, router]);

  const handleCancelTask = useCallback(
    async (taskId: string) => {
      try {
        await cancelTask(taskId);
        notifyTaskQueued();
      } catch {
        setError("We could not cancel the agent task.");
      }
    },
    [cancelTask, notifyTaskQueued],
  );

  const fillComposerWithQuestion = useCallback((question: string) => {
    setValue(question);
  }, []);

  // Tapping a follow-up question is a request to the Product Agent, so it
  // prepends the agent mention -- the user never has to tag it by hand. The
  // composer derives the mention from this body on send (deriveMentionSubmission)
  // and queues the reply just as a typed "@Product Agent" would.
  const askAgentFollowUp = useCallback(
    (kind: AgentKind, question: string) => {
      const name =
        kind === "research" ? RESEARCH_AGENT_NAME : PRODUCT_AGENT_NAME;
      setValue(`@${name} ${question}`);
    },
    [],
  );

  // The durable per-user record of an answered proposal, kept in step with the
  // server so the control disappears the moment the answer lands.
  const recordProposalResponse = useCallback(
    (messageId: string, response: ProposalResponse) => {
      setProposalResponses((current) =>
        new Map(current).set(messageId, response),
      );
    },
    [],
  );

  // One proposal is answered at a time, across every message in the room: the
  // ref settles that before React can re-render the disabled state, so a
  // double click cannot start two runs.
  const answerProposal = useCallback(
    async (messageId: string, answer: () => Promise<void>) => {
      if (pendingProposalIdsRef.current.size > 0) return;
      pendingProposalIdsRef.current.add(messageId);
      setAnsweringProposalId(messageId);
      setError(undefined);
      try {
        await answer();
      } catch (reason: unknown) {
        setError(actionErrorMessage(reason, PROPOSAL_ERROR));
      } finally {
        pendingProposalIdsRef.current.delete(messageId);
        setAnsweringProposalId((current) =>
          current === messageId ? null : current,
        );
      }
    },
    [],
  );

  const handleGeneratePrd = useCallback(
    async (messageId: string) => {
      if (pendingProposalIdsRef.current.size > 0) return;
      pendingProposalIdsRef.current.add(messageId);
      setAnsweringProposalId(messageId);
      setError(undefined);
      try {
        const result = await generatePrdAction({ roomId });
        if (result.status === "error") {
          setError(result.message);
          return;
        }
        recordProposalResponse(messageId, "accepted");
        // Navigate first: notifyTaskQueued's immediate poll fires a server
        // action, and dispatching it before the URL update races Next's
        // router, which can revert the just-pushed ?tab=prd back to the bare
        // path when that action's response resolves. Pushing first lets the
        // navigation settle before anything else talks to the server.
        router.push(`${basePath ?? ""}?tab=prd`);
        notifyTaskQueued({
          kind: "prd_generate",
          taskId: result.taskId,
        });
      } catch {
        setError("Could not start PRD generation.");
      } finally {
        pendingProposalIdsRef.current.delete(messageId);
        setAnsweringProposalId((current) =>
          current === messageId ? null : current,
        );
      }
    },
    [
      basePath,
      generatePrdAction,
      notifyTaskQueued,
      recordProposalResponse,
      roomId,
      router,
    ],
  );

  const handleRevisePrd = useCallback(
    async (messageId: string, sourceTaskId: string) => {
      if (pendingProposalIdsRef.current.size > 0) return;
      pendingProposalIdsRef.current.add(messageId);
      setAnsweringProposalId(messageId);
      setError(undefined);
      try {
        const result = await revisePrdAction({ roomId, sourceTaskId });
        if (result.status === "error") {
          setError(result.message);
          return;
        }
        recordProposalResponse(messageId, "accepted");
        // See handleGeneratePrd: push before notifying so the immediate poll's
        // server action can't race the navigation and revert it.
        router.push(`${basePath ?? ""}?tab=prd`);
        notifyTaskQueued({
          kind: "prd_revise",
          taskId: result.taskId,
        });
      } catch {
        setError("Could not start PRD revision.");
      } finally {
        pendingProposalIdsRef.current.delete(messageId);
        setAnsweringProposalId((current) =>
          current === messageId ? null : current,
        );
      }
    },
    [
      basePath,
      notifyTaskQueued,
      recordProposalResponse,
      revisePrdAction,
      roomId,
      router,
    ],
  );

  const handleProposalConfirm = useCallback(
    async (
      messageId: string,
      action: RoomProposedAction,
      sourceTaskId: string,
    ) => {
      switch (action.kind) {
        case "prd_generate":
          await handleGeneratePrd(messageId);
          return;
        case "prd_revise":
          await handleRevisePrd(messageId, sourceTaskId);
          return;
        case "decision_capture":
          await answerProposal(messageId, async () => {
            await captureDecision(messageId);
            recordProposalResponse(messageId, "accepted");
          });
          return;
        case "user_flow_generate":
          await answerProposal(messageId, async () => {
            await acceptUserFlow(messageId);
            recordProposalResponse(messageId, "accepted");
          });
      }
    },
    [
      acceptUserFlow,
      answerProposal,
      captureDecision,
      handleGeneratePrd,
      handleRevisePrd,
      recordProposalResponse,
    ],
  );

  const handleProposalDismiss = useCallback(
    async (messageId: string) => {
      await answerProposal(messageId, async () => {
        // The recorded answer, not the requested one: a proposal this
        // participant already accepted stays accepted.
        recordProposalResponse(messageId, await dismissProposal(messageId));
      });
    },
    [answerProposal, dismissProposal, recordProposalResponse],
  );

  // A PRD proposal waits on the room's task projection: until the first read
  // lands, and while a PRD task is running, offering it would race the work
  // already under way.
  const isPrdTaskSettled =
    roomTaskStatus === null ||
    (roomTaskStatus.hasCompletedInitialRead &&
      !roomTaskStatus.hasPrdTaskSurface);

  const composer = (
    <RoomComposer
      key={restoredDraft ? `restored:${roomId}` : `empty:${roomId}`}
      value={value}
      onChange={setValue}
      onSubmit={submit}
      onStageAttachment={handleStageAttachment}
      onDiscardStagedAttachment={handleDiscardStagedAttachment}
      mentions={mentionOptions}
      status={error}
      agentReadiness={readiness}
      onConnectPersonalAI={handleConnectPersonalAI}
      roomId={roomId}
      initialProviderOverride={restoredDraft?.providerOverride}
      initialModelOverride={restoredDraft?.modelOverride}
      initialResearchScope={restoredDraft?.researchScope}
    />
  );

  return (
    <ChatLayout
      density="balanced"
      composer={composer}
      style={{ height: "100%" }}
      emptyState={
        <VStack
          gap={2}
          hAlign="center"
          data-testid="empty-room-welcome"
        >
          <Image
            src="/mascots/meld-spark.png"
            alt=""
            aria-hidden="true"
            width={512}
            height={512}
            data-testid="room-mascot"
            style={{
              blockSize: "auto",
              inlineSize: "calc(var(--spacing-12) * 2)",
            }}
          />
          <Heading level={3} accessibilityLevel={2}>
            Start exploring {roomName} together
          </Heading>
          <Text
            type="body"
            color="secondary"
            display="block"
            justify="center"
            textWrap="balance"
            style={{
              maxWidth: "calc(var(--spacing-12) * 10)",
            }}
          >
            Share observations, evidence, and questions with your team.
            Mention a connected agent to synthesize insights and
            suggest next steps.
          </Text>
          {emptyStateActions}
        </VStack>
      }
    >
      {messages.length > 0 ? (
        <ChatMessageList density="compact" gap={3}>
          {messages.map((message, index) => {
            const previousMessage = messages[index - 1];
            const startsNewDay =
              !previousMessage ||
              messageDayKey(previousMessage) !==
                messageDayKey(message);
            const authorName = resolveAuthorName({
              message,
              currentUserId,
              currentUserName,
              participantNames,
            });
            const agentKind = messageAgentKind(message);
            const proposedAction = message.proposedAction;
            const providerLabel = message.provider
              ? PROVIDER_LABEL[message.provider]
              : null;
            const initiatorName =
              agentKind && message.initiatedBy
                ? resolveHumanName({
                    userId: message.initiatedBy,
                    currentUserId,
                    currentUserName,
                    participantNames,
                  })
                : null;
            const pendingTask =
              message.authorType === "human"
                ? taskStatuses.get(message.id)
                : undefined;
            // A completed answer repeats the question's frozen PRD context in
            // storage so it remains self-contained. When the matching question
            // is directly above it, render that context once and let the
            // Question / Answer labels carry the exchange instead of showing
            // the same selection twice.
            const answersPreviousPrdQuestion =
              agentKind !== null &&
              message.kind === "prd_context" &&
              message.prdContext !== null &&
              message.prdContext.assistRequestId !== null &&
              previousMessage?.authorType === "human" &&
              previousMessage.kind === "prd_context" &&
              previousMessage.prdContext?.assistRequestId ===
                message.prdContext.assistRequestId;

            const dayDivider = startsNewDay ? (
              <Divider
                label={
                  <Text type="supporting">
                    {formatMessageDay(message)}
                  </Text>
                }
              />
            ) : null;

            // An applied edit is an event in the record, not something anyone
            // said, so it never becomes a chat bubble.
            if (message.kind === "prd_change") {
              return (
                <Fragment key={message.clientId}>
                  {dayDivider}
                  <PrdChangeEvent
                    message={message}
                    time={formatMessageTime(message)}
                    basePath={basePath}
                  />
                </Fragment>
              );
            }

            return (
              <Fragment key={message.clientId}>
                {dayDivider}
                <ChatMessage
                  id={`message-${message.id}`}
                  sender="assistant"
                  avatar={
                    agentKind ? (
                      <AgentMarker
                        kind={agentKind}
                        name={authorName}
                        size="md"
                      />
                    ) : (
                      <Avatar name={authorName} size="md" />
                    )
                  }
                  data-testid={`conversation-message-${message.clientId}`}
                >
                  <VStack gap={0.5} width="100%">
                    <HStack gap={2} vAlign="center">
                      <Text type="label">{authorName}</Text>
                      {agentKind && providerLabel ? (
                        <Text type="supporting" color="secondary">
                          via {providerLabel}
                        </Text>
                      ) : null}
                      {initiatorName ? (
                        <Text type="supporting" color="secondary">
                          Asked by {initiatorName}
                        </Text>
                      ) : null}
                      <Text type="supporting">
                        {formatMessageTime(message)}
                      </Text>
                    </HStack>
                    {message.prdContext && !answersPreviousPrdQuestion ? (
                      <PrdContextRow
                        context={message.prdContext}
                        basePath={basePath}
                      />
                    ) : null}
                    {message.kind === "prd_context" && !agentKind ? (
                      <Text type="label" data-testid="message-purpose">
                        Question
                      </Text>
                    ) : null}
                    {agentKind ? (
                      <AgentContent
                        message={message}
                        inlinePlugins={mentionInlinePlugins}
                        onFillQuestion={(question) =>
                          askAgentFollowUp(agentKind, question)
                        }
                        proposalControl={
                          proposedAction &&
                          isProposalOffered({
                            action: proposedAction,
                            aiTaskId: message.aiTaskId,
                            hasPrd,
                            isPrdTaskSettled,
                          }) ? (
                            <RoomProposalAction
                              messageId={message.id}
                              action={proposedAction}
                              canEdit={canEditRoom}
                              response={
                                proposalResponses.get(message.id) ?? null
                              }
                              onConfirm={(messageId, action) =>
                                handleProposalConfirm(
                                  messageId,
                                  action,
                                  message.aiTaskId ?? "",
                                )
                              }
                              onDismiss={handleProposalDismiss}
                              isBusy={
                                answeringProposalId !== null &&
                                answeringProposalId !== message.id
                              }
                            />
                          ) : null
                        }
                      />
                    ) : (
                      <Markdown
                        density="compact"
                        autolink="gfm"
                        inlinePlugins={mentionInlinePlugins}
                        contentWidth="100%"
                      >
                        {message.body}
                      </Markdown>
                    )}
                    {message.attachments.length > 0 ? (
                      <MessageAttachments
                        attachments={message.attachments}
                      />
                    ) : null}
                    {pendingTask ? (
                      <AgentTaskState
                        status={pendingTask.status}
                        provider={pendingTask.provider}
                        agentKind={pendingTask.agentKind}
                        startedAt={pendingTask.createdAt}
                        onCancel={() =>
                          void handleCancelTask(pendingTask.taskId)
                        }
                        onReconnect={handleAgentSetupRecovery}
                        onFixConnection={handleAgentSetupRecovery}
                        onAskAgain={() => fillComposerWithQuestion(message.body)}
                      />
                    ) : null}
                  </VStack>
                </ChatMessage>
              </Fragment>
            );
          })}
        </ChatMessageList>
      ) : null}
    </ChatLayout>
  );
}
