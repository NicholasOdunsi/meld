import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import {
  NodeSqliteWrapper,
  SQLiteSyncStorage,
  TLSocketRoom,
  type TLSocketRoomOptions,
  type WebSocketMinimal,
} from "@tldraw/sync-core";
import {
  createShapeId,
  createTLSchema,
  toRichText,
  type TLGeoShape,
  type TLRecord,
} from "@tldraw/tlschema";
import {
  MutationAuditProbe,
  type CanvasAuditEvent,
  type CanvasAuditFailure,
  type CanvasSessionMeta,
} from "./mutation-audit-probe";

export interface SqliteCanvasRoomOptions {
  workspaceId: string;
  roomId: string;
  databasePath: string;
  onSessionRemoved?: () => void;
}

export interface CanvasRoomPragmas {
  journalMode: string;
  synchronous: number;
  foreignKeys: number;
}

export interface ServerMarkerResult {
  documentClock: number;
  recordId: string;
}

type RecordAuthorizers = NonNullable<
  TLSocketRoomOptions<TLRecord, CanvasSessionMeta>["authorizeRecord"]
>;

export interface CanvasRecordAuthorizerArgs {
  session: {
    sessionId: string;
    isReadonly: boolean;
    meta: CanvasSessionMeta;
  };
  type: "create" | "update" | "delete";
  prev: TLRecord | null;
  next: TLRecord | null;
}

type CanvasRecordAuthorizer = (
  args: CanvasRecordAuthorizerArgs,
) => TLRecord | null;

function makeAuthorizers(
  schema: ReturnType<typeof createTLSchema>,
  auditProbe: MutationAuditProbe,
): RecordAuthorizers {
  const authorizers: Record<string, unknown> = {};
  for (const [typeName, recordType] of Object.entries(schema.types)) {
    if (recordType.scope !== "document") continue;
    const authorize: CanvasRecordAuthorizer = ({
      session,
      type: mutationType,
      prev,
      next,
    }) => {
      const recordId = next?.id ?? prev?.id;
      if (recordId) {
        auditProbe.recordWrite(
          { ...session.meta, sessionId: session.sessionId },
          recordId,
        );
      }
      // Deletes only use truthiness as an allow/veto result; return the previous record
      // there so the mutation is permitted while the audit probe still records its ID.
      void mutationType;
      return next ?? prev;
    };
    authorizers[typeName] = authorize;
  }
  return authorizers as RecordAuthorizers;
}

export class SqliteCanvasRoom {
  private readonly database: DatabaseSync;
  private readonly storage: SQLiteSyncStorage<TLRecord>;
  private readonly socketRoom: TLSocketRoom<TLRecord, CanvasSessionMeta>;
  private readonly auditProbe = new MutationAuditProbe();
  private closed = false;

  constructor(private readonly options: SqliteCanvasRoomOptions) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.database = new DatabaseSync(options.databasePath);
    this.database.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
    );

    const schema = createTLSchema();
    const sql = new NodeSqliteWrapper(this.database);
    this.storage = new SQLiteSyncStorage<TLRecord>({ sql });
    this.socketRoom = new TLSocketRoom<TLRecord, CanvasSessionMeta>({
      schema,
      storage: this.storage,
      authorizeRecord: makeAuthorizers(schema, this.auditProbe),
      onAfterReceiveMessage: ({ meta, sessionId }) => {
        this.auditProbe.beginMessage({ ...meta, sessionId });
      },
      onCommittedChanges: ({ diff, documentClock }) => {
        this.auditProbe.commit({
          documentClock,
          touchedRecordIds: [...Object.keys(diff.puts), ...diff.deletes],
        });
      },
      onSessionRemoved: () => {
        this.options.onSessionRemoved?.();
      },
    });
  }

  connect(input: {
    sessionId: string;
    socket: WebSocketMinimal;
    meta: CanvasSessionMeta;
  }): void {
    if (
      input.meta.workspaceId !== this.options.workspaceId ||
      input.meta.roomId !== this.options.roomId
    ) {
      throw new Error("Canvas session room identity mismatch");
    }
    if (this.closed) throw new Error("Canvas room is closed");
    this.socketRoom.handleSocketConnect({
      sessionId: input.sessionId,
      socket: input.socket,
      meta: input.meta,
      isReadonly: input.meta.access === "view",
    });
  }

  insertServerMarker(label: string): ServerMarkerResult {
    if (this.closed) throw new Error("Canvas room is closed");
    const page = this.getSnapshot().documents.find(
      (document) => document.state.typeName === "page",
    );
    if (!page) throw new Error("Canvas room has no persisted page");

    const recordId = createShapeId(`trial-server-marker-${crypto.randomUUID()}`);
    const marker: TLGeoShape = {
      id: recordId,
      typeName: "shape",
      type: "geo",
      x: 100,
      y: 100,
      rotation: 0,
      index: "a2" as TLGeoShape["index"],
      parentId: page.state.id as TLGeoShape["parentId"],
      isLocked: false,
      opacity: 1,
      props: {
        geo: "rectangle",
        dash: "solid",
        url: "",
        w: 240,
        h: 80,
        growY: 0,
        scale: 1,
        flipX: false,
        flipY: false,
        labelColor: "black",
        color: "black",
        fill: "solid",
        size: "m",
        font: "draw",
        align: "middle",
        verticalAlign: "middle",
        richText: toRichText(label),
      },
      meta: {},
    };

    const result = this.storage.transaction(
      (txn) => {
        txn.set(recordId, marker);
        return recordId;
      },
      { id: "trial:server-marker", emitChanges: "always" },
    );
    this.auditProbe.recordServerCommit({
      workspaceId: this.options.workspaceId,
      roomId: this.options.roomId,
      documentClock: result.documentClock,
      touchedRecordIds: [recordId],
    });
    return { documentClock: result.documentClock, recordId };
  }

  pragmas(): CanvasRoomPragmas {
    const journalMode = this.database
      .prepare("PRAGMA journal_mode")
      .all()[0] as { journal_mode?: string } | undefined;
    const synchronous = this.database
      .prepare("PRAGMA synchronous")
      .all()[0] as { synchronous?: number } | undefined;
    const foreignKeys = this.database
      .prepare("PRAGMA foreign_keys")
      .all()[0] as { foreign_keys?: number } | undefined;
    return {
      journalMode: String(journalMode?.journal_mode ?? "").toLowerCase(),
      synchronous: Number(synchronous?.synchronous ?? -1),
      foreignKeys: Number(foreignKeys?.foreign_keys ?? 0),
    };
  }

  getSnapshot() {
    return this.socketRoom.getCurrentSnapshot();
  }

  getAuditEvents(): readonly CanvasAuditEvent[] {
    return this.auditProbe.events();
  }

  getAuditFailures(): readonly CanvasAuditFailure[] {
    return this.auditProbe.failures();
  }

  getNumActiveSessions(): number {
    return this.socketRoom.getNumActiveSessions();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.socketRoom.close();
    this.auditProbe.dispose();
    this.database.close();
  }
}
