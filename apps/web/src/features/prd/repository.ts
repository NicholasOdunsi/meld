import type { SupabaseClient } from "@supabase/supabase-js";
import type { PRDDocument } from "@meld/contracts";
import {
  PrdProposalSchema,
  RoomPrdSchema,
  type PrdProposal,
  type RoomPrd,
} from "./schemas";

const PRD_COLUMNS =
  "id, room_id, version, status, document, owner_id, created_by, accepted_at, accepted_by, created_at, updated_at";
const PROPOSAL_COLUMNS =
  "id, room_id, task_id, base_prd_id, base_version, section_field, section_label, instruction, quoted_text, previous_value, proposed_value, status, error_message, created_by, created_at, updated_at, applied_at, discarded_at";

type PrdRow = {
  id: string;
  room_id: string;
  version: number;
  status: "draft" | "accepted";
  document: PRDDocument;
  owner_id: string;
  created_by: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
};

export class PrdVersionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super("The PRD has a newer version.");
    this.name = "PrdVersionConflictError";
  }
}

export class PrdEditForbiddenError extends Error {
  constructor() {
    super("You do not have permission to edit this PRD.");
    this.name = "PrdEditForbiddenError";
  }
}

export class PrdAcceptForbiddenError extends Error {
  constructor() {
    super("You do not have permission to accept this PRD.");
    this.name = "PrdAcceptForbiddenError";
  }
}

export class PrdAlreadyAcceptedError extends Error {
  constructor() {
    super("This PRD version cannot be accepted.");
    this.name = "PrdAlreadyAcceptedError";
  }
}

export class InvalidPrdDocumentError extends Error {
  constructor() {
    super("The PRD document is invalid.");
    this.name = "InvalidPrdDocumentError";
  }
}

