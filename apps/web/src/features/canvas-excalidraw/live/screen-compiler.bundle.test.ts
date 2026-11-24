import { expect, it } from "vitest";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
it('keeps parser implementations and inline adapter out of the browser client graph',async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('./screen-compiler.ts',import.meta.url))],bundle:true,platform:'browser',format:'esm',metafile:true,write:false});
  expect(Object.keys(result.metafile!.inputs).filter(path=>/@babel\/standalone|\/parse5\/|\/postcss\/|\/edit\/(?:index|html|jsx|style)\.ts|compile-protocol\.ts|inline-compiler\.ts/.test(path))).toEqual([]);
  expect(Object.values(result.metafile!.outputs).flatMap(out=>out.imports)).toEqual([]);
});

it('bundles the integrated source worker with browser parser implementations',async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('./compile.worker.ts',import.meta.url))],bundle:true,platform:'browser',format:'esm',metafile:true,write:false});
  expect(Object.keys(result.metafile!.inputs).some(path=>path.includes('/edit/index.ts'))).toBe(true);
  expect(Object.keys(result.metafile!.inputs).some(path=>path.includes('/postcss/'))).toBe(true);
  expect(Object.values(result.metafile!.outputs).flatMap(out=>out.imports)).toEqual([]);
});
