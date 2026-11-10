import { TASTE_TILES, type TasteComposerCard } from "@meld/contracts";
import { z } from "zod";
import { createDeepSeekLabeler, DEEPSEEK_DEFAULT_MODEL } from "@/features/inspiration/sorting/deepseek-labeler";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { composeLimiter } from "@/features/inspiration/taste/compose/compose-rate-limit";
import { extractAttachmentText, ATTACHMENT_MAX_BYTES } from "@/features/inspiration/taste/compose/extract-attachment-text";
import { fetchLinkText } from "@/features/inspiration/taste/compose/fetch-link-text";
import { runCompose } from "@/features/inspiration/taste/compose/run-compose";
import { createDeepSeekTasteInterpreter } from "@/features/inspiration/taste/compose/taste-interpreter";
import { DEEPSEEK_TEXT_DEFAULT_MODEL } from "@/features/inspiration/taste/deepseek-taste-writer";
import { fakeComposerCards } from "@/features/inspiration/taste/taste-fake";
import { tasteForRequest } from "../taste-for-request";

const Uuid = z.string().uuid();
const jsonList = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "json" });
        return z.NEVER;
      }
    })
    .pipe(z.array(item).max(max));

const Fields = z.object({
  words: z.string().max(4000),
  urls: jsonList(z.string().url(), 3),
  libraryItemIds: jsonList(Uuid, 3),
  replyTo: jsonList(Uuid, 8),
  tile: z.enum(TASTE_TILES).nullable(),
});

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;

  // Demo / preview: no DeepSeek interpreter — return deterministic composer cards.
  if (isRoomFakeEnabled()) {
    let replyTo: string[] = [];
    try {
      const form = await request.formData();
      const parsed = z.array(Uuid).safeParse(JSON.parse(field(form, "replyTo") ?? "[]"));
      if (parsed.success) replyTo = parsed.data;
    } catch {
      replyTo = [];
    }
    const cards = fakeComposerCards() as TasteComposerCard[];
    const stored = await resolved.taste.addCards(
      cards.map((card) => ({ card, origin: "composer" as const })),
      replyTo,
    );
    if (!stored.ok) return shelfError("unavailable");
    const after = await resolved.taste.get();
    const ids = new Set(stored.value.ids);
    const fresh = after.ok && after.value ? after.value.pending.filter((p) => ids.has(p.id)) : [];
    return Response.json({ cards: fresh, skipped: [] });
  }

  const principalKey = request.headers.get("authorization") ?? "anonymous";
  if (!composeLimiter.take(principalKey)) return shelfError("rate_limited");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return shelfError("invalid_request");
  }
  const parsed = Fields.safeParse({
    words: field(form, "words") ?? "",
    urls: field(form, "urls") ?? "[]",
    libraryItemIds: field(form, "libraryItemIds") ?? "[]",
    replyTo: field(form, "replyTo") ?? "[]",
    tile: field(form, "tile") ?? null,
  });
  if (!parsed.success) return shelfError("invalid_request");

  const files: { name: string; mimeType: string; bytes: Uint8Array }[] = [];
  for (const value of form.getAll("file")) {
    if (!(value instanceof File)) continue;
    if (value.size > ATTACHMENT_MAX_BYTES) return shelfError("too_large");
    files.push({ name: value.name, mimeType: value.type, bytes: new Uint8Array(await value.arrayBuffer()) });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const result = await runCompose(
    { ...parsed.data, files },
    {
      taste: resolved.taste,
      interpreter: apiKey
        ? createDeepSeekTasteInterpreter({
            apiKey,
            model: process.env.DEEPSEEK_TEXT_MODEL || DEEPSEEK_TEXT_DEFAULT_MODEL,
          })
        : null,
      labelImage: (bytes, mimeType) => {
        if (!apiKey) return Promise.reject(new Error("no key"));
        return createDeepSeekLabeler({
          apiKey,
          model: process.env.DEEPSEEK_VISION_MODEL || DEEPSEEK_DEFAULT_MODEL,
        }).label(bytes, mimeType);
      },
      libraryLabels: (ids) => resolved.libraryLabels(ids),
      fetchLink: fetchLinkText,
      extract: extractAttachmentText,
    },
  );
  if (!result.ok) return shelfError(result.error === "unreadable" ? "invalid_request" : result.error);
  return Response.json({ cards: result.cards, skipped: result.skipped });
}
