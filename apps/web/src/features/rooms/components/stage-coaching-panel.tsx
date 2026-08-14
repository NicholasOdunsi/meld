"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StackItem } from "@astryxdesign/core/Stack";
// The floating card is positioned by this component (not the design-system
// Popover) so it reliably anchors above its bottom-right pill without relying on
// CSS anchor positioning.
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import {
  PixelCheck as Check,
  PixelChevronLeft as ChevronLeft,
  PixelChevronRight as ChevronRight,
  PixelX as X,
} from "@/ui/pixel-icons";
import type {
  DesignHandoffView,
  ManualChecklistItemKey,
  RoomStage,
} from "@meld/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setRoomChecklistItem, setRoomStage } from "../actions";
import { getRoomStagePresentation } from "../stage";
import {
  computeStageChecklist,
  type ChecklistItem,
  type StageReadinessSignals,
} from "../stage-readiness";
import { useRoomLifecycleRealtime } from "../use-room-lifecycle-realtime";
import { StageProgressRing } from "./stage-progress-ring";

const PANEL_WIDTH = 320;

function stageLabel(stage: RoomStage) {
  return getRoomStagePresentation(stage).label;
}

function formatHandoffTimestamp(createdAt: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

// A compact read of the immutable Design -> Development snapshot, in place of
// the live checklist once one exists -- the checklist's own signals (PRD
// status, design assets, decisions) keep moving after the handoff, but this
// summary is what actually carried across, frozen at the moment of the move.
function DevelopmentHandoffSummary({
  designHandoff,
  workspaceId,
  roomId,
}: {
  designHandoff: DesignHandoffView;
  workspaceId: string;
  roomId: string;
}) {
  const router = useRouter();
  const { manifest, startScreenId, profileVersionId, prdRevision, createdAt } =
    designHandoff;
  const screenCount = manifest.screens.length;
  const startScreen = manifest.screens.find(
    (screen) => screen.screenId === startScreenId,
  );
  const designSystemLabel = profileVersionId
    ? `Design system ${profileVersionId.slice(0, 8)}`
    : "Neutral default";

  return (
    <VStack gap={3} width="100%" data-testid="handoff-summary">
      <Text weight="medium">
        {screenCount} {screenCount === 1 ? "screen" : "screens"} handed off
      </Text>
      <VStack gap={1} width="100%">
        <HStack gap={2} width="100%">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              Start screen
            </Text>
          </StackItem>
          <Text>{startScreen ? startScreen.name : "Not set"}</Text>
        </HStack>
        <HStack gap={2} width="100%">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              Design system
            </Text>
          </StackItem>
          <Text>{designSystemLabel}</Text>
        </HStack>
        <HStack gap={2} width="100%">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              PRD
            </Text>
          </StackItem>
          <Text>
            {prdRevision !== null ? `PRD rev ${prdRevision}` : "No PRD yet"}
          </Text>
        </HStack>
      </VStack>
      <Text type="supporting" color="secondary" hasTabularNumbers>
        Handed off {formatHandoffTimestamp(createdAt)}
      </Text>
      <Button
        label="Preview prototype"
        variant="secondary"
        width="100%"
        data-testid="handoff-preview"
        onClick={() =>
          router.push(`/${workspaceId}/rooms/${roomId}?tab=prototype`)
        }
      />
    </VStack>
  );
}

// The circular marker at the head of each checklist row. Done rows read as a
// solid success check; pending manual rows get a dashed, tappable outline;
// pending auto rows a plain outline.
function ChecklistMarker({
  item,
  canToggle,
  isPending,
  onToggle,
}: {
  item: ChecklistItem;
  canToggle: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  const size = 20;
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "var(--radius-full)",
    display: "grid",
    placeItems: "center",
    flex: "none",
    marginTop: 1,
    boxSizing: "border-box",
  };
  const check = (
    <Icon icon={Check} size="xsm" color="inherit" label="Done" />
  );

  if (item.done) {
    const marker = (
      <span
        style={{
          ...base,
          background: "var(--color-success)",
          color: "var(--color-on-success)",
        }}
      >
        {check}
      </span>
    );
    // A confirmed manual item can be un-confirmed by an editor.
    if (item.manualKey && canToggle) {
      return (
        <button
          type="button"
          onClick={onToggle}
          disabled={isPending}
          aria-label={`Undo "${item.label}"`}
          style={{
            all: "unset",
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {marker}
        </button>
      );
    }
    return marker;
  }

  if (item.manualKey && canToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        aria-label={`Confirm "${item.label}"`}
        style={{
          ...base,
          border: "1.6px dashed var(--color-border-emphasized)",
          background: "transparent",
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.6 : 1,
        }}
      />
    );
  }

  return (
    <span
      style={{
        ...base,
        border: "1.6px solid var(--color-border-emphasized)",
      }}
    />
  );
}

export function StageCoachingPanel({
  roomId,
  workspaceId,
  projectId,
  roomName,
  ownerId,
  stage,
  updatedAt,
  stageReadiness,
  canEditChecklist,
  canChangeStage,
  realtimeMode,
  designHandoff,
}: {
  roomId: string;
  workspaceId: string;
  projectId: string;
  roomName: string;
  ownerId: string;
  stage: RoomStage;
  updatedAt: string;
  stageReadiness: StageReadinessSignals;
  canEditChecklist: boolean;
  canChangeStage: boolean;
  realtimeMode: "development-poll" | "production";
  designHandoff: DesignHandoffView | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const initialLifecycleRooms = useMemo(
    () => [
      {
        id: roomId,
        workspaceId,
        projectId,
        name: roomName,
        ownerId,
        stage,
        updatedAt,
      },
    ],
    [ownerId, projectId, roomId, roomName, stage, updatedAt, workspaceId],
  );
  const [lifecycleRoom] = useRoomLifecycleRealtime(
    { roomId },
    initialLifecycleRooms,
    realtimeMode === "production",
  );
  const liveStage = lifecycleRoom?.stage ?? stage;

  // Optimistic overlays so a tap or a move reflects instantly, ahead of the
  // server round-trip and the revalidated props catching up.
  const [manualOverride, setManualOverride] = useState<
    Partial<Record<ManualChecklistItemKey, boolean>>
  >({});
  const [pendingKey, setPendingKey] = useState<ManualChecklistItemKey | null>(
    null,
  );
  const [isMoving, setIsMoving] = useState(false);
  // Open on arrival so the coaching is visible without a click; a click, an
  // outside click, or Escape toggles it from there.
  const [isOpen, setIsOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // The panel is a light-dismiss floating surface: an outside click or Escape
  // closes it. Self-managed (rather than the design system Popover) so the card
  // reliably anchors above its bottom-right pill in every browser, instead of
  // depending on CSS anchor positioning support.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const checklist = useMemo(
    () =>
      computeStageChecklist(liveStage, {
        ...stageReadiness,
        manualChecks: { ...stageReadiness.manualChecks, ...manualOverride },
      }),
    [liveStage, stageReadiness, manualOverride],
  );

  async function toggleManual(item: ChecklistItem) {
    if (!item.manualKey || !canEditChecklist || pendingKey) return;
    const key = item.manualKey;
    const next = !item.done;
    setManualOverride((current) => ({ ...current, [key]: next }));
    setPendingKey(key);
    try {
      await setRoomChecklistItem({ roomId, itemKey: key, checked: next });
      router.refresh();
    } catch {
      setManualOverride((current) => {
        const reverted = { ...current };
        delete reverted[key];
        return reverted;
      });
      toast({
        type: "error",
        body: "Could not update that checklist item.",
        uniqueID: `room-checklist:${roomId}`,
      });
    } finally {
      setPendingKey(null);
    }
  }

  async function moveTo(target: RoomStage) {
    if (!canChangeStage || isMoving) return;
    setIsMoving(true);
    try {
      await setRoomStage({ roomId, stage: target });
      router.refresh();
    } catch {
      toast({
        type: "error",
        body: "Could not change the room stage.",
        uniqueID: `room-stage:${roomId}`,
      });
    } finally {
      setIsMoving(false);
    }
  }

  const pillLabel = checklist.isTerminal
    ? "Handoff"
    : checklist.isReady
      ? "Ready"
      : `${checklist.doneCount} / ${checklist.totalCount}`;

  const content = (
    <VStack gap={3} width="100%">
      <VStack gap={2} width="100%">
        <HStack gap={2} vAlign="center" width="100%">
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: "var(--radius-element)",
              background: "var(--color-background-muted)",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <Icon
              icon={getRoomStagePresentation(liveStage).icon}
              size="sm"
              color="secondary"
            />
          </span>
          <StackItem size="fill">
            <VStack gap={0}>
              <Text weight="semibold">{stageLabel(liveStage)}</Text>
              <Text type="supporting" color="secondary">
                {checklist.isTerminal
                  ? "Ready for handoff"
                  : checklist.isReady
                    ? `All set for ${stageLabel(checklist.nextStage!)}`
                    : `${checklist.doneCount} of ${checklist.totalCount} ready for ${stageLabel(
                        checklist.nextStage!,
                      )}`}
              </Text>
            </VStack>
          </StackItem>
          <Badge
            variant={checklist.isReady ? "success" : "neutral"}
            label={
              checklist.isTerminal
                ? "Done"
                : `${checklist.doneCount} / ${checklist.totalCount}`
            }
          />
          <button
            type="button"
            aria-label="Close stage panel"
            onClick={() => setIsOpen(false)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <Icon icon={X} size="sm" color="secondary" />
          </button>
        </HStack>
      </VStack>

      <Divider />

      {checklist.isTerminal && designHandoff ? (
        <DevelopmentHandoffSummary
          designHandoff={designHandoff}
          workspaceId={workspaceId}
          roomId={roomId}
        />
      ) : (
        <VStack gap={2} width="100%">
          {checklist.items.map((item) => {
            const isPending = pendingKey === item.manualKey && item.manualKey !== null;
            return (
              <HStack key={item.key} gap={2} vAlign="center" width="100%">
                <ChecklistMarker
                  item={item}
                  canToggle={canEditChecklist}
                  isPending={isPending}
                  onToggle={() => void toggleManual(item)}
                />
                <StackItem size="fill">
                  <Text
                    color={item.done ? "secondary" : "primary"}
                    hasStrikethrough={item.done}
                  >
                    {item.label}
                  </Text>
                </StackItem>
              </HStack>
            );
          })}
        </VStack>
      )}

      {canChangeStage ? (
        <>
          <Divider />
          <VStack gap={2} width="100%">
            {checklist.nextStage ? (
              <Button
                label={`Move to ${stageLabel(checklist.nextStage)}`}
                variant={checklist.isReady ? "primary" : "secondary"}
                width="100%"
                isLoading={isMoving}
                endContent={<Icon icon={ChevronRight} size="sm" color="inherit" />}
                onClick={() => void moveTo(checklist.nextStage!)}
              />
            ) : null}
            {checklist.previousStage ? (
              <Button
                label={`Back to ${stageLabel(checklist.previousStage)}`}
                variant="ghost"
                width="100%"
                isDisabled={isMoving}
                icon={<Icon icon={ChevronLeft} size="sm" color="inherit" />}
                onClick={() => void moveTo(checklist.previousStage!)}
              />
            ) : null}
          </VStack>
        </>
      ) : null}
    </VStack>
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        right: "var(--spacing-6)",
        // Just under the room header, top-right; the card expands downward.
        top: "calc(var(--spacing-12) + var(--spacing-8))",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "var(--spacing-2)",
      }}
    >
      <button
        type="button"
        data-testid="stage-coaching-pill"
        aria-expanded={isOpen}
        aria-label={`${stageLabel(liveStage)} stage readiness — ${pillLabel}`}
        onClick={() => setIsOpen((open) => !open)}
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--spacing-2)",
          padding:
            "var(--spacing-1) var(--spacing-3) var(--spacing-1) var(--spacing-2)",
          borderRadius: "var(--radius-full)",
          border: checklist.isReady
            ? "var(--border-width) solid var(--color-border-green)"
            : "var(--border-width) solid var(--color-border)",
          background: checklist.isReady
            ? "var(--color-background-green)"
            : "var(--color-background-surface)",
          boxShadow: "var(--shadow-low)",
          cursor: "pointer",
        }}
      >
        <StageProgressRing
          ratio={checklist.ratio}
          label={`${Math.round(checklist.ratio * 100)}% ready`}
        />
        <Text weight="medium">{stageLabel(liveStage)}</Text>
        <Text
          type="supporting"
          color="secondary"
          hasTabularNumbers
          style={
            checklist.isReady ? { color: "var(--color-text-green)" } : undefined
          }
        >
          {pillLabel}
        </Text>
      </button>
      {isOpen ? (
        <div
          role="dialog"
          aria-label={`${stageLabel(liveStage)} stage readiness`}
          data-testid="stage-coaching-panel"
          style={{
            width: PANEL_WIDTH,
            maxWidth: "calc(100vw - var(--spacing-8))",
          }}
        >
          <Card variant="default" padding={4} width="100%">
            {content}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
