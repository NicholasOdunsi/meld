import { createHash, randomUUID } from "node:crypto";
import {
  INSPIRATION_LIMITS,
  InspirationMimeTypeSchema,
  type InspirationItemView,
  type ShelfRoom,
} from "@meld/contracts";
import { E2E_DESIGN_ROOM_ID } from "@/features/rooms/e2e-fake";
import type { ShelfTokenView } from "./inspiration-shared";
import type { SaveInspirationResult } from "./save-inspiration-item";

// In-memory stand-in used only when MELD_E2E_FAKE_* is on (Playwright).
// Lives on globalThis so server actions and pages share one store, like
// features/rooms/e2e-fake.ts.
export const FAKE_SHELF_CONNECT_CODE = "ORION234";
export const FAKE_INSPIRATION_ROOM: ShelfRoom = {
  roomId: E2E_DESIGN_ROOM_ID,
  roomName: "Design Room",
  projectName: "E2E Project",
};

type FakeItem = InspirationItemView & { contentHash: string };
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
  const { contentHash: _contentHash, ...view } = item;
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
    width: 1,
    height: 1,
    mimeType: mimeType.data,
    sourceUrl: null,
    note: null,
    captureChannel: "web",
    createdAt: new Date().toISOString(),
    roomIds: [],
    contentHash,
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
  return [FAKE_INSPIRATION_ROOM];
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
