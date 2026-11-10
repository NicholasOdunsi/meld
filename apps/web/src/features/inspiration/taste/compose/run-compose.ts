import "server-only";

import type { InspirationLabels, ShelfTasteSuggestion, TasteComposerCard, TasteTile } from "@meld/contracts";
import type { ShelfTaste, ShelfTasteError } from "@/features/inspiration/shelf-taste";
import { appleTasteCards } from "./apple-preset";
import { extractAttachmentText, attachmentKind } from "./extract-attachment-text";
import { fetchLinkText } from "./fetch-link-text";
import { filterComposerCards, type InterpreterSource, type TasteInterpreter } from "./taste-interpreter";

export const COMPOSE_LIMITS = { words: 4000, urls: 3, files: 6, library: 3 } as const;
export type ComposeInput = {
  words: string;
  urls: string[];
  files: { name: string; mimeType: string; bytes: Uint8Array }[];
  libraryItemIds: string[];
  tile: TasteTile | null;
  preset: "apple" | null;
  replyTo: string[];
};
export type ComposeDeps = {
  taste: Pick<ShelfTaste, "get" | "rejectedKeys" | "addCards">;
  interpreter: TasteInterpreter | null;
  labelImage: (bytes: Uint8Array, mimeType: "image/png" | "image/jpeg" | "image/webp") => Promise<InspirationLabels>;
  libraryLabels: (itemIds: string[]) => Promise<{ name: string; labels: InspirationLabels }[]>;
  fetchLink: typeof fetchLinkText;
  extract: typeof extractAttachmentText;
};
export type ComposeResult =
  | { ok: true; cards: ShelfTasteSuggestion[]; skipped: { name: string; reason: string }[] }
  | { ok: false; error: "unavailable" | "invalid_request" | "not_found" | "unreadable" };

const SKIP_TEXT = {
  file: "Couldn't read this file",
  link: "Couldn't read that link",
  blocked: "That link is blocked",
  image: "Couldn't read that image",
} as const;

function labelsText(labels: InspirationLabels): string {
  return `Image labels: theme ${labels.theme}; colours ${labels.colors.join(", ")}; style words ${labels.styleWords.join(", ") || "none"}; patterns ${labels.patterns.join(", ") || "none"}. ${labels.description}`;
}

function mapTasteError(error: ShelfTasteError | "conflict"): "unavailable" | "invalid_request" | "not_found" {
  if (error === "not_found" || error === "invalid_request") return error;
  return "unavailable";
}

export async function runCompose(input: ComposeInput, deps: ComposeDeps): Promise<ComposeResult> {
  const { words, urls, files, libraryItemIds } = input;
  if (
    words.length > COMPOSE_LIMITS.words ||
    urls.length > COMPOSE_LIMITS.urls ||
    files.length > COMPOSE_LIMITS.files ||
    libraryItemIds.length > COMPOSE_LIMITS.library
  ) {
    return { ok: false, error: "invalid_request" };
  }
  if (!words.trim() && urls.length === 0 && files.length === 0 && libraryItemIds.length === 0 && input.preset === null) {
    return { ok: false, error: "invalid_request" };
  }

  const snapshot = await deps.taste.get();
  if (!snapshot.ok) return { ok: false, error: mapTasteError(snapshot.error) };
  if (!snapshot.value) return { ok: false, error: "not_found" };
  const { board } = snapshot.value;
  const rejected = await deps.taste.rejectedKeys();
  const rejectedKeys = rejected.ok ? rejected.value : [];

  let cards: TasteComposerCard[];
  let origin: "composer" | "preset" = "composer";
  const skipped: { name: string; reason: string }[] = [];

  if (input.preset === "apple") {
    cards = appleTasteCards(board, rejectedKeys);
    origin = "preset";
  } else {
    if (!deps.interpreter) return { ok: false, error: "unavailable" };
    const sources: InterpreterSource[] = [];
    for (const url of urls) {
      const link = await deps.fetchLink(url);
      if (link.ok) sources.push({ kind: "link", name: link.name, text: link.text });
      else skipped.push({ name: link.name, reason: link.reason === "blocked" ? SKIP_TEXT.blocked : SKIP_TEXT.link });
    }
    for (const file of files) {
      if (attachmentKind(file.name, file.mimeType) === "image") {
        try {
          const labels = await deps.labelImage(file.bytes, file.mimeType as "image/png" | "image/jpeg" | "image/webp");
          sources.push({ kind: "image", name: file.name, text: labelsText(labels) });
        } catch {
          skipped.push({ name: file.name, reason: SKIP_TEXT.image });
        }
        continue;
      }
      const read = await deps.extract(file);
      if (read.ok) sources.push({ kind: "file", name: read.name, text: read.text });
      else skipped.push({ name: file.name, reason: SKIP_TEXT.file });
    }
    if (libraryItemIds.length > 0) {
      for (const item of await deps.libraryLabels(libraryItemIds)) {
        sources.push({ kind: "image", name: item.name, text: labelsText(item.labels) });
      }
    }
    if (sources.length === 0 && !words.trim()) return { ok: false, error: "unreadable" };

    const replyTo = new Set(input.replyTo);
    try {
      cards = await deps.interpreter.interpret({
        words,
        sources,
        board,
        rejectedKeys,
        tile: input.tile,
        pending: snapshot.value.pending
          .filter((p) => replyTo.has(p.id))
          .map(({ tile, op, value, reason }) => ({ tile, op, value, reason })),
      });
    } catch {
      return { ok: false, error: "unavailable" };
    }
    cards = filterComposerCards(cards, board, rejectedKeys);
    if (input.tile) cards = cards.filter((card) => card.tile === input.tile);
  }

  if (cards.length === 0) return { ok: true, cards: [], skipped };
  const stored = await deps.taste.addCards(
    cards.map((card) => ({ card, origin })),
    input.replyTo,
  );
  if (!stored.ok) return { ok: false, error: "unavailable" };
  const after = await deps.taste.get();
  const ids = new Set(stored.value.ids);
  const fresh = after.ok && after.value ? after.value.pending.filter((p) => ids.has(p.id)) : [];
  return { ok: true, cards: fresh, skipped };
}
