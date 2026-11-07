// apps/web/src/features/inspiration/taste/taste-fake.ts
import { randomUUID } from "node:crypto";
import {
  applyTasteOperation,
  TasteBoardSchema,
  type TasteBoard,
  type TasteOperation,
  type TasteSignalReason,
  type TasteTile,
} from "@meld/contracts";
import { describeSuggestion, tasteValueLabel } from "./describe-suggestion";
import type { SaveTasteResult, TasteView } from "./taste-actions";

const hx = (s: string) => `#${s}`;

// In-memory stand-in used only when MELD_E2E_FAKE_* is on (Playwright).
export const FAKE_TASTE_BOARD: TasteBoard = {
  designLanguage: ["minimal", "bold-type", "airy"],
  colors: [
    { hex: hx("ffffff"), role: "base" },
    { hex: hx("111111"), role: "action" },
    { hex: hx("e2231a"), role: "accent" },
  ],
  typography: { weight: "heavy", tracking: "tight", note: "Heavy, tightly-tracked headlines" },
  spacing: "generous",
  density: "airy",
  layoutHabits: ["Centred single-column forms"],
  signatureDetails: ["Full-width black primary button"],
  avoid: [],
};

type FakeSuggestion = { id: string; op: TasteOperation; reason: string; status: "pending" | "kept" | "rejected" | "superseded" };
type FakeStore = { board: TasteBoard; version: number; suggestions: FakeSuggestion[]; signals: TasteSignalReason[] };
const STORE_KEY = "__orionTasteFake";

function seed(): FakeStore {
  return {
    board: FAKE_TASTE_BOARD,
    version: 1,
    signals: [],
    suggestions: [
      { id: randomUUID(), op: { tile: "density", op: "set", value: "balanced" }, reason: "Your newest dashboards are denser", status: "pending" },
      { id: randomUUID(), op: { tile: "signatureDetails", op: "add", value: "Pill buttons" }, reason: "Seen in 3 of your 5 newest saves", status: "pending" },
    ],
  };
}

function store(): FakeStore {
  const globalState = globalThis as typeof globalThis & { [STORE_KEY]?: FakeStore };
  globalState[STORE_KEY] ??= seed();
  return globalState[STORE_KEY];
}

export function resetTasteFake(): void {
  (globalThis as typeof globalThis & { [STORE_KEY]?: FakeStore })[STORE_KEY] = seed();
}

export function fakeGetTasteView(): TasteView {
  const s = store();
  return {
    status: "ready",
    board: s.board,
    version: s.version,
    pending: s.suggestions
      .filter((x) => x.status === "pending")
      .map((x) => ({ id: x.id, tile: x.op.tile, headline: describeSuggestion(x.op, s.board), reason: x.reason, evidence: [] })),
  };
}

export function fakeHasPending(): boolean {
  return store().suggestions.some((x) => x.status === "pending");
}

export function fakeDecide({ suggestionId, decision }: { suggestionId: string; decision: "kept" | "rejected" }) {
  const s = store();
  const suggestion = s.suggestions.find((x) => x.id === suggestionId);
  if (!suggestion) return { status: "error" as const };
  if (suggestion.status !== "pending") return { status: suggestion.status === "kept" || suggestion.status === "rejected" ? suggestion.status : ("superseded" as const) };
  const next =
    decision === "kept"
      ? applyTasteOperation(s.board, suggestion.op)
      : suggestion.op.op === "add" && suggestion.op.tile !== "avoid"
        ? (applyTasteOperation(s.board, { tile: "avoid", op: "add", value: { text: tasteValueLabel(suggestion.op), source: "rejected" } }) ?? s.board)
        : s.board;
  if (!next) {
    suggestion.status = "superseded";
    return { status: "superseded" as const };
  }
  s.board = next;
  s.version += 1;
  suggestion.status = decision;
  return { status: decision };
}

export function fakeSaveTile({ tile, value, expectedVersion }: { tile: TasteTile; value: unknown; expectedVersion: number }): SaveTasteResult {
  const s = store();
  if (expectedVersion !== s.version) return { status: "conflict" };
  const board = TasteBoardSchema.safeParse({ ...s.board, [tile]: value });
  if (!board.success) return { status: "invalid" };
  s.board = board.data;
  s.version += 1;
  return { status: "saved", version: s.version };
}

export function fakeAddDislike({ text, expectedVersion }: { text: string; expectedVersion: number }): SaveTasteResult {
  const s = store();
  if (expectedVersion !== s.version) return { status: "conflict" };
  const next = applyTasteOperation(s.board, { tile: "avoid", op: "add", value: { text, source: "typed" } });
  if (!next) return { status: "invalid" };
  s.board = next;
  s.version += 1;
  return { status: "saved", version: s.version };
}

export function fakeRecordSignal({ reason }: { screenId: string; reason: TasteSignalReason }) {
  store().signals.push(reason);
  return { status: "saved" as const };
}
