"use client";

import {
  ChatLayout,
  ChatMessage,
  ChatMessageList,
} from "@astryxdesign/core/Chat";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Citation } from "@astryxdesign/core/Citation";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
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
  DesignReferenceView,
  Provider,
  RoomProposedAction,
} from "@meld/contracts";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { AgentTaskState } from "@/features/ai/components/agent-task-state";
import { AgentActivity } from "@/features/ai/components/agent-activity";
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
  cancelDesignScreenTask,
} from "../actions";
import type { RoomAttachmentView } from "../attachment-types";
import type { RoomMessage } from "../repository";
import {
  subscribeToDevelopmentRoom,
  subscribeToProductionRoom,
  type RoomSubscription,
} from "../room-message-subscription";
import {
  listDesignAgentTurns,
  type DesignAgentTurn,
} from "@/features/design/design-agent-transcript";
import { useRoomComposerContext } from "./room-composer-context";
import { groupDesignTurnsBySend } from "@/features/design/group-design-turns";
import { useDesignScreenGeneration } from "@/features/design/use-design-screen-generation";
import { DesignTurnBubbles } from "@/features/design/components/agents-transcript";
// `getRoomCanvasScreens` is a "use server" wrapper over the server-only canvas
// reader -- importing the reader directly here would drag server-only code
// (next/headers) into this client bundle.
import { getRoomCanvasScreens } from "@/features/design/canvas-screen-action";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { getActiveDesignProfile } from "@/features/design/design-profile-reader";
import { subscribeToDesignEvents } from "@/features/design/design-events-subscription";
import {
  acceptPrdMessageProposal,
  acceptProposedUserFlow,
  captureProposedDecision,
  dismissMessageProposal,
  listRoomProposalResponses,
  type AcceptedUserFlow,
  type ProposalResponse,
} from "../proposals";
import type { MessageInput } from "../schemas";
import { RoomComposer } from "./composer";
import { EmptyRoomStart } from "./empty-room-start";
import { useRoomDock } from "./room-dock-context";
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
import { FigmaReferenceCard } from "@/features/design/components/figma-reference-card";
import { extractFigmaReferences } from "@/features/design/figma-url";
import { listRoomDesignReferences } from "@/features/design/design-references-reader";

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
const NO_DESIGN_REFERENCES: DesignReferenceView[] = [];

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

// Focus the room composer and place the caret at the very end of its content.
// Queried from the DOM (the composer manages its own contenteditable) with the
// same selector the starter list used before, falling back to the labelled
// field so a textarea test double is handled too.
function focusComposerAtEnd() {
  const editor =
    document.querySelector<HTMLElement>(
      '[data-testid="room-chat-composer"] [contenteditable="true"]',
    ) ?? document.querySelector<HTMLElement>('[aria-label="Message"]');
  if (!editor) return;
  editor.focus();
  if (
    editor instanceof HTMLTextAreaElement ||
    editor instanceof HTMLInputElement
  ) {
    const end = editor.value.length;
    editor.setSelectionRange(end, end);
    return;
  }
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function formatMessageTime(message: RoomMessage) {
  if (message.delivery === "sending") return "Sending";
  if (message.delivery === "failed") return "Failed to send";
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
  }).format(new Date(message.createdAt));
}

function formatMessageDay(message: RoomMessage) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
  }).format(new Date(message.createdAt));
}

// ISO-string variants so a merged feed of room messages + design turns can
// share one day-divider computation.
function dayKeyFromIso(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function formatDayFromIso(iso: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(
    new Date(iso),
  );
}

const PRODUCT_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "product")?.name ??
  "Product Agent";
const RESEARCH_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "research")?.name ??
  "Research Agent";
const DESIGN_AGENT_NAME =
  DISCOVERY_AGENTS.find((agent) => agent.kind === "design")?.name ??
  "Design Agent";

// Strip a leading "@Design Agent" mention from a composer body so only the
// user's actual instruction reaches the screen generator.
function stripDesignMention(body: string): string {
  return body.replace(new RegExp(`@${DESIGN_AGENT_NAME}\\s*`, "i"), "").trim();
}

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
            <ListItem
              key={`assumption-${index}`}
              // A node, not a string: ListItem single-line-truncates a plain
              // string label, which clipped these mid-sentence.
              label={
                <Text data-testid="agent-assumption">{assumption}</Text>
              }
            />
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
              // A node, not a string. ListItem truncates a string label to one
              // line, and half a question is one you cannot answer.
              label={
                <Text data-testid="agent-suggested-question">{question}</Text>
              }
              onClick={() => onFillQuestion(question)}
            />
          ))}
        </List>
      ) : null}

      {proposalControl}
    </VStack>
  );
}

