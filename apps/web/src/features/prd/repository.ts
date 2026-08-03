import type { SupabaseClient } from "@supabase/supabase-js";
import type { PRDDocument } from "@meld/contracts";
import { RoomPrdSchema, type RoomPrd } from "./schemas";

const PRD_COLUMNS =
  "id, room_id, version, status, document, owner_id, created_by, accepted_at, accepted_by, created_at, updated_at";

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
    async acceptRoomPrdVersion(input: { prdId: string }): Promise<RoomPrd> {
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
