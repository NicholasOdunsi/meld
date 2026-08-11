"use client";

import { Selector } from "@astryxdesign/core/Selector";
import { useToast } from "@astryxdesign/core/Toast";
import { RoomStageSchema, type RoomStage } from "@meld/contracts";
import { useRef, useState } from "react";
import { setRoomStage } from "../actions";
import { ROOM_STAGE_PRESENTATION } from "../stage";

const STAGE_OPTIONS = RoomStageSchema.options.map((stage) => ({
  value: stage,
  label: ROOM_STAGE_PRESENTATION[stage].label,
  icon: ROOM_STAGE_PRESENTATION[stage].icon,
}));

const STAGE_SELECTOR_WIDTH = "calc(var(--spacing-12) * 2)";

export function RoomStageSelector({
  roomId,
  stage,
  canChangeStage,
}: {
  roomId: string;
  stage: RoomStage;
  canChangeStage: boolean;
}) {
  const toast = useToast();
  const mutationPendingRef = useRef(false);
  const [isMutationPending, setIsMutationPending] = useState(false);
  const [selection, setSelection] = useState<{
    sourceStage: RoomStage;
    value: RoomStage;
  } | null>(null);
  if (selection && selection.sourceStage !== stage) {
    setSelection(null);
  }
  const selectedStage =
    selection?.sourceStage === stage ? selection.value : stage;

  if (!canChangeStage) return null;

  async function handleChange(value: string) {
    const parsed = RoomStageSchema.safeParse(value);
    if (
      mutationPendingRef.current ||
      !parsed.success ||
      parsed.data === selectedStage
    ) {
      return;
    }
    const previousStage = selectedStage;
    mutationPendingRef.current = true;
    setIsMutationPending(true);
    setSelection({ sourceStage: stage, value: parsed.data });
    try {
      const committedStage = await setRoomStage({
        roomId,
        stage: parsed.data,
      });
      setSelection({
        sourceStage: stage,
        value: RoomStageSchema.parse(committedStage),
      });
    } catch {
      setSelection({ sourceStage: stage, value: previousStage });
      toast({
        type: "error",
        body: "Could not change the room stage.",
        uniqueID: `room-stage:${roomId}`,
      });
    } finally {
      mutationPendingRef.current = false;
      setIsMutationPending(false);
    }
  }

  return (
    <Selector
      label="Room stage"
      isLabelHidden
      size="sm"
      width={STAGE_SELECTOR_WIDTH}
      options={STAGE_OPTIONS}
      value={selectedStage}
      onChange={handleChange}
      isDisabled={isMutationPending}
      disabledMessage="Stage change in progress"
    />
  );
}
