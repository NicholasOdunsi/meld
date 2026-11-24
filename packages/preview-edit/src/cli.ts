import { FIELDS } from "@meld/screen-runtime/edit/types";
import { z } from "zod";
import { apply, inspect, restore } from "./edit-session";

const Source = z.object({
  file: z.string().min(1).max(300),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  fuzzy: z.boolean().optional(),
}).strict();

const Request = z.discriminatedUnion("op", [
  z.object({ op: z.literal("inspect"), root: z.string().min(1), src: Source }).strict(),
  z.object({
    op: z.literal("apply"), root: z.string().min(1), src: Source,
    tweak: z.object({ field: z.enum(FIELDS), value: z.string().max(2000), index: z.number().int().min(0).optional() }).strict(),
  }).strict(),
  z.object({
    op: z.literal("restore"), root: z.string().min(1),
    files: z.array(z.object({ path: z.string().min(1).max(300), expect: z.string(), contents: z.string() }).strict()).min(1).max(20),
  }).strict(),
]);

const REJECTED = { ok: false, reason: "not-found" } as const;

export async function handle(request: unknown): Promise<unknown> {
  const parsed = Request.safeParse(request);
  if (!parsed.success) return REJECTED;
  const { data } = parsed;
  try {
    if (data.op === "inspect") return await inspect(data.root, data.src);
    if (data.op === "apply") return await apply(data.root, data.src, data.tweak);
    return await restore(data.root, data.files);
  } catch {
    return REJECTED;
  }
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  let request: unknown = null;
  try { request = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* answered as rejected below */ }
  process.stdout.write(`${JSON.stringify(await handle(request))}\n`);
}

// Run only as the bundled helper, never when imported by a test.
if (process.argv[1]?.endsWith("edit-helper.mjs")) void main();
