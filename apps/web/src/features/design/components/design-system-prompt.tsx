"use client";

import { useEffect, useRef, useState } from "react";
import { isTerminalTaskStatus } from "@/features/ai/room-task-status";
import { useRoomTaskStatus } from "@/features/prd/components/room-task-status-provider";
import { getActiveDesignProfile } from "../design-profile-reader";
import { DesignSystemBanner } from "./design-system-banner";

// Addressing the Design Agent from the Room's composer is the moment a missing
// design system starts to cost something: without one the generator is told
// only to "use your own clean, modern default style", so each screen re-decides
// the look and they drift apart. This says so where the decision is being made
// -- directly above the composer -- and offers the upload right there, rather
// than leaving it somewhere the person has to already know about.
//
// The Canvas has the same banner above its own screen composer; this is that
// prompt brought to the Room conversation, which is the other way a screen
// gets generated.
export function DesignSystemPrompt({
  roomId,
  isActive,
}: {
  roomId: string;
  isActive: boolean;
}) {
  // "Has one" until proven otherwise, so an unasked-for banner never blinks
  // into view and out again while the read is in flight -- the same
  // non-intrusive default the Canvas uses.
  const roomTaskStatus = useRoomTaskStatus();
  const [hasProfile, setHasProfile] = useState(true);
  // A ref, not state: a state latch would change this effect's deps, so React
  // would tear the effect down and the cleanup would cancel the very read the
  // latch had just started -- the banner then never appears at all.
  const hasReadRef = useRef(false);

  useEffect(() => {
    // Read lazily, and once: the Room composer re-renders on every keystroke,
    // and a room whose Design Agent is never addressed should never pay for
    // this at all.
    if (!isActive || hasReadRef.current) return;
    hasReadRef.current = true;
    let disposed = false;
    void getActiveDesignProfile(roomId).then((result) => {
      if (!disposed) setHasProfile(result.hasActiveProfile);
    });
    return () => {
      disposed = true;
    };
  }, [isActive, roomId]);

  // A distill takes minutes, and its progress used to live only in the
  // component that started it -- so a reload, or a second person in the room,
  // saw "No design system yet" and an Upload button with no hint one was
  // already under way, and could kick off a duplicate. The room's task
  // statuses are already being polled for other reasons, so the answer is
  // available without asking the server anything new.
  const isDistillingElsewhere = (roomTaskStatus?.statuses ?? []).some(
    (task) =>
      task.kind === "design_profile_distill" &&
      !isTerminalTaskStatus(task.status),
  );

  if (!isActive || hasProfile) return null;

  return (
    <DesignSystemBanner
      roomId={roomId}
      variant="roomy"
      isDistillingElsewhere={isDistillingElsewhere}
      onResolved={() => setHasProfile(true)}
    />
  );
}
