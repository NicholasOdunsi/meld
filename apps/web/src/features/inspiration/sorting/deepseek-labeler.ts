import "server-only";

import { InspirationLabelsSchema, type InspirationLabels, type InspirationMimeType } from "@meld/contracts";
import { INSPIRATION_SORT_SYSTEM_PROMPT } from "./sort-prompt";

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-flash";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

export type InspirationLabeler = {
  model: string;
  label(bytes: Uint8Array, mimeType: InspirationMimeType): Promise<InspirationLabels>;
};

export type LabelerErrorCode = "network" | "timeout" | "http" | "bad_json" | "invalid_labels";

export class LabelerError extends Error {
  constructor(readonly code: LabelerErrorCode) {
    super(`Inspiration labeling failed: ${code}`);
    this.name = "LabelerError";
  }
}

export function createDeepSeekLabeler({
  apiKey,
  model,
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): InspirationLabeler {
  return {
    model,
    async label(bytes, mimeType) {
      const imageUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
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
              { role: "system", content: INSPIRATION_SORT_SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: "Label this screenshot." },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const isTimeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new LabelerError(isTimeout ? "timeout" : "network");
      }
      if (!response.ok) throw new LabelerError("http");

      let labels: unknown;
      try {
        const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = body.choices?.[0]?.message?.content;
        labels = JSON.parse(typeof content === "string" ? content : "");
      } catch {
        throw new LabelerError("bad_json");
      }
      const parsed = InspirationLabelsSchema.safeParse(labels);
      if (!parsed.success) throw new LabelerError("invalid_labels");
      return parsed.data;
    },
  };
}
