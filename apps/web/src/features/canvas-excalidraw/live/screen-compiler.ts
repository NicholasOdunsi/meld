import type { CompileResult } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { CompileRequest, CompileResponse } from "./compile-protocol";

export type ScreenCompiler = {
  compile(source: ScreenSource, options: { tagElements: boolean }): Promise<CompileResult>;
  dispose(): void;
};
export type WorkerLike = Pick<Worker, "postMessage" | "addEventListener" | "terminate">;
export const COMPILER_STOPPED_MESSAGE = "The screen compiler stopped. Try again.";

type Pending = { resolve: (result: CompileResult) => void; reject: (error: Error) => void };

export function createWorkerCompiler(
  makeWorker: () => WorkerLike = () => new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module" }),
): ScreenCompiler {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  const pending = new Map<number, Pending>();
  const failAll = (message: string) => {
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
  };
  function ensure(): WorkerLike {
    if (worker) return worker;
    const created = makeWorker();
    created.addEventListener("message", (event: MessageEvent<CompileResponse>) => {
      const entry = pending.get(event.data?.id);
      if (!entry) return;
      pending.delete(event.data.id);
      entry.resolve(event.data.result);
    });
    created.addEventListener("error", () => {
      failAll(COMPILER_STOPPED_MESSAGE);
      created.terminate();
      if (worker === created) worker = null;
    });
    worker = created;
    return created;
  }
  return {
    compile(source, options) {
      const target = ensure();
      const request: CompileRequest = { id: nextId++, source, tagElements: options.tagElements };
      return new Promise<CompileResult>((resolve, reject) => {
        pending.set(request.id, { resolve, reject });
        target.postMessage(request);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll("The screen compiler was closed.");
    },
  };
}

// Tests and environments without Worker compile on the calling thread.
export function createInlineCompiler(): ScreenCompiler {
  let nextId = 0;
  return {
    async compile(source, options) {
      const { handleCompileRequest } = await import("./compile-protocol");
      const response = handleCompileRequest({ id: nextId++, source, tagElements: options.tagElements });
      return response ? response.result : { ok: false, errors: [{ file: "", message: "This screen could not be compiled." }] };
    },
    dispose() {},
  };
}

export function createScreenCompiler(): ScreenCompiler {
  return typeof Worker === "undefined" ? createInlineCompiler() : createWorkerCompiler();
}
