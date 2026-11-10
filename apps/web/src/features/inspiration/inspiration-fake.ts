import { createHash, randomUUID } from "node:crypto";
import {
  INSPIRATION_LIMITS,
  InspirationMimeTypeSchema,
  type InspirationItemView,
  type ShelfLabelState,
  type ShelfLibraryItem,
  type ShelfRoom,
} from "@meld/contracts";
import { E2E_DESIGN_ROOM_ID } from "@/features/rooms/e2e-fake";
import type { ShelfTokenView } from "./inspiration-shared";
import type { SaveInspirationResult } from "./save-inspiration-item";

// In-memory stand-in used only when MELD_E2E_FAKE_* is on (Playwright).
// Lives on globalThis so server actions and pages share one store, like
// features/rooms/e2e-fake.ts.
export const FAKE_SHELF_CONNECT_CODE = "ORION234";
// The token the demo /api/shelf/connect hands out, so Orion Preview's Shelf
// auto-connect works without Supabase.
export const FAKE_SHELF_TOKEN = "orion_cap_preview";
export const FAKE_INSPIRATION_ROOM: ShelfRoom = {
  roomId: E2E_DESIGN_ROOM_ID,
  roomName: "Design Room",
  projectName: "Meld E2E product",
};

type FakeItem = InspirationItemView & { contentHash: string; description: string | null; labelState: ShelfLabelState };
type FakeStore = {
  items: FakeItem[];
  links: { roomId: string; itemId: string; createdAt: string }[];
  tokens: ShelfTokenView[];
};
const STORE_KEY = "__orionInspirationFake";

function store(): FakeStore {
  const globalState = globalThis as typeof globalThis & { [STORE_KEY]?: FakeStore };
  globalState[STORE_KEY] ??= { items: [], links: [], tokens: [] };
  return globalState[STORE_KEY];
}

export function resetInspirationFake(): void {
  const globalState = globalThis as typeof globalThis & { [STORE_KEY]?: FakeStore };
  globalState[STORE_KEY] = { items: [], links: [], tokens: [] };
}

function withRoomIds(item: FakeItem): InspirationItemView {
  const { contentHash: _contentHash, description: _d, labelState: _l, ...view } = item;
  return {
    ...view,
    roomIds: store().links.filter((link) => link.itemId === item.id).map((link) => link.roomId),
  };
}

export function fakeSaveInspiration(input: {
  workspaceId: string;
  bytes: Uint8Array;
  mimeType: string;
  roomId?: string | null;
  width?: number;
  height?: number;
}): SaveInspirationResult {
  const mimeType = InspirationMimeTypeSchema.safeParse(input.mimeType);
  if (!mimeType.success) return { ok: false, error: "unsupported_type" };
  if (input.bytes.byteLength > INSPIRATION_LIMITS.maxBytes) return { ok: false, error: "too_large" };
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const existing = store().items.find((item) => item.contentHash === contentHash);
  const item: FakeItem = existing ?? {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    imageUrl: `data:${mimeType.data};base64,${Buffer.from(input.bytes).toString("base64")}`,
    width: input.width ?? 1,
    height: input.height ?? 1,
    mimeType: mimeType.data,
    sourceUrl: null,
    note: null,
    captureChannel: "web",
    createdAt: new Date().toISOString(),
    roomIds: [],
    contentHash,
    description: null,
    labelState: "pending",
  };
  if (!existing) store().items.unshift(item);
  if (input.roomId) fakeLinkToRoom(input.roomId, [item.id]);
  return { ok: true, itemId: item.id, duplicate: Boolean(existing), roomLinked: Boolean(input.roomId) };
}

export function fakeListLibrary(input: { workspaceId: string; offset: number }) {
  const all = store().items.filter((item) => item.workspaceId === input.workspaceId);
  const page = all.slice(input.offset, input.offset + INSPIRATION_LIMITS.pageSize);
  return { items: page.map(withRoomIds), hasMore: all.length > input.offset + INSPIRATION_LIMITS.pageSize };
}

export function fakeListRoomInspiration(roomId: string): InspirationItemView[] {
  return store()
    .links.filter((link) => link.roomId === roomId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((link) => store().items.filter((item) => item.id === link.itemId))
    .map(withRoomIds);
}

export function fakeRoomHasInspiration(roomId: string): boolean {
  return store().links.some((link) => link.roomId === roomId);
}

export function fakeListEditableRooms(): ShelfRoom[] {
  // One room per demo project so "Use in project" can list both sidebar projects.
  return [
    FAKE_INSPIRATION_ROOM,
    {
      roomId: "40000000-0000-4000-8000-000000000003",
      roomName: "Pricing rework",
      projectName: "Meld E2E growth",
    },
  ];
}

export function fakeUpdateNote(itemId: string, note: string | null): void {
  const item = store().items.find((candidate) => candidate.id === itemId);
  if (item) item.note = note;
}

export function fakeDeleteItems(itemIds: string[]): number {
  const before = store().items.length;
  store().items = store().items.filter((item) => !itemIds.includes(item.id));
  store().links = store().links.filter((link) => !itemIds.includes(link.itemId));
  return before - store().items.length;
}

export function fakeLinkToRoom(roomId: string, itemIds: string[]): number {
  let added = 0;
  for (const itemId of itemIds) {
    if (!store().links.some((link) => link.roomId === roomId && link.itemId === itemId)) {
      store().links.push({ roomId, itemId, createdAt: new Date().toISOString() });
      added += 1;
    }
  }
  return added;
}

export function fakeUnlinkFromRoom(roomId: string, itemIds: string[]): number {
  const before = store().links.length;
  store().links = store().links.filter((link) => !(link.roomId === roomId && itemIds.includes(link.itemId)));
  return before - store().links.length;
}

export function fakeCreateShelfConnectCode() {
  return {
    status: "created" as const,
    code: FAKE_SHELF_CONNECT_CODE,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export function fakeListShelfTokens(): ShelfTokenView[] {
  return store().tokens;
}

export function fakeRevokeShelfToken(tokenId: string): void {
  store().tokens = store().tokens.filter((token) => token.id !== tokenId);
}

export function fakeSetLabel(itemId: string, description: string | null, labelState: ShelfLabelState): void {
  const item = store().items.find((candidate) => candidate.id === itemId);
  if (item) Object.assign(item, { description, labelState });
}

export function fakeShelfLibraryItems(workspaceId: string): ShelfLibraryItem[] {
  return store()
    .items.filter((item) => item.workspaceId === workspaceId)
    .map((item) => ({
      id: item.id,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      note: item.note,
      sourceUrl: item.sourceUrl,
      createdAt: item.createdAt,
      description: item.description,
      labelState: item.labelState,
      rooms: store()
        .links.filter((link) => link.itemId === item.id)
        .flatMap((link) => (link.roomId === FAKE_INSPIRATION_ROOM.roomId ? [FAKE_INSPIRATION_ROOM] : [])),
      imageUrl: item.imageUrl,
    }));
}
