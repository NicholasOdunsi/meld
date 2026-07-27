export type AttentionKind =
  | "mention"
  | "agent_run_failed"
  | "agent_result_review"
  | "approval_request"
  | "assigned_work"
  | "decision_needed";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  roomId: string;
  roomName: string;
  actorName?: string;
  occurredAt: string;
  href: string;
};

export type AttentionContext = {
  userId: string;
  organizationId: string;
};

export type AttentionResolver = {
  kind: AttentionKind;
  resolve: (context: AttentionContext) => Promise<AttentionItem[]>;
};
