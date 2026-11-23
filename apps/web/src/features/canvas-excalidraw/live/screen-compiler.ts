import { z } from "zod";
import { MAX_SCREEN_SOURCE_BYTES, ScreenFilesSchema } from "@meld/screen-runtime/source";
import type { CompileResult } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { FIELDS, MAX_TEXT_RUNS, type Files, type Inspection, type Tweak, type EditResult } from "@meld/screen-runtime/edit/types";
import type { Calls, SourceRequest } from "./source-protocol-types";

export type ScreenCompiler = {
  compile(source: ScreenSource, options: { tagElements: boolean }): Promise<CompileResult>;
  inspect(files: Files, src: string): Promise<Inspection>;
  tweak(files: Files, src: string, tweak: Tweak): Promise<EditResult>;
  links(files: Files): Promise<string[]>;
  dispose(): void;
};
export type WorkerLike = Pick<Worker, "postMessage" | "addEventListener" | "terminate">;
export const COMPILER_STOPPED_MESSAGE = "The screen compiler stopped. Try again.";
const CLOSED = "The screen compiler was closed.";
const UNAVAILABLE = "This browser could not start the screen editor.";
const idSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const operationSchema = z.enum(["compile", "inspect", "tweak", "links"]);
const fieldState = z.object({ editable: z.boolean(), value: z.string().nullable() }).strict();
// Only text may list its runs: 2 to MAX_TEXT_RUNS strings, each no longer than a screen's source.
const textState = fieldState.extend({ runs: z.array(z.string().max(MAX_SCREEN_SOURCE_BYTES)).min(2).max(MAX_TEXT_RUNS).optional() }).strict();
// Built from the edit engine's own field list, so a new field can never be silently rejected here.
const inspection = z.object({ ...Object.fromEntries(FIELDS.map((field) => [field, fieldState])) as Record<(typeof FIELDS)[number], typeof fieldState>, text: textState }).strict().nullable();
const links = z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).max(100);
const compile = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), screen: z.object({ kind: z.enum(["html", "react"]), styles: z.array(z.string()), scripts: z.array(z.string()), html: z.string(), links }).strict() }).strict(),
  z.object({ ok: z.literal(false), errors: z.array(z.object({ file: z.string(), message: z.string(), line:z.number().int().positive().optional(), column:z.number().int().nonnegative().optional() }).strict()) }).strict(),
]);
const edit = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), files: ScreenFilesSchema }).strict(),
  z.object({ ok: z.literal(false), reason: z.enum(["not-found", "not-literal"]) }).strict(),
]);
const replySchema = z.union([
  z.object({ id: idSchema, op: z.literal("compile"), result: compile }).strict(),
  z.object({ id: idSchema, op: z.literal("inspect"), result: inspection }).strict(),
  z.object({ id: idSchema, op: z.literal("tweak"), result: edit }).strict(),
  z.object({ id: idSchema, op: z.literal("links"), result: links }).strict(),
  z.object({ id: idSchema, op: operationSchema, error: z.string() }).strict(),
]);
type Pending = { op: keyof Calls; resolve: (result: unknown) => void; reject: (error: Error) => void };

export function createWorkerCompiler(makeWorker: () => WorkerLike = () => new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module" })): ScreenCompiler {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  let disposed = false;
  const pending = new Map<number, Pending>();
  const failAll = (message: string) => {
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
  };
  function ensure(): WorkerLike {
    if (worker) return worker;
    const created = makeWorker();
    created.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (worker !== created) return;
      const identity = z.object({ id: idSchema }).safeParse(event.data);
      if (!identity.success) return;
      const entry = pending.get(identity.data.id);
      if (!entry) return;
      pending.delete(identity.data.id);
      const reply = replySchema.safeParse(event.data);
      if (!reply.success) { entry.reject(new Error("Invalid screen worker reply")); return; }
      if (reply.data.op !== entry.op) { entry.reject(new Error("Unexpected screen worker operation")); return; }
      if ("error" in reply.data) { entry.reject(new Error(reply.data.error)); return; }
      entry.resolve(reply.data.result);
    });
    const crashed = () => {
      if (worker !== created) return;
      worker = null;
      failAll(COMPILER_STOPPED_MESSAGE);
      created.terminate();
    };
    created.addEventListener("error", crashed);
    created.addEventListener("messageerror", crashed);
    worker = created;
    return created;
  }
  function call<K extends keyof Calls>(op: K, args: Calls[K]["args"]): Promise<Calls[K]["result"]> {
    return new Promise((resolve, reject) => {
      if (disposed) { reject(new Error(CLOSED)); return; }
      let requestId: number | null = null;
      try {
        const target = ensure();
        requestId = nextId++;
        const request = { id: requestId, op, ...args } as SourceRequest;
        pending.set(requestId, { op, resolve: result => resolve(result as Calls[K]["result"]), reject });
        target.postMessage(request);
      } catch (error) {
        if (requestId !== null) pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  return {
    compile: (source, options) => call("compile", { source, tagElements: options.tagElements }),
    inspect: (files, src) => call("inspect", { files, src }),
    tweak: (files, src, tweak) => call("tweak", { files, src, tweak }),
    links: files => call("links", { files }),
    dispose() { disposed = true; worker?.terminate(); worker = null; failAll(CLOSED); },
  };
}

export function createScreenCompiler(): ScreenCompiler {
  if (typeof Worker !== "undefined") return createWorkerCompiler();
  const unavailable = () => Promise.reject(new Error(UNAVAILABLE));
  return {
    compile: async () => ({ ok: false, errors: [{ file: "", message: UNAVAILABLE }] }),
    inspect: unavailable, tweak: unavailable, links: unavailable,
    dispose() {},
  };
}
