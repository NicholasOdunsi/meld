export type AttentionKind =
  | "mention"
  | "agent_run_failed"
  | "agent_result_review"
  | "approval_request"
  | "assigned_work"
  | "decision_needed"
  // A room that has stopped moving. Computed at read time from activity
  // timestamps -- nothing is persisted to support it.
  | "room_idle";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  roomId: string;
  roomName: string;
  actorName?: string;
  occurredAt: string;
  href: string;
  /** Source line on the ticket, e.g. the owning project's name. */
  projectName?: string;
  /** Overrides the per-kind default action label. */
  actionLabel?: string;
  /** A second, quieter destination for the row. */
  secondaryHref?: string;
};

export type AttentionContext = {
  userId: string;
  workspaceId: string;
};

export type AttentionResolver = {
  kind: AttentionKind;
  resolve: (context: AttentionContext) => Promise<AttentionItem[]>;
};
