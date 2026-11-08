import "server-only";

import {
  TasteFirstBoardResponseSchema,
  TasteSuggestionsResponseSchema,
  type TasteBoard,
  type TasteSignalReason,
  type TasteSuggestion,
} from "@meld/contracts";
import type { z } from "zod";
import type { TasteStats } from "./compute-taste-stats";
import { TASTE_SYSTEM_PROMPT } from "./taste-prompt";

export const DEEPSEEK_TEXT_DEFAULT_MODEL = "deepseek-flash";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;

export type TasteWriterInput = {
  stats: TasteStats;
  board: TasteBoard | null;
  locks: Record<string, number>;
  rejectedKeys: string[];
  redoSignals: { reason: TasteSignalReason; count: number }[];
};
export type TasteWriter = {
  model: string;
  firstBoard(input: TasteWriterInput): Promise<TasteBoard>;
  suggest(input: TasteWriterInput): Promise<TasteSuggestion[]>;
};
export type TasteWriterErrorCode = "network" | "timeout" | "http" | "bad_json" | "invalid_response";

export class TasteWriterError extends Error {
  constructor(readonly code: TasteWriterErrorCode) {
    super(`Taste writing failed: ${code}`);
    this.name = "TasteWriterError";
  }
}

/** Models sometimes return designLanguage as a space-separated string. */
export function normalizeTasteModelJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const board = root.board;
  if (!board || typeof board !== "object" || Array.isArray(board)) return value;
  const nextBoard = { ...(board as Record<string, unknown>) };
  if (typeof nextBoard.designLanguage === "string") {
    nextBoard.designLanguage = nextBoard.designLanguage.split(/\s+/).filter(Boolean);
  }
  return { ...root, board: nextBoard };
}

export function createDeepSeekTasteWriter({
  apiKey,
  model,
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): TasteWriter {
  async function call<S extends z.ZodTypeAny>(input: TasteWriterInput, schema: S): Promise<z.infer<S>> {
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
            { role: "system", content: TASTE_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(input) },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const isTimeout =
        error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new TasteWriterError(isTimeout ? "timeout" : "network");
    }
    if (!response.ok) throw new TasteWriterError("http");

    let value: unknown;
    try {
      const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = body.choices?.[0]?.message?.content;
      value = normalizeTasteModelJson(JSON.parse(typeof content === "string" ? content : ""));
    } catch (error) {
      if (error instanceof TasteWriterError) throw error;
      throw new TasteWriterError("bad_json");
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new TasteWriterError("invalid_response");
    return parsed.data;
  }

  return {
    model,
    async firstBoard(input) {
      return (await call(input, TasteFirstBoardResponseSchema)).board;
    },
    async suggest(input) {
      return (await call(input, TasteSuggestionsResponseSchema)).suggestions;
    },
  };
}
