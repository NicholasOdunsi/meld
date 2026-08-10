export interface CanvasSessionMeta {
  organizationId: string;
  roomId: string;
  userId: string;
  userName: string;
  access: "view" | "edit";
  clientVersion: "5.3.0";
}

export interface CanvasAuditEvent {
  organizationId: string;
  roomId: string;
  actorId: string;
  sessionId: string;
  clientVersion: "5.3.0";
  documentClock: number;
  origin: "client" | "server";
  touchedRecordIds: string[];
}

export type CanvasAuditFailureCode =
  | "ambiguous_actor_overlap"
  | "mixed_authenticated_sessions"
  | "missing_active_message"
  | "diff_record_mismatch"
  | "uncommitted_message_expired";

export interface CanvasAuditFailure {
  code: CanvasAuditFailureCode;
  sessionId?: string;
  documentClock?: number;
  expectedRecordIds?: string[];
  actualRecordIds?: string[];
}

export type CanvasSessionMetaWithId = CanvasSessionMeta & { sessionId: string };

interface PendingMessage {
  sequence: number;
  meta: CanvasSessionMetaWithId;
  recordIds: Set<string>;
  expiryTimer: ReturnType<typeof setTimeout>;
}

function sameSession(
  a: CanvasSessionMetaWithId,
  b: CanvasSessionMetaWithId,
): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.organizationId === b.organizationId &&
    a.roomId === b.roomId &&
    a.userId === b.userId &&
    a.userName === b.userName &&
    a.access === b.access &&
    a.clientVersion === b.clientVersion
  );
}

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export class MutationAuditProbe {
  private readonly pendingMessages: PendingMessage[] = [];
  private nextSequence = 0;
  private readonly auditEvents: CanvasAuditEvent[] = [];
  private readonly auditFailures: CanvasAuditFailure[] = [];

  beginMessage(meta: CanvasSessionMetaWithId): void {
    const hasSameSessionWrites = this.pendingMessages.some(
      (candidate) =>
        candidate.recordIds.size > 0 && sameSession(candidate.meta, meta),
    );
    if (hasSameSessionWrites) {
      this.auditFailures.push({
        code: "ambiguous_actor_overlap",
        sessionId: meta.sessionId,
      });
      this.failClosed();
      return;
    }

    const sequence = this.nextSequence++;
    const pending: PendingMessage = {
      sequence,
      meta: { ...meta },
      recordIds: new Set(),
      expiryTimer: setTimeout(() => this.expireMessage(sequence), 0),
    };
    this.pendingMessages.push(pending);
  }

  recordWrite(meta: CanvasSessionMetaWithId, recordId: string): void {
    const sameSessionCandidates = this.pendingMessages.filter((candidate) =>
      sameSession(candidate.meta, meta),
    );
    // Keep the newest empty entry as the current protocol message, while removing
    // older presence placeholders so they cannot make attribution ambiguous.
    for (const candidate of sameSessionCandidates.slice(0, -1)) {
      if (candidate.recordIds.size === 0) this.removePending(candidate);
    }
    const writeCandidates = this.pendingMessages.filter((candidate) =>
      candidate.recordIds.size > 0 && sameSession(candidate.meta, meta),
    );
    if (writeCandidates.length > 1) {
      this.auditFailures.push({
        code: "ambiguous_actor_overlap",
        sessionId: meta.sessionId,
      });
      this.failClosed();
      return;
    }
    const pending =
      writeCandidates[0] ??
      sameSessionCandidates.at(-1);
    if (!pending) {
      this.auditFailures.push({
        code: "mixed_authenticated_sessions",
        sessionId: meta.sessionId,
      });
      this.failClosed();
      return;
    }
    pending.recordIds.add(recordId);
  }

  commit(input: {
    documentClock: number;
    touchedRecordIds: readonly string[];
  }): void {
    this.dropPresenceMessages();
    const pending = this.pendingMessages.find(
      (candidate) => candidate.recordIds.size > 0,
    );
    if (!pending) {
      this.auditFailures.push({
        code: "missing_active_message",
        documentClock: input.documentClock,
      });
      return;
    }

    this.removePending(pending);
    const expectedRecordIds = sortedUnique([...pending.recordIds]);
    const actualRecordIds = sortedUnique(input.touchedRecordIds);
    if (
      expectedRecordIds.length !== actualRecordIds.length ||
      expectedRecordIds.some((id, index) => id !== actualRecordIds[index])
    ) {
      this.auditFailures.push({
        code: "diff_record_mismatch",
        sessionId: pending.meta.sessionId,
        documentClock: input.documentClock,
        expectedRecordIds,
        actualRecordIds,
      });
      return;
    }

    this.auditEvents.push({
      organizationId: pending.meta.organizationId,
      roomId: pending.meta.roomId,
      actorId: pending.meta.userId,
      sessionId: pending.meta.sessionId,
      clientVersion: pending.meta.clientVersion,
      documentClock: input.documentClock,
      origin: "client",
      touchedRecordIds: actualRecordIds,
    });
  }

  recordServerCommit(input: {
    organizationId: string;
    roomId: string;
    documentClock: number;
    touchedRecordIds: readonly string[];
  }): void {
    this.auditEvents.push({
      organizationId: input.organizationId,
      roomId: input.roomId,
      actorId: "gateway",
      sessionId: "server",
      clientVersion: "5.3.0",
      documentClock: input.documentClock,
      origin: "server",
      touchedRecordIds: sortedUnique(input.touchedRecordIds),
    });
  }

  dispose(): void {
    for (const pending of this.pendingMessages) {
      clearTimeout(pending.expiryTimer);
    }
    this.pendingMessages.length = 0;
  }

  events(): readonly CanvasAuditEvent[] {
    return this.auditEvents.map((event) => ({
      ...event,
      touchedRecordIds: [...event.touchedRecordIds],
    }));
  }

  failures(): readonly CanvasAuditFailure[] {
    return this.auditFailures.map((failure) => {
      const copy = { ...failure };
      if (failure.expectedRecordIds) {
        copy.expectedRecordIds = [...failure.expectedRecordIds];
      }
      if (failure.actualRecordIds) {
        copy.actualRecordIds = [...failure.actualRecordIds];
      }
      return copy;
    });
  }

  private dropPresenceMessages(): void {
    for (const pending of [...this.pendingMessages]) {
      if (pending.recordIds.size === 0) {
        this.removePending(pending);
      }
    }
  }

  private expireMessage(sequence: number): void {
    const pending = this.pendingMessages.find(
      (candidate) => candidate.sequence === sequence,
    );
    if (!pending) return;
    this.removePending(pending);
    if (pending.recordIds.size > 0) {
      this.auditFailures.push({
        code: "uncommitted_message_expired",
        sessionId: pending.meta.sessionId,
        expectedRecordIds: sortedUnique([...pending.recordIds]),
      });
    }
  }

  private removePending(pending: PendingMessage): void {
    clearTimeout(pending.expiryTimer);
    const index = this.pendingMessages.indexOf(pending);
    if (index >= 0) this.pendingMessages.splice(index, 1);
  }

  private failClosed(): void {
    for (const pending of this.pendingMessages) {
      clearTimeout(pending.expiryTimer);
    }
    this.pendingMessages.length = 0;
  }
}
