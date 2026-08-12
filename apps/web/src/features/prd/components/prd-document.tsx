"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { Link } from "@boxicons/react/Link";
import type {
  PRDDocument,
  PrdAssistScopeSection,
  Provider,
} from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import { getAgentReadiness } from "@/features/rooms/actions";
import { useRoomRouting } from "@/features/rooms/components/use-room-routing";
import { WaveText } from "@/ui/wave-text";
import {
  acceptPrdVersion,
  applyPrdProposal,
  assistPrdSection,
  discardPrdProposal,
  dismissPrdAssistRequest,
  getPrdAssistRequest,
  listPrdProposals,
  revisePrdSection,
} from "../actions";
import { prdAssistOutcome } from "../prd-assist-outcome";
import { prdDocumentFileName, prdDocumentToMarkdown } from "../prd-markdown";
import { resolvePrdSelection } from "../prd-selection";
import { diffPrdSection } from "../prd-section-diff";
import {
  PRD_SECTIONS,
  isSectionEmpty,
  type PrdSectionKind,
} from "../prd-sections";
import type { PrdAssistRequest, PrdProposal, RoomPrd } from "../schemas";
import { useRoomTaskStatus } from "./room-task-status-provider";
import { FlowPreview, type FlowExpandTarget } from "./flow-preview";
import { PrdEditor, type PrdEditorHandle } from "./prd-editor";
import { PrdHeader, PrdHeaderActions } from "./prd-header";
import { PrdOutlineRail } from "./prd-outline-rail";
import { PrdProposalCard } from "./prd-proposal-card";
import { PrdSelectionComposer } from "./prd-selection-composer";
import { PrdVersionHistory } from "./prd-version-history";

function SectionBody({
  kind,
  value,
  basePath,
  flowExpand = { mode: "dialog" },
  isSuperseded = false,
}: {
  kind: PrdSectionKind;
  value: PRDDocument[keyof PRDDocument];
  basePath: string;
  flowExpand?: FlowExpandTarget;
  isSuperseded?: boolean;
}) {
  const reviewStyle = isSuperseded
    ? { textDecoration: "line-through" }
    : undefined;
  switch (kind) {
    case "prose":
      return (
        <Markdown
          density="compact"
          contentWidth="100%"
          style={{ ...proseMarkdownStyle(value as string), ...reviewStyle }}
        >
          {value as string}
        </Markdown>
      );
    case "list":
      return (
        <List density="compact" listStyle="disc" style={reviewStyle}>
          {(value as string[]).map((item, index) => (
            <ListItem key={`${index}-${item}`} label={<Text>{item}</Text>} />
          ))}
        </List>
      );
    case "mvp": {
      const scope = value as PRDDocument["mvpScope"];
      return (
        <VStack gap={4} width="100%" align="start" style={reviewStyle}>
          {scope.included.length > 0 ? (
            <List
              density="compact"
              listStyle="disc"
              header={<Text type="label">Included</Text>}
            >
              {scope.included.map((item, index) => (
                <ListItem
                  key={`${index}-${item}`}
                  label={<Text>{item}</Text>}
                />
              ))}
            </List>
          ) : null}
          {scope.excluded.length > 0 ? (
            <List
              density="compact"
              listStyle="disc"
              header={<Text type="label">Excluded</Text>}
            >
              {scope.excluded.map((item, index) => (
                <ListItem
                  key={`${index}-${item}`}
                  label={<Text>{item}</Text>}
                />
              ))}
            </List>
          ) : null}
        </VStack>
      );
    }
    case "risks":
      return (
        <List density="compact" style={reviewStyle}>
          {(value as PRDDocument["risksAndMitigations"]).map((risk, index) => (
            <ListItem
              key={`${index}-${risk.risk}`}
              label={<Text type="label">{risk.risk}</Text>}
              description={<Text color="secondary">{risk.mitigation}</Text>}
            />
          ))}
        </List>
      );
    case "decisions":
      return (
        <VStack gap={4} width="100%" style={reviewStyle}>
          {(value as PRDDocument["decisionHistory"]).map(
            (decision, decisionIndex) => (
              <VStack
                key={`${decisionIndex}-${decision.decision}`}
                gap={1}
                width="100%"
              >
                <Text type="label">{decision.decision}</Text>
                <Text color="secondary">{decision.rationale}</Text>
                <HStack gap={2}>
                  {decision.sourceMessageIds.map((messageId, index) => (
                    <Token
                      key={messageId}
                      label={`Source ${index + 1}`}
                      color="blue"
                      icon={<Link pack="basic" size="sm" />}
                      href={`${basePath}?tab=conversation#message-${messageId}`}
                    />
                  ))}
                </HStack>
              </VStack>
            ),
          )}
        </VStack>
      );
    case "flow": {
      // Generation and older PRDs still land prose here; render that as text
      // rather than dropping it, and show the expandable preview only when the
      // journey is an actual flow document.
      const journeys = value as PRDDocument["userJourneys"];
      if (!journeys) return null;
      if (typeof journeys === "string") {
        return (
          <Markdown
            density="compact"
            contentWidth="100%"
            style={{ ...proseMarkdownStyle(journeys), ...reviewStyle }}
          >
            {journeys}
          </Markdown>
        );
      }
      return <FlowPreview flow={journeys} expand={flowExpand} />;
    }
  }
}