function toRoomPrd(row: PrdRow): RoomPrd {
  return RoomPrdSchema.parse({
    id: row.id,
    roomId: row.room_id,
    version: row.version,
    status: row.status,
    document: row.document,
    ownerId: row.owner_id,
    createdBy: row.created_by,
    acceptedAt: row.accepted_at,
    acceptedBy: row.accepted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toPrdProposal(row: Record<string, unknown>): PrdProposal {
  const joinedTask = Array.isArray(row.task) ? row.task[0] : row.task;
  const task =
    joinedTask && typeof joinedTask === "object"
      ? (joinedTask as Record<string, unknown>)
      : null;
  return PrdProposalSchema.parse({
    id: row.id,
    roomId: row.room_id,
    taskId: row.task_id,
    provider: task?.provider,
    basePrdId: row.base_prd_id,
    baseVersion: row.base_version,
    sectionField: row.section_field,
    sectionLabel: row.section_label,
    instruction: row.instruction,
    quotedText: row.quoted_text,
    previousValue: row.previous_value,
    proposedValue: row.proposed_value,
    status: row.status,
    errorMessage: task?.error_message ?? row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at ?? null,
    discardedAt: row.discarded_at ?? null,
  });
}

function toTypedPrdRpcError(error: {
  code?: string | null;
  message?: string | null;
}): Error | null {
  if (error.code !== "P0001") return null;

  switch (error.message) {
    case "prd_version_conflict":
      return new PrdVersionConflictError(0);
    case "prd_edit_forbidden":
      return new PrdEditForbiddenError();
    case "prd_accept_forbidden":
      return new PrdAcceptForbiddenError();
    case "prd_already_accepted":
      return new PrdAlreadyAcceptedError();
    case "invalid_prd_document":
      return new InvalidPrdDocumentError();
    default:
      return null;
  }
}

export function createPrdRepository(supabase: SupabaseClient) {
  const repository = {
    async getRoomPrd(roomId: string): Promise<RoomPrd | null> {
      const { data, error } = await supabase
        .from("prds")
        .select(PRD_COLUMNS)
        .eq("room_id", roomId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("Could not load the PRD.");
      if (!data) return null;
      return toRoomPrd(data as PrdRow);
    },
    async getRoomPrdHistory(roomId: string): Promise<RoomPrd[]> {
      const { data, error } = await supabase
        .from("prds")
        .select(PRD_COLUMNS)
        .eq("room_id", roomId)
        .order("version", { ascending: false });
      if (error) throw new Error("Could not load the PRD history.");
      return (data ?? []).map((row) => toRoomPrd(row as PrdRow));
    },
    async roomHasPrd(roomId: string): Promise<boolean> {
      const { count, error } = await supabase
        .from("prds")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId);
      if (error) throw new Error("Could not check for a PRD.");
      return (count ?? 0) > 0;
    },
    async listRoomPrdProposals(roomId: string): Promise<PrdProposal[]> {
      const { data, error } = await supabase
        .from("prd_proposals")
        .select(`${PROPOSAL_COLUMNS}, task:ai_tasks(provider, error_message)`)
        .eq("room_id", roomId)
        .in("status", ["pending", "ready", "failed"])
        .order("created_at", { ascending: false });
      if (error) throw new Error("Could not load PRD proposals.");
      return (data ?? []).map((row) => toPrdProposal(row as Record<string, unknown>));
    },
    async applyPrdProposal(input: {
      roomId: string;
      proposalId: string;
    }): Promise<RoomPrd> {
      const { data, error } = await supabase.rpc("apply_prd_proposal", {
        target_proposal_id: input.proposalId,
      });
      if (error || !data) {
        throw new Error("Could not apply the PRD proposal.");
      }
      return toRoomPrd(data as PrdRow);
    },
    async discardPrdProposal(input: {
      roomId: string;
      proposalId: string;
    }): Promise<PrdProposal> {
      const { data: taskMetadata, error: taskMetadataError } = await supabase
        .from("prd_proposals")
        .select("task:ai_tasks(provider, error_message)")
        .eq("id", input.proposalId)
        .maybeSingle();
      if (taskMetadataError) {
        throw new Error("Could not load the PRD proposal.");
      }
      const { data, error } = await supabase.rpc("discard_prd_proposal", {
        target_proposal_id: input.proposalId,
      });
      if (error || !data) {
        throw new Error("Could not discard the PRD proposal.");
      }
      return toPrdProposal({
        ...(data as Record<string, unknown>),
        task: taskMetadata?.task ?? null,
      });
    },
    async saveRoomPrdVersion(input: {
      roomId: string;
      baseVersion: number;
      document: PRDDocument;
    }): Promise<RoomPrd> {
      const { data, error } = await supabase.rpc("save_prd_version", {
        target_room_id: input.roomId,
        base_version: input.baseVersion,
        next_document: input.document,
      });
      if (error) {
        const typedError = toTypedPrdRpcError(error);
        if (typedError instanceof PrdVersionConflictError) {
          const latest = await repository.getRoomPrd(input.roomId);
          throw new PrdVersionConflictError(latest?.version ?? 0);
        }
        throw typedError ?? new Error("Could not save the PRD version.");
      }
      if (!data) throw new Error("Could not save the PRD version.");
      return toRoomPrd(data as PrdRow);
    },
    async acceptRoomPrdVersion(input: {
      roomId: string;
      prdId: string;
    }): Promise<RoomPrd> {
      const { data: prd, error: prdError } = await supabase
        .from("prds")
        .select("room_id")
        .eq("id", input.prdId)
        .maybeSingle();
      if (prdError) throw new Error("Could not verify the PRD room.");
      if (!prd || prd.room_id !== input.roomId) {
        throw new PrdAlreadyAcceptedError();
      }

      const { data, error } = await supabase.rpc("accept_prd_version", {
        target_prd_id: input.prdId,
      });
      if (error) {
        throw (
          toTypedPrdRpcError(error) ??
          new Error("Could not accept the PRD version.")
        );
      }
      if (!data) throw new Error("Could not accept the PRD version.");
      return toRoomPrd(data as PrdRow);
    },
  };

  return repository;
}
