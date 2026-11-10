import "server-only";

import {
  applyTasteOperation,
  tasteValueKey,
  TasteComposerCardSchema,
  type TasteBoard,
  type TasteComposerCard,
  type TasteTile,
} from "@meld/contracts";
import { TASTE_INTERPRETER_PROMPT } from "./interpreter-prompt";

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CARDS = 8;

export type InterpreterSource = { kind: "file" | "link" | "image"; name: string; text: string };
export type InterpreterInput = {
  words: string;
  sources: InterpreterSource[];
  board: TasteBoard;
  rejectedKeys: string[];
  tile: TasteTile | null;
  pending: { tile: TasteTile; op: string; value: unknown; reason: string }[];
};
export type TasteInterpreter = {
  model: string;
  interpret(input: InterpreterInput): Promise<TasteComposerCard[]>;
};
export type TasteInterpreterErrorCode = "network" | "timeout" | "http" | "bad_json" | "invalid_response";

export class TasteInterpreterError extends Error {
  constructor(readonly code: TasteInterpreterErrorCode) {
    super(`Taste interpretation failed: ${code}`);
    this.name = "TasteInterpreterError";
  }
}

export function createDeepSeekTasteInterpreter({
  apiKey,
  model,
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): TasteInterpreter {
  return {
    model,
    async interpret(input) {
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: TASTE_INTERPRETER_PROMPT },
              {
                role: "user",
                content: JSON.stringify({
                  words: input.words,
                  sources: input.sources,
                  board: input.board,
                  rejectedKeys: input.rejectedKeys,
                  tile: input.tile,
                  pending: input.pending,
                }),
              },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut =
          error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new TasteInterpreterError(timedOut ? "timeout" : "network");
      }
      if (!response.ok) throw new TasteInterpreterError("http");
      let raw: unknown;
      try {
        const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = body.choices?.[0]?.message?.content;
        raw = JSON.parse(typeof content === "string" ? content : "");
      } catch {
        throw new TasteInterpreterError("bad_json");
      }
      const list = (raw as { cards?: unknown })?.cards;
      if (!Array.isArray(list)) throw new TasteInterpreterError("invalid_response");
      const valid: TasteComposerCard[] = [];
      for (const item of list) {
        const parsed = TasteComposerCardSchema.safeParse(item);
        if (parsed.success) valid.push(parsed.data);
      }
      return valid.slice(0, MAX_CARDS);
    },
  };
}

/** Drops no-ops, already-rejected changes and duplicates. Locks are ignored: the owner asked for this. */
export function filterComposerCards(
  cards: TasteComposerCard[],
  board: TasteBoard,
  rejectedKeys: string[],
): TasteComposerCard[] {
  const rejected = new Set(rejectedKeys);
  const seen = new Set<string>();
  const kept: TasteComposerCard[] = [];
  for (const card of cards) {
    if (card.tile === "colors") continue; // the composer never proposes colours
    const op = { tile: card.tile, op: card.op, value: card.value } as Parameters<typeof tasteValueKey>[0];
    const key = tasteValueKey(op);
    if (rejected.has(key) || seen.has(key) || applyTasteOperation(board, op) === null) continue;
    seen.add(key);
    kept.push(card);
  }
  return kept;
}
