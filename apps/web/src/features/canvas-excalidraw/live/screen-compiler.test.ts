import { describe, expect, it, vi } from "vitest";
import { COMPILER_STOPPED_MESSAGE, createInlineCompiler, createWorkerCompiler, type WorkerLike } from "./screen-compiler";

const source = { kind: "react" as const, files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" };

function fakeWorker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const worker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn((type: string, handler: (event: unknown) => void) => { handlers[type] = handler; }),
    terminate: vi.fn(),
  };
  return { worker: worker as unknown as WorkerLike, raw: worker, handlers };
}

describe("createWorkerCompiler", () => {
  it("matches replies to requests by id and creates the worker lazily", async () => {
    const fake = fakeWorker();
    const make = vi.fn(() => fake.worker);
    const compiler = createWorkerCompiler(make);
    expect(make).not.toHaveBeenCalled();
    const first = compiler.compile(source, { tagElements: true });
    const second = compiler.compile(source, { tagElements: false });
    expect(fake.raw.postMessage.mock.calls.map(([request]) => request)).toEqual([
      { id: 0, source, tagElements: true }, { id: 1, source, tagElements: false },
    ]);
    fake.handlers.message({ data: { id: 1, result: { ok: false, errors: [] } } });
    fake.handlers.message({ data: { id: 0, result: { ok: true, screen: "first" } } });
    await expect(first).resolves.toEqual({ ok: true, screen: "first" });
    await expect(second).resolves.toEqual({ ok: false, errors: [] });
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("rejects pending work when the worker crashes and starts a new one next time", async () => {
    const fakes = [fakeWorker(), fakeWorker()];
    const make = vi.fn(() => fakes[make.mock.calls.length - 1].worker);
    const compiler = createWorkerCompiler(make);
    const pending = compiler.compile(source, { tagElements: true });
    fakes[0].handlers.error({});
    await expect(pending).rejects.toThrow(COMPILER_STOPPED_MESSAGE);
    expect(fakes[0].raw.terminate).toHaveBeenCalled();
    void compiler.compile(source, { tagElements: true });
    expect(make).toHaveBeenCalledTimes(2);
  });
});

describe("createInlineCompiler", () => {
  it("compiles on the calling thread", async () => {
    await expect(createInlineCompiler().compile(source, { tagElements: false })).resolves.toMatchObject({ ok: true });
    await expect(createInlineCompiler().compile({ ...source, files: { "App.tsx": 'import x from "next/link"; export default x;' } }, { tagElements: false }))
      .resolves.toEqual({ ok: false, errors: [{ file: "App.tsx", message: "Unsupported package: next/link" }] });
  });
});