export type PrdDocumentProps = {
  prd: RoomPrd;
  ownerName: string;
  basePath: string;
  history: RoomPrd[];
  canEdit: boolean;
  canAccept: boolean;
  // How the User-journeys "Expand" control behaves, decided by the room page
  // from the surface state and the viewer's canvas access. Defaults to the
  // self-contained dialog when the room doesn't pass one.
  flowExpand?: FlowExpandTarget;
  agentReadiness?: AgentReadiness;
  fetchReadiness?: () => Promise<AgentReadiness>;
  pollIntervalMs?: number;
};

function mergePrdHistory(history: RoomPrd[], incoming: RoomPrd) {
  const versions = new Map(history.map((version) => [version.id, version]));
  versions.set(incoming.id, incoming);
  return [...versions.values()].sort(
    (left, right) => right.version - left.version,
  );
}

// A draft save updates the existing row in place, so its version can stay the
// same while `updatedAt` advances. A server prop with the same version is only
// safe to adopt when it is newer than the local state; otherwise a stale parent
// render would erase a just-saved document when edit mode closes.
function isPrdNewerThanCurrent(incoming: RoomPrd, current: RoomPrd): boolean {
  if (incoming.version !== current.version) {
    return incoming.version > current.version;
  }
  return incoming.updatedAt > current.updatedAt;
}

// How often the document re-reads room proposals and its own in-flight assist
// request. Injectable for the same reason RoomTaskStatusProvider's
// taskPollIntervalMs is: a test that has to prove a transition between two
// polls cannot afford to wait two real seconds for each one.
const DEFAULT_POLL_INTERVAL_MS = 2_000;

// What is left of the reader's own requests after a refresh. Deliberately one
// compact, non-blocking row rather than several reopened popovers: the
// exchange itself lives in Conversation, and this is only the pointer back to
// it -- or the note that one is still running.
function AssistRecoveryNotice({
  requests,
  basePath,
  onDismiss,
}: {
  requests: PrdAssistRequest[];
  basePath: string;
  onDismiss: () => void;
}) {
  if (requests.length === 0) return null;
  const isWorking = requests.some(
    (request) => prdAssistOutcome(request) === "pending",
  );
  return (
    <Banner
      status="info"
      title={
        requests.length === 1
          ? "You have 1 earlier Product Agent request"
          : `You have ${requests.length} earlier Product Agent requests`
      }
      description={
        isWorking
          ? `Still working on “${requests[0].instruction}”`
          : `“${requests[0].instruction}” has a reply waiting in Conversation.`
      }
      endContent={
        <HStack gap={2} wrap="wrap">
          <Button
            label="Open in Conversation"
            size="sm"
            variant="secondary"
            href={`${basePath}?tab=conversation`}
          />
          <Button
            size="sm"
            variant="secondary"
            label="Dismiss"
            onClick={onDismiss}
          />
        </HStack>
      }
    />
  );
}

function alternateProvider(provider: Provider): Provider {
  return provider === "claude" ? "codex" : "claude";
}

function providerLabel(provider: Provider): string {
  return provider === "claude" ? "Claude" : "Codex";
}

function proposalRetryProvider(proposal: PrdProposal): Provider {
  return proposal.errorMessage?.toLowerCase().includes("usage limit")
    ? alternateProvider(proposal.provider)
    : proposal.provider;
}