// Upsert-by-id, mirroring HistoryDrawer's own reconcile helper: replaces an
// existing reference with the same id (a refresh's upgraded view) or appends
// a newly-discovered one, never duplicating a row.
function upsertDesignReferenceById(
  references: DesignReferenceView[],
  incoming: DesignReferenceView,
): DesignReferenceView[] {
  return [
    ...references.filter((reference) => reference.id !== incoming.id),
    incoming,
  ];
}

// The Figma references to show under one message: every room reference whose
// normalized URL appears in the message's own body, matched by exact URL
// (never by reference id -- a reference belongs to whichever message(s)
// mention its URL, not to the message that first triggered detection).
function messageFigmaReferences(
  message: RoomMessage,
  designReferences: DesignReferenceView[],
): DesignReferenceView[] {
  const referencedUrls = extractFigmaReferences(message.body);
  if (referencedUrls.length === 0) return [];
  return designReferences.filter((reference) =>
    referencedUrls.includes(reference.normalizedUrl),
  );
}

function reconcileMessage(messages: RoomMessage[], incoming: RoomMessage) {
  const existing = messages.find(
    (message) =>
      message.clientId === incoming.clientId || message.id === incoming.id,
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
      message.clientId !== incoming.clientId && message.id !== incoming.id,
  );
  return [...withoutDuplicate, resolved].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
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
  initialDesignReferences = NO_DESIGN_REFERENCES,
  fetchDesignReferences = listRoomDesignReferences,
  cancelTask = cancelRoomReplyTask,
  generatePrdAction = generatePrd,
  revisePrdAction = revisePrd,
  fetchProposalResponses = listRoomProposalResponses,
  acceptPrdProposal = acceptPrdMessageProposal,
  dismissProposal = dismissMessageProposal,
  captureDecision = captureProposedDecision,
  acceptUserFlow = acceptProposedUserFlow,
  onTaskQueued,
  hasPrd = false,
  basePath,
  showRoomStarters = false,
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
  // Server-rendered starting set, mirroring initialMessages -- the client
  // then refetches once (fetchDesignReferences) so a reference recorded by
  // the fire-and-forget postMessage detection after the server render still
  // shows up without a full reload.
  initialDesignReferences?: DesignReferenceView[];
  fetchDesignReferences?: (roomId: string) => Promise<DesignReferenceView[]>;
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
  acceptPrdProposal?: (
    messageId: string,
    taskId: string,
  ) => Promise<ProposalResponse>;
  dismissProposal?: (messageId: string) => Promise<ProposalResponse>;
  captureDecision?: (messageId: string) => Promise<unknown>;
  acceptUserFlow?: (messageId: string) => Promise<AcceptedUserFlow>;
  onTaskQueued?: (notice?: RoomTaskQueueNotice) => void;
  hasPrd?: boolean;
  basePath?: string;
  // Show the empty-room starter list in the empty state. The page decides this
  // (no PRD, no user flow); the participant's edit access is gated here.
  showRoomStarters?: boolean;
  focusedMessageId?: string;
  // Poll cadence for the task-status projection. Defaults to the poller's 2s
  // production interval; overridable so tests can drive it fast.
  taskPollIntervalMs?: number;
  subscribe?: RoomSubscription;
}) {
  const router = useRouter();
  const dock = useRoomDock();
  const isDocked = dock !== null;
  // On its own tab the conversation is the whole surface: always showing, no
  // capped panel, no floating. Still "docked" in the sense that this
  // component -- not a dock -- decides where its composer goes.
  const isConversationPage = dock?.variant === "page";
  const roomTaskStatus = useRoomTaskStatus();
  const hasRoomTaskStatusProvider = roomTaskStatus !== null;
  const [messages, setMessages] = useState(initialMessages);
  const [designReferences, setDesignReferences] = useState(
    initialDesignReferences,
  );
  // The design-agent conversation, blended into this feed so the Canvas
  // Agents chat also lives here. Loaded client-side (additive to the server
  // render), refreshed whenever a design event fires. canvasScreens + the
  // active profile's token CSS back the built-screen thumbnails, exactly as
  // they do on the canvas.
  const [designTurns, setDesignTurns] = useState<DesignAgentTurn[]>([]);
  const [designCanvasScreens, setDesignCanvasScreens] = useState<CanvasScreen[]>(
    [],
  );
  const [designTokenCss, setDesignTokenCss] = useState("");
  const [designComponentCss, setDesignComponentCss] = useState("");
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listDesignAgentTurns(roomId).then((turns) => {
        if (!cancelled) setDesignTurns(turns);
      });
      void getRoomCanvasScreens(roomId).then((result) => {
        if (!cancelled) setDesignCanvasScreens(result.screens);
      });
      // Inside `refresh`, not beside it. Read once at mount, the design CSS
      // was frozen for the life of the room view: uploading a design system
      // while the room was open left every screen card rendering token-less
      // until a full page reload, because nothing ever re-read it.
      //
      // A failed read says nothing about the design system, so keep whatever
      // we already have rather than blanking the cards on a blip.
      void getActiveDesignProfile(roomId).then((profile) => {
        if (cancelled || profile.status !== "ok") return;
        setDesignTokenCss(profile.tokenCss);
        setDesignComponentCss(profile.componentCss);
      });
    };
    refresh();
    // A design event (generation started/finished) is the signal to re-read.
    //
    // It re-reads the turns and wakes the task poller too, not just the design
    // profile. A chain queues its next link inside the database, and the poller
    // idles the moment nothing is non-terminal -- which is exactly the gap
    // between two links. Without this the browser never learned the chain had
    // continued: the turn spun on "building the next..." minutes after every
    // link had settled.
    const unsubscribe = subscribeToDesignEvents(roomId, () => {
      refresh();
      roomTaskStatus?.notifyQueued();
      router.refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [roomId, roomTaskStatus, router]);
  const openDesignPreview = useCallback(
    (screenId: string) => {
      router.push(`${basePath ?? ""}?tab=prototype&screen=${screenId}`);
    },
    [basePath, router],
  );
  // One time-ordered feed of room messages + design turns.
  const feedItems = useMemo(
    () =>
      [
        ...messages.map(
          (message) =>
            ({ type: "message", createdAt: message.createdAt, message }) as const,
        ),
        // Grouped before mapping: editing a selection queues one task per
        // screen, and one bubble per task showed the same prompt once per
        // screen -- one request looking like several.
        ...groupDesignTurnsBySend(designTurns).map(
          (turn) => ({ type: "turn", createdAt: turn.createdAt, turn }) as const,
        ),
      ].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages, designTurns],
  );
  const designScreenById = useMemo(
    () => new Map(designCanvasScreens.map((screen) => [screen.id, screen])),
    [designCanvasScreens],
  );
  const focusedMessageIdRef = useRef<string | null>(null);
  // Server HTML and the first client render both start empty. The room-scoped
  // sessionStorage draft is applied after hydration as one coherent handoff.
  const [restoredDraft, setRestoredDraft] = useState<RoomDraft | null>(null);
  // Restored-draft attachment ids are re-linked exactly once, on the first send
  // after returning from AI setup. Fresh composer attachments are additive.
  const draftAttachmentIdsRef = useRef<string[]>([]);
  // Starts empty so the server-rendered HTML and the first client render match
  // (sessionStorage is client-only); the restored draft body is applied in a
  // mount effect below, avoiding a hydration mismatch on the composer.
  const [value, setValue] = useState("");
  // Reported up by the composer whenever its own staged-attachment queue
  // changes -- a count, not a duplicate of the queue itself; the composer
  // owns the list (see `RoomComposer`'s `onStagedAttachmentCountChange`).
  const [stagedAttachmentCount, setStagedAttachmentCount] = useState(0);
  // The dock refuses to collapse over work that has not been sent -- draft
  // text, or a staged attachment. `Conversation` owns both, so it reports
  // the combination upward rather than the dock reaching in for either.
  const onUnsentWorkChange = dock?.onUnsentWorkChange;
  useEffect(() => {
    onUnsentWorkChange?.(value.trim().length > 0 || stagedAttachmentCount > 0);
  }, [value, stagedAttachmentCount, onUnsentWorkChange]);
  const [readiness, setReadiness] = useState<AgentReadiness>();
  const [error, setError] = useState<string>();
  const [answeringProposalId, setAnsweringProposalId] = useState<string | null>(
    null,
  );
  const [optimisticPrdProposalTasks, setOptimisticPrdProposalTasks] = useState<
    Map<string, { taskId: string; kind: "prd_generate" | "prd_revise" }>
  >(new Map());
  // Every proposal this participant has already answered, whether in this
  // session or a previous one. Read once from the durable per-user responses
  // so a dismissal survives a reload instead of coming back on every visit.
  const [proposalResponses, setProposalResponses] = useState<
    Map<string, ProposalResponse>
  >(new Map());
  const pendingProposalIdsRef = useRef(new Set<string>());
  const canEditRoom = participants.some(
    (participant) =>
      participant.userId === currentUserId && participant.access === "edit",
  );
  // The same hook the Canvas composer uses, for the same reason: it polls the
  // queued task and reports when the screen has actually materialised. Calling
  // the server action directly (as this path used to) queues the work and
  // returns, so a screen asked for in chat stayed invisible until the browser
  // was reloaded by hand.
  // Carries the Canvas pane's current screen selection, and the PRD text
  // selection, into this composer -- the Room's only one.
  // Stops a run in flight. The refresh is what makes the stop visible: the
  // turn only stops saying "Designing your screen…" once the page re-reads the
  // task's now-cancelled status.
  const cancelDesignGeneration = useCallback(
    (taskId: string) => {
      // `.finally`, not `.then`. A rejected cancel used to skip the refresh
      // entirely, so the turn kept saying "Designing your screen…" over a task
      // that had already stopped -- and the unhandled rejection put Next's
      // full-screen error overlay in front of the person for a cancel that had
      // in fact worked. Refreshing either way re-reads the truth; a cancel that
      // failed because the task had already finished wanted the same refresh a
      // successful one did.
      void cancelDesignScreenTask(taskId)
        .catch(() => undefined)
        .finally(() => router.refresh());
    },
    [router],
  );
  const roomComposerContext = useRoomComposerContext();
  const designGeneration = useDesignScreenGeneration({
    roomId,
    // Not gated on canEditRoom. That is derived from the participants prop,
    // which need not list the current user, and gating on it here would
    // silently drop the generation instead of refusing it. Authority for this
    // lives server-side -- create_design_screen is editor-gated in the
    // database -- and this path was ungated before, calling the action
    // directly. The hook's `access` only decides whether it polls at all.
    access: "edit",
    onScreenReady: () => router.refresh(),
    // Failure has to re-read the page too. The turn's "Designing your screen…"
    // comes from the server-rendered task status, so without this a dead
    // generation spins for ever with a Cancel button for a task that already
    // stopped.
    onFailed: () => router.refresh(),
  });
  const participantNames = new Map(
    participants.map((participant) => [participant.userId, participant.email]),
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
        handle: `${agent.kind}-agent`,
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
  // The Figma-reference sweep (extractFigmaReferences' regex scan plus the
  // designReferences filter) run once per message list / reference-set
  // change rather than on every render -- looked up per message below
  // instead of recomputed inline in the render loop.
  const figmaReferencesByMessageId = useMemo(() => {
    const map = new Map<string, DesignReferenceView[]>();
    for (const message of messages) {
      map.set(message.id, messageFigmaReferences(message, designReferences));
    }
    return map;
  }, [messages, designReferences]);
  const persistedMessagesByClientId = useRef(
    new Map<string, RoomMessage>(
      initialMessages
        .filter((message) => message.delivery === "persisted")
        .map((message) => [message.clientId, message]),
    ),
  );
  const reconcile = useCallback((message: RoomMessage) => {
    if (message.delivery === "persisted") {
      persistedMessagesByClientId.current.set(message.clientId, message);
    }
    setMessages((current) => reconcileMessage(current, message));
  }, []);

  useEffect(() => {
    if (
      !focusedMessageId ||
      focusedMessageIdRef.current === focusedMessageId ||
      !messages.some(
        (message) =>
          message.id === focusedMessageId && message.delivery === "persisted",
      )
    ) {
      return;
    }

    let resetFocusStyle: ((restorePriorFocus: boolean) => void) | undefined;
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`message-${focusedMessageId}`);
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
          const attachments = await fetchMessageAttachments(roomId, message.id);
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

  // Mirrors resolveRealtimeAttachments: postMessage's own Figma-link
  // detection (recordFigmaReferences) is fire-and-forget from the server
  // action, so the reference row it upserts is not guaranteed to exist yet
  // by the time this client gets the post's response back. The mount-time
  // fetchDesignReferences effect only ever runs once, before this message
  // existed, so a link posted live in this session needs its own bounded
  // retry to pick up the newly-recorded "pending" row without a reload.
  // Stops early once every URL just posted is present in a fetched batch.
  const resolveDesignReferences = useCallback(
    (targetUrls: string[]) => {
      let attempt = 0;
      const resolve = async () => {
        attempt += 1;
        try {
          const references = await fetchDesignReferences(roomId);
          if (!resolutionActiveRef.current) return;
          setDesignReferences((current) => {
            let merged = current;
            for (const reference of references) {
              merged = upsertDesignReferenceById(merged, reference);
            }
            return merged;
          });
          const knownUrls = new Set(
            references.map((reference) => reference.normalizedUrl),
          );
          if (targetUrls.every((url) => knownUrls.has(url))) return;
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
    [fetchDesignReferences, roomId],
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
    const roomSubscription: RoomSubscription =
      subscribe ??
      ((onMessage, onRoomDeleted) =>
        realtimeMode === "development-poll"
          ? subscribeToDevelopmentRoom(roomId, onMessage, onRoomDeleted)
          : // In production, room deletion arrives over the shared broadcast
            // channel that RoomSurfaceSync owns, so the message subscription no
            // longer carries onRoomDeleted.
            subscribeToProductionRoom(roomId, onMessage));
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
    (attachmentId: string) => discardAttachment({ roomId, attachmentId }),
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

  // The room's Figma references, read once on mount alongside the server-
  // passed initial set -- mirroring fetchProposalResponses just above. A
  // reference recorded by the fire-and-forget postMessage detection after
  // the server render lands here rather than requiring a reload. Merged by
  // id so it never clobbers a card's own in-flight refresh/remove result.
  useEffect(() => {
    let active = true;
    fetchDesignReferences(roomId)
      .then((references) => {
        if (!active) return;
        setDesignReferences((current) => {
          let merged = current;
          for (const reference of references) {
            merged = upsertDesignReferenceById(merged, reference);
          }
          return merged;
        });
      })
      .catch(() => {
        // A failed read simply leaves the server-passed initial set (if any)
        // in place; the room still functions without the Figma cards.
      });
    return () => {
      active = false;
    };
  }, [fetchDesignReferences, roomId]);

  const handleDesignReferenceRefreshed = useCallback(
    (reference: DesignReferenceView) => {
      setDesignReferences((current) =>
        upsertDesignReferenceById(current, reference),
      );
    },
    [],
  );

  const handleDesignReferenceRemoved = useCallback((referenceId: string) => {
    setDesignReferences((current) =>
      current.filter((reference) => reference.id !== referenceId),
    );
  }, []);

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
    // The Design Agent doesn't reply with a message -- it generates a screen.
    // Route an @Design Agent mention straight into the design pipeline (using
    // the same provider/model the routing chip picked); the resulting turn
    // appears in this feed via the design-events subscription, so no human
    // message is posted (its prompt shows as the turn's own bubble).
    if (submission.agentKind === "design") {
      const instruction =
        stripDesignMention(submission.body) || submission.body;
      if (instruction) {
        // Screens selected on a Canvas pane are what this request edits. With
        // no selection there is no target, the server creates a fresh screen,
        // and the model generates a first version -- which is why asking to
        // change existing designs used to produce new ones instead. One
        // generation per selected screen, mirroring what the Canvas composer
        // did before it was folded into this one.
        const targets = roomComposerContext?.canvasSelection ?? [];
        const editable = targets.filter(
          (target): target is typeof target & { targetScreenId: string } =>
            target.targetScreenId !== null,
        );
        if (editable.length > 0) {
          void designGeneration.startMany(
            editable.map((target) => ({
              screenId: target.targetScreenId,
              instruction,
              provider: submission.providerOverride,
              model: submission.modelOverride,
            })),
          );
        } else {
          void designGeneration.start({
            instruction,
            provider: submission.providerOverride,
            model: submission.modelOverride,
          });
        }
      }
      return true;
    }
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
      // A Figma link in what was just posted: recordFigmaReferences ran
      // fire-and-forget inside the postMessage action, so the row it upserts
      // may not exist yet even though the post itself already has. Kick off
      // the bounded retry rather than waiting for the next full room load.
      const postedFigmaUrls = extractFigmaReferences(submission.body);
      if (postedFigmaUrls.length > 0) {
        resolveDesignReferences(postedFigmaUrls);
      }
    } catch (reason: unknown) {
      const realtimeMessage = persistedMessagesByClientId.current.get(clientId);
      if (!realtimeMessage) {
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId && message.delivery === "sending"
              ? // Drop the bubble's attachments: the composer re-shows the
                // staged files for retry, so keeping them here would double them.
                { ...message, delivery: "failed", attachments: [] }
              : message,
          ),
        );
        setError(actionErrorMessage(reason, "We could not post the message."));
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

  // A starter drops a partial prompt into the composer, then focuses it with
  // the caret at the end so the user just keeps typing. The focus is scheduled
  // after two frames so React has committed the new value into the
  // contenteditable before the caret is moved to its end.
  const prefillComposer = useCallback((prompt: string) => {
    setValue(prompt);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        focusComposerAtEnd();
      });
    });
  }, []);

  // Tapping a follow-up question is a request to the Product Agent, so it
  // prepends the agent mention -- the user never has to tag it by hand. The
  // composer derives the mention from this body on send (deriveMentionSubmission)
  // and queues the reply just as a typed "@Product Agent" would.
  const askAgentFollowUp = useCallback((kind: AgentKind, question: string) => {
    const name = kind === "research" ? RESEARCH_AGENT_NAME : PRODUCT_AGENT_NAME;
    setValue(`@${name} ${question}`);
  }, []);

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
        recordProposalResponse(
          messageId,
          await acceptPrdProposal(messageId, result.taskId),
        );
        setOptimisticPrdProposalTasks((current) =>
          new Map(current).set(messageId, {
            taskId: result.taskId,
            kind: "prd_generate",
          }),
        );
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
      acceptPrdProposal,
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
        recordProposalResponse(
          messageId,
          await acceptPrdProposal(messageId, result.taskId),
        );
        setOptimisticPrdProposalTasks((current) =>
          new Map(current).set(messageId, {
            taskId: result.taskId,
            kind: "prd_revise",
          }),
        );
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
      acceptPrdProposal,
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
        case "user_flow_revise":
          await answerProposal(messageId, async () => {
            const accepted = await acceptUserFlow(messageId);
            recordProposalResponse(messageId, "accepted");
            // See handleGeneratePrd: push before notifying so the immediate
            // poll's server action can't race the navigation and revert it.
            router.push(`${basePath ?? ""}?tab=user-flows`);
            notifyTaskQueued({
              kind: "user_flow_generate",
              taskId: accepted.taskId,
            });
          });
      }
    },
    [
      acceptUserFlow,
      answerProposal,
      basePath,
      captureDecision,
      handleGeneratePrd,
      handleRevisePrd,
      notifyTaskQueued,
      recordProposalResponse,
      router,
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

  // ChatLayout's own `density="spacious"` centers both the message area and
  // the composer dock at a shared max-width with a real scrollbar at the
  // true viewport edge, and ChatMessageList's built-in spacer already
  // stacks a short conversation at the top with empty space below it. A
  // hand-rolled maxWidth wrapper around either one kept fighting that --
  // pulling the scrollbar in, breaking the spacer's height math, stalling
  // the initial scroll-to-bottom on reload. Using the density the
  // component already ships for exactly this, plain and undecorated, is
  // the fix.
  const composer = (
    <RoomComposer
      key={restoredDraft ? `restored:${roomId}` : `empty:${roomId}`}
      value={value}
      onChange={setValue}
      onSubmit={submit}
      onStageAttachment={handleStageAttachment}
      onDiscardStagedAttachment={handleDiscardStagedAttachment}
      onStagedAttachmentCountChange={setStagedAttachmentCount}
      mentions={mentionOptions}
      status={error}
      agentReadiness={readiness}
      onConnectPersonalAI={handleConnectPersonalAI}
      roomId={roomId}
      initialProviderOverride={restoredDraft?.providerOverride}
      initialModelOverride={restoredDraft?.modelOverride}
      initialResearchScope={restoredDraft?.researchScope}
      // Reaching for the composer opens the transcript -- focus, not the
      // first keystroke. Waiting for a character meant clicking into an empty
      // composer showed you nothing and you had to type blind to find out
      // whether the room already had a conversation in it.
      onFocusWithin={
        dock && !dock.isExpanded && !isConversationPage
          ? () => dock.onExpandedChange(true)
          : undefined
      }
      isIntegrated={dock?.variant === "dock" && dock.isExpanded}
    />
  );

  return (
    <>
      {/* In the Room dock the transcript is a separate floating panel that
       * appears ABOVE the composer, so it is dropped entirely while the dock
       * is collapsed and the composer stands alone on the canvas. Everywhere
       * else (its own page, tests) the ChatLayout renders as it always has,
       * composer included.
       *
       * The pixel-pattern canvas is also dropped in the dock: the Room already
       * paints a dot field behind everything, and a second full-bleed pattern
       * inside a floating panel on top of it is two competing grids. */}
      {isDocked && !dock.isExpanded && !isConversationPage ? null : (
      <ChatLayout
        className={
          isDocked ? "room-conversation" : "conversation-pixel-canvas"
        }
        data-background={isDocked ? undefined : "pixel-grid-full"}
        data-testid="conversation-layout"
        density="spacious"
        composer={isDocked ? null : composer}
        style={
          isConversationPage
            ? // Its own tab: fill it, and paint nothing. The plane's own
              // full-bleed surface is already the white sheet here, so a
              // second one would be a panel inside a panel.
              { height: "100%", minHeight: 0, backgroundColor: "transparent" }
            : isDocked
              ? // The expanded dock owns the shared transcript/composer
                // surface. This child only controls transcript height.
                {
                  maxBlockSize: "var(--meld-dock-transcript-max)",
                  // Paired with the cap on purpose. A flex item's default
                  // `min-height: auto` is its content height, which overrides
                  // `max-block-size` and lets a long transcript grow to fill
                  // the plane -- exactly the runaway this is fixing.
                  minBlockSize: 0,
                  backgroundColor: "transparent",
                  clipPath: "none",
                }
              : { height: "100%" }
        }
        emptyState={
        // ChatLayout centers its emptyState slot both ways by default;
        // align-self overrides just the vertical half so the starting
        // points sit right above the composer instead of floating in the
        // middle of the empty room. No extra padding of our own here (see
        // margin note below) -- any height this box adds beyond ChatLayout's
        // own minHeight:200 risks tipping the scroll container into a
        // borderline-scrollable state on short viewports, and the one-shot
        // scroll-to-bottom on mount would react to that with a visible jump.
        <VStack
          width="100%"
          data-testid="empty-room-welcome"
          style={{
            alignSelf: "flex-end",
            // ChatLayout's messageArea always reserves paddingBlockEnd:
            // spacing-6 below its content, with no prop to shrink it. Pulling
            // this block up with a negative margin is the only way to close
            // that gap without touching ChatLayout itself.
            marginBlockEnd: "calc(var(--spacing-4) * -1)",
          }}
        >
          {showRoomStarters && canEditRoom ? (
            <EmptyRoomStart onPrefill={prefillComposer} />
          ) : null}
        </VStack>
        }
      >
        {feedItems.length > 0 ? (
        <ChatMessageList
          // ChatMessageList's own inline padding stacks on top of
          // messageArea's (16px under density="spacious"), while the
          // composer's dockInner adds none on top of the dock's -- so any
          // ChatMessageList density here is 16px too narrow at minimum
          // ("compact"'s own 12px, the smallest option, still adds up to
          // 28px total against the composer's 16px). The negative margin
          // below cancels compact's own 12px exactly, landing the message
          // content flush with messageArea's 16px inset -- the same as the
          // composer's. `gap` overrides only the row spacing.
          density="compact"
          gap={3}
          style={{ marginInline: "calc(var(--spacing-3) * -1)" }}
          aria-label={`${roomName} conversation`}
        >
          {feedItems.map((item, index) => {
            const previousItem = feedItems[index - 1];
            const startsNewFeedDay =
              !previousItem ||
              dayKeyFromIso(previousItem.createdAt) !==
                dayKeyFromIso(item.createdAt);

            // A design turn renders its own prompt + reply bubbles, blended
            // into the feed by time.
            if (item.type === "turn") {
              return (
                <Fragment key={`turn-${item.turn.taskId}`}>
                  {startsNewFeedDay ? (
                    <Divider
                      label={
                        <Text type="supporting">
                          {formatDayFromIso(item.createdAt)}
                        </Text>
                      }
                    />
                  ) : null}
                  <DesignTurnBubbles
                    turn={item.turn}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    screenById={designScreenById}
                    tokenCss={designTokenCss}
                    componentCss={designComponentCss}
                    onPreview={openDesignPreview}
                    onCancel={() =>
                      item.turn.taskIds.forEach(cancelDesignGeneration)
                    }
                  />
                </Fragment>
              );
            }

            const message = item.message;
            // The nearest previous *message* (skipping turns) -- the PRD
            // question/answer pairing below only collapses when they're
            // directly adjacent, which a turn between them breaks.
            const previousMessage =
              previousItem?.type === "message"
                ? previousItem.message
                : undefined;
            const startsNewDay = startsNewFeedDay;
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
            const linkedTask = taskStatuses.get(message.id);
            const pendingTask =
              message.authorType === "human" ||
              proposedAction?.kind === "prd_generate" ||
              proposedAction?.kind === "prd_revise"
                ? linkedTask
                : undefined;
            const optimisticPrdTask =
              optimisticPrdProposalTasks.get(message.id);
            const figmaReferences =
              figmaReferencesByMessageId.get(message.id) ?? [];
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
                  <Text type="supporting">{formatMessageDay(message)}</Text>
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
                      <MessageAttachments attachments={message.attachments} />
                    ) : null}
                    {figmaReferences.length > 0 ? (
                      <VStack gap={1} width="100%">
                        {figmaReferences.map((reference) => (
                          <FigmaReferenceCard
                            key={reference.id}
                            reference={reference}
                            canEdit={canEditRoom}
                            onRefreshed={handleDesignReferenceRefreshed}
                            onRemoved={handleDesignReferenceRemoved}
                          />
                        ))}
                      </VStack>
                    ) : null}
                    {pendingTask?.kind === "prd_revise" &&
                    pendingTask.status === "completed" ? (
                      <Text type="supporting">
                        Document updated. The requested changes are now applied.
                      </Text>
                    ) : pendingTask?.kind === "prd_generate" &&
                      pendingTask.status === "completed" ? (
                      <Text type="supporting">
                        Document created. The new document is ready.
                      </Text>
                    ) : pendingTask ? (
                      <AgentTaskState
                        taskKind={
                          pendingTask.kind === "prd_generate" ||
                          pendingTask.kind === "prd_revise"
                            ? pendingTask.kind
                            : "room_reply"
                        }
                        status={pendingTask.status}
                        provider={pendingTask.provider}
                        agentKind={pendingTask.agentKind}
                        startedAt={pendingTask.createdAt}
                        onCancel={() =>
                          void handleCancelTask(pendingTask.taskId)
                        }
                        onReconnect={handleAgentSetupRecovery}
                        onFixConnection={handleAgentSetupRecovery}
                        onAskAgain={() =>
                          fillComposerWithQuestion(message.body)
                        }
                        onRetry={
                          pendingTask.kind === "prd_revise"
                            ? () =>
                                void handleRevisePrd(
                                  message.id,
                                  message.aiTaskId ?? "",
                                )
                            : undefined
                        }
                      />
                    ) : optimisticPrdTask ? (
                      <AgentActivity
                        status="queued"
                        kind={optimisticPrdTask.kind}
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
      )}
      {/* The one composer. In the expanded dock its field frame flattens into
       * the shared surface; collapsed, it keeps its standalone edge.
       *
       * On a full page it is capped and centred rather than run edge to edge:
       * a composer the width of a wide monitor puts its send button a screen
       * away from the text you just typed, and the messages above it are
       * already a centred column. Same cap as the dock, so the control does
       * not change size when the conversation changes surface. */}
      {isDocked ? (
        isConversationPage ? (
          <VStack
            width="100%"
            style={{
              maxInlineSize: "var(--meld-dock-width)",
              marginInline: "auto",
              paddingBlockEnd: "var(--meld-space-3)",
              paddingInline: "var(--meld-space-3)",
            }}
          >
            {composer}
          </VStack>
        ) : (
          composer
        )
      ) : null}
      <style jsx global>{`
        /* ChatLayout always mounts its frosted-glass composer backdrop, even
         * when the composer slot is null. The Room composer lives outside
         * ChatLayout, so that layer only blurs the newest messages. */
        .room-conversation > :nth-child(2) > :nth-child(2) {
          display: none;
        }

        .conversation-pixel-canvas {
          background-color: var(--color-background-body);
          background-image: url("/room-conversation-pixel-pattern.svg");
          background-position: center top;
          background-repeat: repeat;
          background-size: calc(var(--spacing-12) * 2);
        }

        .conversation-pixel-canvas > :first-child {
          background-color: transparent;
        }

        .conversation-pixel-canvas > :nth-child(2) {
          background: transparent;
        }

        .conversation-pixel-canvas > :nth-child(2) > :nth-child(2) {
          display: none;
        }
      `}</style>
    </>
  );
}
