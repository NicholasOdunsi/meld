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
import type { PRDDocument, Provider } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { WaveText } from "@/ui/wave-text";
import {
  acceptPrdVersion,
  applyPrdProposal,
  discardPrdProposal,
  listPrdProposals,
  revisePrdSection,
} from "../actions";
import { prdDocumentFileName, prdDocumentToMarkdown } from "../prd-markdown";
import { resolvePrdSelection, type PrdSelection } from "../prd-selection";
import { diffPrdSection } from "../prd-section-diff";
import { PRD_SECTIONS, isSectionEmpty, type PrdSectionKind } from "../prd-sections";
import type { PrdProposal, RoomPrd } from "../schemas";
import { useRoomTaskStatus } from "./room-task-status-provider";
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
  isSuperseded = false,
}: {
  kind: PrdSectionKind;
  value: PRDDocument[keyof PRDDocument];
  basePath: string;
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
          style={reviewStyle}
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
    case "mvp":
      return (
        <HStack
          gap={4}
          width="100%"
          align="start"
          style={reviewStyle}
        >
          <List
            density="compact"
            listStyle="disc"
            header={<Text type="label">Included</Text>}
          >
            {(value as PRDDocument["mvpScope"]).included.map(
              (item, index) => (
                <ListItem
                  key={`${index}-${item}`}
                  label={<Text>{item}</Text>}
                />
              ),
            )}
          </List>
          <List
            density="compact"
            listStyle="disc"
            header={<Text type="label">Excluded</Text>}
          >
            {(value as PRDDocument["mvpScope"]).excluded.map(
              (item, index) => (
                <ListItem
                  key={`${index}-${item}`}
                  label={<Text>{item}</Text>}
                />
              ),
            )}
          </List>
        </HStack>
      );
    case "risks":
      return (
        <List density="compact" style={reviewStyle}>
          {(value as PRDDocument["risksAndMitigations"]).map(
            (risk, index) => (
              <ListItem
                key={`${index}-${risk.risk}`}
                label={<Text type="label">{risk.risk}</Text>}
                description={<Text color="secondary">{risk.mitigation}</Text>}
              />
            ),
          )}
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
  }
}

export type PrdDocumentProps = {
  prd: RoomPrd;
  ownerName: string;
  basePath: string;
  history: RoomPrd[];
  canEdit: boolean;
  canAccept: boolean;
};

function mergePrdHistory(history: RoomPrd[], incoming: RoomPrd) {
  const versions = new Map(history.map((version) => [version.id, version]));
  versions.set(incoming.id, incoming);
  return [...versions.values()].sort((left, right) => right.version - left.version);
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
}: PrdDocumentProps) {
  const router = useRouter();
  const toast = useToast();
  const roomTaskStatus = useRoomTaskStatus();
  const setPrdStatus = roomTaskStatus?.setPrdStatus;
  const editorRef = useRef<PrdEditorHandle>(null);
  const [currentPrd, setCurrentPrd] = useState(prd);
  const [currentHistory, setCurrentHistory] = useState(history);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeSelection, setActiveSelection] = useState<{
    selection: PrdSelection;
    anchor: { top: number; left: number };
  } | null>(null);
  const [isAcceptanceOpen, setIsAcceptanceOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<PrdProposal[]>([]);
  const [proposalActionId, setProposalActionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadProposals = async () => {
      const next = await listPrdProposals(prd.roomId);
      if (active) setProposals(next);
    };
    void loadProposals();
    const interval = window.setInterval(() => void loadProposals(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [prd.roomId]);

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
    if (!isEditing && prd.version >= currentPrd.version) {
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
      isEditing || !isSectionEmpty(section.kind, currentPrd.document[section.field]),
  ).map((section) => ({
    id: section.id,
    label: section.label,
  }));
  const lastAcceptedVersion = currentHistory.find(
    (version) => version.status === "accepted",
  )?.version;

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

  function handleDocumentMouseUp() {
    window.requestAnimationFrame(() => {
      const selection = resolvePrdSelection(window.getSelection());
      if (!selection) {
        setActiveSelection(null);
        return;
      }
      const range = window.getSelection()?.getRangeAt(0);
      if (!range) return;
      const rect = range.getBoundingClientRect();
      setActiveSelection({
        selection,
        anchor: { top: rect.bottom, left: rect.left },
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

  async function handleSectionAsk(
    instruction: string,
    selection: PrdSelection,
  ) {
    const section = PRD_SECTIONS.find((candidate) => candidate.field === selection.field);
    if (!section) return;
    const result = await revisePrdSection({
      roomId: currentPrd.roomId,
      field: selection.field,
      sectionLabel: section.label,
      instruction,
      quotedText: selection.quotedText,
    });
    if (result.status === "queued") {
      roomTaskStatus?.notifyQueued({ kind: "prd_section_revise", taskId: result.taskId });
      toast({ type: "info", body: "The Product Agent is preparing a proposal for this section." });
      setActiveSelection(null);
    } else {
      toast({ type: "error", body: result.message });
    }
  }

  async function handleApplyProposal(proposal: PrdProposal) {
    setProposalActionId(proposal.id);
    const result = await applyPrdProposal({
      roomId: currentPrd.roomId,
      proposalId: proposal.id,
    });
    if (result.status === "applied") {
      setCurrentPrd(result.prd);
      setCurrentHistory((current) => mergePrdHistory(current, result.prd));
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      toast({ type: "info", body: "The Product Agent proposal was applied." });
    } else {
      toast({ type: "error", body: result.message });
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
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      toast({ type: "info", body: "The Product Agent proposal was discarded." });
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
      width="100%"
      height="100%"
      vAlign="start"
      onMouseUp={isEditing ? undefined : handleDocumentMouseUp}
      style={{ overflowY: "auto", overflowX: "hidden" }}
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
                !isSectionEmpty(section.kind, currentPrd.document[section.field]),
            ).map((section) => {
              const proposal = proposals.find(
                (candidate) => candidate.sectionField === section.field,
              );
              const diff = proposal?.proposedValue === null || !proposal
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
                  data-prd-section-field={section.field}
                >
                  <Heading level={3}>{section.label}</Heading>
                  <SectionBody
                    kind={section.kind}
                    value={currentPrd.document[section.field]}
                    basePath={basePath}
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
          selection={activeSelection.selection}
          anchor={activeSelection.anchor}
          onAsk={(instruction, selection) => void handleSectionAsk(instruction, selection)}
          onClose={() => setActiveSelection(null)}
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
        padding={3}
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
        <VStack gap={4} padding={3} width="100%">
          {acceptanceError ? <Banner status="error" title={acceptanceError} /> : null}
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
