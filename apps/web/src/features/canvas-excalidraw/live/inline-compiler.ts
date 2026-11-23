// Explicitly injected test adapter; never imported by the production facade.
import { handleSourceRequest } from "./compile-protocol";
import type { Calls, SourceRequest } from "./source-protocol-types";
import type { ScreenCompiler } from "./screen-compiler";

export function createInlineCompiler(): ScreenCompiler {
  let nextId = 0;
  let disposed = false;
  async function call<K extends keyof Calls>(op: K, args: Calls[K]["args"]): Promise<Calls[K]["result"]> {
    if (disposed) throw new Error("The screen compiler was closed.");
    const reply = handleSourceRequest({ id: nextId++, op, ...args } as SourceRequest);
    if (!reply) throw new Error("Invalid screen editor request");
    if ("error" in reply) throw new Error(reply.error);
    return reply.result as Calls[K]["result"];
  }
  return {
    compile: (source, options) => call("compile", { source, tagElements: options.tagElements }),
    inspect: (files, src) => call("inspect", { files, src }),
    tweak: (files, src, tweak) => call("tweak", { files, src, tweak }),
    links: files => call("links", { files }),
    dispose() { disposed = true; },
  };
}
