"use client";

import type { RoomActivity, RoomActivityState } from "@meld/contracts";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import type { ReactNode } from "react";
import { OrionHatMark } from "@/ui/orion-hat-mark";
import { describeHatLabel } from "../describe";

export function ProjectStatusMark({
  name,
  color,
  state,
  room,
  hop,
  fallback,
}: {
  name: string;
  color: string;
  state: RoomActivityState;
  room: RoomActivity | null;
  hop: boolean;
  fallback: ReactNode;
}) {
  if (state === "idle") return <>{fallback}</>;
  const label = describeHatLabel(name, room, state);
  return (
    <Tooltip content={label} hasHoverIndication={false}>
      <OrionHatMark state={state} color={color} hop={hop} label={label} />
    </Tooltip>
  );
}