const orderedMarkdownStyle = {
  // Astryx's decimal marker reserves spacing-4; the two-digit marker plus its
  // period needs the next token size or the period wraps onto its own line.
  "--spacing-4": "var(--spacing-5)",
} as CSSProperties;

function proseMarkdownStyle(value: string): CSSProperties | undefined {
  return /^\s*\d+\.\s+/m.test(value) ? orderedMarkdownStyle : undefined;
}

const relaxedAcceptanceSubtitleLineHeight = {
  "--text-body-leading": "1.5",
} as CSSProperties;

const acceptanceTitleSubtitleGap =
  ".meld-prd-accept-dialog h2 + span { margin-top: var(--spacing-2); display: block; }";

export function PrdDocument({
  prd,
  ownerName,
  basePath,
  history,
  canEdit,
  canAccept,
  flowExpand = { mode: "dialog" },
  agentReadiness,
  fetchReadiness = getAgentReadiness,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: PrdDocumentProps) {
  const router = useRouter();
  const toast = useToast();
  const roomTaskStatus = useRoomTaskStatus();
  const setPrdStatus = roomTaskStatus?.setPrdStatus;
  const editorRef = useRef<PrdEditorHandle>(null);
  const documentScrollRef = useRef<HTMLDivElement>(null);
  const [currentPrd, setCurrentPrd] = useState(prd);
  const [currentHistory, setCurrentHistory] = useState(history);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeSelection, setActiveSelection] = useState<{
    sections: PrdAssistScopeSection[];
    anchor: { top: number; left: number };
  } | null>(null);
  // The request this popover submitted. The id drives the poll; the row is
  // what the popover renders, and its outcome is derived, never guessed.
  const [assistRequestId, setAssistRequestId] = useState<string | null>(null);
  const [assistRequest, setAssistRequest] = useState<PrdAssistRequest | null>(
    null,
  );
  const [isQueueingAssist, setIsQueueingAssist] = useState(false);
  const [isAcceptanceOpen, setIsAcceptanceOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<PrdProposal[]>([]);
  const [proposalActionId, setProposalActionId] = useState<string | null>(null);
  // Why the server refused to apply a proposal, kept per proposal so the
  // reason stays on the card instead of disappearing with its toast.
  const [proposalConflicts, setProposalConflicts] = useState<
    Record<string, string>
  >({});
  const [clientAgentReadiness, setClientAgentReadiness] =
    useState<AgentReadiness>();
  const resolvedAgentReadiness = agentReadiness ?? clientAgentReadiness;
  const { routing, choose } = useRoomRouting({
    roomId: currentPrd.roomId,
    readiness: resolvedAgentReadiness,
  });

  // The server render supplies readiness when it can. A client read recovers
  // the picker when that request fails without delaying the rest of the PRD.
  useEffect(() => {
    if (agentReadiness !== undefined) return;
    let active = true;
    fetchReadiness()
      .then((resolved) => {
        if (active) setClientAgentReadiness(resolved);
      })
      .catch(() => {
        // The PRD remains usable while provider readiness is unavailable.
      });
    return () => {
      active = false;
    };
  }, [agentReadiness, fetchReadiness]);

  useEffect(() => {
    let active = true;
    const loadProposals = async () => {
      const next = await listPrdProposals(prd.roomId);
      if (active) setProposals(next);
    };
    void loadProposals();
    const interval = window.setInterval(
      () => void loadProposals(),
      pollIntervalMs,
    );
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, prd.roomId]);

  // Poll the one request this popover submitted until it settles.
  // prd_assist_requests is not in the Realtime publication, so a poll is the
  // only way to learn the outcome; it stops as soon as there is one.
  useEffect(() => {
    const requestId = assistRequestId;
    if (!requestId) return;
    let active = true;
    let interval = 0;
    const read = async () => {
      const next = await getPrdAssistRequest({
        roomId: currentPrd.roomId,
        requestId,
      });
      if (!active || !next) return;
      setAssistRequest(next);
      if (prdAssistOutcome(next) !== "pending") {
        active = false;
        window.clearInterval(interval);
      }
    };
    void read();
    interval = window.setInterval(() => void read(), pollIntervalMs);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [assistRequestId, currentPrd.roomId, pollIntervalMs]);

  // An edit-only outcome has nothing to say in the popover: its proposal is
  // already rendering in the section it targets.
  const isEditOutcome =
    assistRequest !== null && prdAssistOutcome(assistRequest) === "edit";
  useEffect(() => {
    if (isEditOutcome) closeSelection();
    // closeSelection is recreated every render; the outcome flag is what
    // should drive this, and it only flips once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditOutcome]);

  useEffect(() => {
    setPrdStatus?.(currentPrd.status);
  }, [currentPrd.status, setPrdStatus]);

  // Sync server-refreshed props (new `prd`/`history` after router.refresh) into
  // the locally-merged state during render. This is React's recommended
  // alternative to prop-syncing effects: track the last-seen prop and reconcile
  // when it changes, preserving optimistic local edits.
  const [seenPrd, setSeenPrd] = useState(prd);
  const [seenIsEditing, setSeenIsEditing] = useState(isEditing);
  if (seenPrd !== prd || seenIsEditing !== isEditing) {
    setSeenPrd(prd);
    setSeenIsEditing(isEditing);
    if (!isEditing && isPrdNewerThanCurrent(prd, currentPrd)) {
      setCurrentPrd(prd);
    }
  }

  const [seenHistory, setSeenHistory] = useState(history);
  if (seenHistory !== history) {
    setSeenHistory(history);
    setCurrentHistory((current) =>
      history.reduce(
        (merged, version) =>
          merged.some(
            (existing) =>
              existing.id === version.id && existing.status === "accepted",
          )
            ? merged
            : mergePrdHistory(merged, version),
        current,
      ),
    );
  }

  // While editing, every section has an anchor (collapsed ones show a "+ Add"
  // placeholder). While reading, empty sections aren't rendered at all, so
  // the outline should skip them too rather than jumping to nothing.
  const outlineItems = PRD_SECTIONS.filter(
    (section) =>
      isEditing ||
      !isSectionEmpty(section.kind, currentPrd.document[section.field]),
  ).map((section) => ({
    id: section.id,
    label: section.label,
  }));
  const lastAcceptedVersion = currentHistory.find(
    (version) => version.status === "accepted",
  )?.version;
  // Queued, but the first poll has not landed yet. The popover shows the same
  // working label either way, so the surface does not flicker.
  const isAwaitingFirstRead =
    assistRequestId !== null && assistRequest === null;
  // Read once on mount, so it never contains a request this popover submitted
  // -- those are polled directly and rendered in the popover itself.
  const recoveredAssistRequests = roomTaskStatus?.assistRequests ?? [];

  function handleSaved(savedPrd: RoomPrd) {
    setCurrentPrd(savedPrd);
    setCurrentHistory((current) => mergePrdHistory(current, savedPrd));
  }

  async function handleCopyDocument() {
    try {
      await navigator.clipboard.writeText(
        prdDocumentToMarkdown(currentPrd.document),
      );
      toast({ type: "info", body: "Copied the PRD to your clipboard." });
    } catch {
      toast({ type: "error", body: "Could not copy the PRD." });
    }
  }

  function handleExport() {
    const blob = new Blob([prdDocumentToMarkdown(currentPrd.document)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = prdDocumentFileName(currentPrd.document.title);
    link.click();
    URL.revokeObjectURL(url);
  }

  // Clears the request half of the popover, closing a settled one on the
  // reader's recovery list as it goes. A request still running is left alone:
  // it will settle on its own, and dismissing it would throw the result away.
  function releaseAssistRequest() {
    if (assistRequest && prdAssistOutcome(assistRequest) !== "pending") {
      void dismissPrdAssistRequest({
        roomId: currentPrd.roomId,
        requestId: assistRequest.id,
      });
      roomTaskStatus?.forgetAssistRequest(assistRequest.id);
    }
    setAssistRequestId(null);
    setAssistRequest(null);
    setIsQueueingAssist(false);
  }

  function closeSelection() {
    releaseAssistRequest();
    setActiveSelection(null);
  }

  function handleDocumentMouseUp() {
    window.requestAnimationFrame(() => {
      const selection = window.getSelection();
      const sections = resolvePrdSelection(selection);
      if (!sections) {
        closeSelection();
        return;
      }
      const range = selection?.getRangeAt(0);
      if (!range) return;
      const rect = range.getBoundingClientRect();
      const scrollSurface = documentScrollRef.current;
      if (!scrollSurface) return;
      const scrollRect = scrollSurface.getBoundingClientRect();
      releaseAssistRequest();
      setActiveSelection({
        sections,
        anchor: {
          top: rect.bottom - scrollRect.top + scrollSurface.scrollTop,
          left: rect.left - scrollRect.left + scrollSurface.scrollLeft,
        },
      });
    });
  }

  async function handleAccept() {
    if (!canAccept || currentPrd.status !== "draft" || isAccepting) return;
    setIsAccepting(true);
    setAcceptanceError(null);
    try {
      const result = await acceptPrdVersion({
        roomId: currentPrd.roomId,
        prdId: currentPrd.id,
      });
      if (result.status === "accepted") {
        setCurrentPrd(result.prd);
        setCurrentHistory((current) => mergePrdHistory(current, result.prd));
        setIsAcceptanceOpen(false);
        return;
      }
      setAcceptanceError(result.message);
    } catch {
      setAcceptanceError("Could not accept the PRD version.");
    } finally {
      setIsAccepting(false);
    }
  }

  // One natural-language request against the frozen selection. Nothing here
  // reads the instruction: whether it is a question, a change, or too
  // ambiguous to act on is the Product Agent's classification, not the UI's.
  async function handleSectionAsk(
    instruction: string,
    provider?: Provider,
    model?: string,
  ) {
    const sections = activeSelection?.sections;
    if (!sections) return;
    // Whatever this submission replaces -- a clarifying question just
    // answered, or a failure being retried -- is closed rather than left on
    // the recovery list.
    releaseAssistRequest();
    setIsQueueingAssist(true);
    const result = await assistPrdSection({
      roomId: currentPrd.roomId,
      clientRequestId: crypto.randomUUID(),
      sections: sections.map((section) => ({
        field: section.field,
        sectionLabel: section.label,
        quotedText: section.quotedText,
      })),
      instruction,
      provider,
      model,
    });
    setIsQueueingAssist(false);
    if (result.status === "queued") {
      roomTaskStatus?.notifyQueued({
        kind: "prd_section_assist",
        taskId: result.taskId,
      });
      setAssistRequestId(result.requestId);
    } else {
      toast({ type: "error", body: result.message });
    }
  }

  function handleAssistRetry(provider: Provider) {
    const instruction = assistRequest?.instruction;
    if (!instruction) return;
    void handleSectionAsk(instruction, provider);
  }

  function handleForgetRecoveredRequest(request: PrdAssistRequest) {
    void dismissPrdAssistRequest({
      roomId: currentPrd.roomId,
      requestId: request.id,
    });
    roomTaskStatus?.forgetAssistRequest(request.id);
  }

  async function handleApplyProposal(proposal: PrdProposal) {
    setProposalActionId(proposal.id);
    // Whatever the last attempt said is about the last attempt. Clearing it
    // here keeps the card from showing a reason that a retry may already have
    // disproved.
    setProposalConflicts((current) => {
      if (!(proposal.id in current)) return current;
      const next = { ...current };
      delete next[proposal.id];
      return next;
    });
    const result = await applyPrdProposal({
      roomId: currentPrd.roomId,
      proposalId: proposal.id,
    });
    if (result.status === "applied") {
      setCurrentPrd(result.prd);
      setCurrentHistory((current) => mergePrdHistory(current, result.prd));
      setProposals((current) =>
        current.filter((item) => item.id !== proposal.id),
      );
      toast({ type: "info", body: "The Product Agent proposal was applied." });
    } else {
      // apply_prd_proposal rechecks the frozen base value, so a refusal here
      // is the authority on staleness. Keep the reason beside the suggestion
      // rather than letting a toast carry it away.
      setProposalConflicts((current) => ({
        ...current,
        [proposal.id]: result.message,
      }));
    }
    setProposalActionId(null);
  }

  async function handleDiscardProposal(proposal: PrdProposal) {
    setProposalActionId(proposal.id);
    const result = await discardPrdProposal({
      roomId: currentPrd.roomId,
      proposalId: proposal.id,
    });
    if (result.status === "discarded") {
      setProposals((current) =>
        current.filter((item) => item.id !== proposal.id),
      );
      toast({
        type: "info",
        body: "The Product Agent proposal was discarded.",
      });
    } else {
      toast({ type: "error", body: result.message });
    }
    setProposalActionId(null);
  }

  async function handleRetryProposal(proposal: PrdProposal) {
    const provider = proposalRetryProvider(proposal);
    setProposalActionId(proposal.id);
    const result = await revisePrdSection({
      roomId: currentPrd.roomId,
      field: proposal.sectionField,
      sectionLabel: proposal.sectionLabel,
      instruction: proposal.instruction,
      quotedText: proposal.quotedText,
      provider,
    });
    if (result.status === "queued") {
      roomTaskStatus?.notifyQueued({
        kind: "prd_section_revise",
        taskId: result.taskId,
      });
      toast({
        type: "info",
        body: `${providerLabel(provider)} is preparing a new proposal.`,
      });
    } else {
      toast({ type: "error", body: result.message });
    }
    setProposalActionId(null);
  }

  return (
    <HStack
      ref={documentScrollRef}
      width="100%"
      height="100%"
      vAlign="start"
      onMouseUp={isEditing ? undefined : handleDocumentMouseUp}
      style={{
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
      }}
      data-testid="prd-document-scroll-container"
    >
      <VStack
        align="center"
        width="100%"
        style={{
          minWidth: "var(--spacing-0)",
          padding: "var(--spacing-8) var(--spacing-6)",
        }}
      >
        {/* Full-width, unlike the maxWidth column below -- so the actions can
            sit flush with the pane's right edge instead of clamping to the
            body's reading width. Rendered first so it's the first thing on
            the page, ahead of the metadata/title. Edit/Accept morph in place
            into Cancel/Save (routed to PrdEditor's imperative handle) while
            editing, in the same bar and position -- not swapped out for a
            differently laid out toolbar -- so the overflow menu also stays
            put and reachable instead of disappearing mid-edit. */}
        <PrdHeaderActions
          status={currentPrd.status}
          canEdit={canEdit}
          canAccept={canAccept}
          isDirty={isDirty}
          isEditing={isEditing}
          isSaving={isSaving}
          onEdit={() => setIsEditing(true)}
          onCancel={() => editorRef.current?.cancel()}
          onSave={() => editorRef.current?.save()}
          onHistory={() => setIsHistoryOpen(true)}
          onAccept={() => {
            setAcceptanceError(null);
            setIsAcceptanceOpen(true);
          }}
          onCopyDocument={handleCopyDocument}
          onExport={handleExport}
        />
        <VStack gap={6} width="100%" maxWidth="calc(var(--spacing-12) * 15)">
          <PrdHeader
            prd={currentPrd}
            ownerName={ownerName}
            isEditing={isEditing}
            lastAcceptedVersion={lastAcceptedVersion}
          />
          <AssistRecoveryNotice
            requests={recoveredAssistRequests}
            basePath={basePath}
            onDismiss={() =>
              recoveredAssistRequests.forEach(handleForgetRecoveredRequest)
            }
          />
          {isEditing ? (
            <PrdEditor
              ref={editorRef}
              initialPrd={currentPrd}
              canEdit={canEdit}
              onSaved={handleSaved}
              onCancel={() => {
                setIsDirty(false);
                setIsEditing(false);
              }}
              onDirtyChange={setIsDirty}
              onSavingChange={setIsSaving}
              onReviewLatest={() => {
                setIsDirty(false);
                setIsEditing(false);
                router.refresh();
              }}
            />
          ) : (
            PRD_SECTIONS.filter(
              (section) =>
                !isSectionEmpty(
                  section.kind,
                  currentPrd.document[section.field],
                ),
            ).map((section) => {
              // A view-only participant may ask, but a proposal is not theirs
              // to review: they can neither produce one nor apply anyone
              // else's, so showing the card -- or striking the section through
              // behind it -- would only describe an action they do not have.
              const proposal = canEdit
                ? proposals.find(
                    (candidate) => candidate.sectionField === section.field,
                  )
                : undefined;
              const diff =
                proposal?.proposedValue === null || !proposal
                  ? null
                  : diffPrdSection(
                      section.kind,
                      currentPrd.document[section.field],
                      proposal.proposedValue as PRDDocument[keyof PRDDocument],
                    );
              return (
                <VStack
                  key={section.id}
                  id={section.id}
                  gap={2}
                  width="100%"
                  // A flow document renders as an SVG diagram, not quotable
                  // prose, so it is left out of the text-selection assist scope.
                  // A prose journey stays quotable like any other prose section.
                  data-prd-section-field={
                    section.kind === "flow" &&
                    typeof currentPrd.document[section.field] === "object" &&
                    currentPrd.document[section.field] !== null
                      ? undefined
                      : section.field
                  }
                >
                  <Heading level={3}>{section.label}</Heading>
                  <SectionBody
                    kind={section.kind}
                    value={currentPrd.document[section.field]}
                    basePath={basePath}
                    flowExpand={flowExpand}
                    isSuperseded={proposal?.status === "ready" && diff !== null}
                  />
                  {proposal?.status === "pending" ? (
                    // The wave carries the ongoing-ness the ellipsis used to,
                    // and matches every other surface where the agent is
                    // working. WaveText rather than AgentActivity because a
                    // proposal's status is its own vocabulary (pending/ready/
                    // applied/discarded/failed), not an AITaskStatus.
                    <WaveText
                      text="Product Agent is preparing a proposal"
                      type="body"
                      color="secondary"
                    />
                  ) : null}
                  {proposal?.status === "failed" ? (
                    <Banner
                      status="error"
                      title="The Product Agent could not prepare this proposal"
                      description={
                        proposal.errorMessage ??
                        "The task did not complete. Try another provider."
                      }
                      endContent={
                        <Button
                          size="sm"
                          variant="secondary"
                          label={`Try with ${providerLabel(
                            proposalRetryProvider(proposal),
                          )}`}
                          isDisabled={proposalActionId === proposal.id}
                          onClick={() => void handleRetryProposal(proposal)}
                        />
                      }
                    />
                  ) : null}
                  {proposal?.status === "ready" && diff ? (
                    <PrdProposalCard
                      diff={diff}
                      onApply={() => void handleApplyProposal(proposal)}
                      onDiscard={() => void handleDiscardProposal(proposal)}
                      isBusy={proposalActionId === proposal.id}
                      conflictMessage={proposalConflicts[proposal.id] ?? null}
                    />
                  ) : null}
                </VStack>
              );
            })
          )}
        </VStack>
      </VStack>
      {activeSelection ? (
        <PrdSelectionComposer
          sections={activeSelection.sections}
          anchor={activeSelection.anchor}
          request={assistRequest}
          isSubmitting={isQueueingAssist || isAwaitingFirstRead}
          basePath={basePath}
          agentReadiness={resolvedAgentReadiness}
          routing={routing}
          onChoose={choose}
          onSubmit={(instruction, provider, model) =>
            void handleSectionAsk(instruction, provider, model)
          }
          onRetry={handleAssistRetry}
          onClose={closeSelection}
        />
      ) : null}
      <PrdOutlineRail items={outlineItems} />
      <PrdVersionHistory
        currentPrd={currentPrd}
        history={currentHistory}
        isOpen={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
      />
      <Dialog
        isOpen={isAcceptanceOpen}
        onOpenChange={setIsAcceptanceOpen}
        width="calc(var(--spacing-12) * 8)"
        purpose="required"
        data-purpose="required"
      >
        <style>{acceptanceTitleSubtitleGap}</style>
        <VStack
          className="meld-prd-accept-dialog"
          style={relaxedAcceptanceSubtitleLineHeight}
        >
          <DialogHeader
            title={`Record version v${currentPrd.version}?`}
            subtitle="This records the current state. You can continue editing after acceptance."
            onOpenChange={setIsAcceptanceOpen}
          />
        </VStack>
        <VStack gap={4} padding={4} width="100%">
          {acceptanceError ? (
            <Banner status="error" title={acceptanceError} />
          ) : null}
          <HStack gap={2} justify="end" wrap="wrap">
            <Button
              label="Cancel"
              variant="secondary"
              isDisabled={isAccepting}
              onClick={() => setIsAcceptanceOpen(false)}
            />
            <Button
              label="Record acceptance"
              variant="primary"
              isLoading={isAccepting}
              onClick={handleAccept}
            />
          </HStack>
        </VStack>
      </Dialog>
    </HStack>
  );
}
