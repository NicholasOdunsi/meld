import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handle } from "./cli";

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), "preview-cli-"));
  await mkdir(path.join(root, "app"), { recursive: true });
  await writeFile(path.join(root, "app/page.tsx"), "export default function A() {\n  return <p>Hi</p>;\n}\n");
  return root;
}

describe("handle", () => {
  it("inspects", async () => {
    const root = await project();
    const reply = await handle({ op: "inspect", root, src: { file: "app/page.tsx", line: 2, column: 10 } }) as { ok: boolean; fields: { text: { value: string } } };
    expect(reply.ok).toBe(true);
    expect(reply.fields.text.value).toBe("Hi");
  });
  it("applies a tweak", async () => {
    const root = await project();
    const reply = await handle({ op: "apply", root, src: { file: "app/page.tsx", line: 2, column: 10 }, tweak: { field: "text", value: "Yo" } }) as { ok: boolean };
    expect(reply.ok).toBe(true);
  });
  it("rejects malformed requests without throwing", async () => {
    expect(await handle({ op: "delete-everything" })).toEqual({ ok: false, reason: "not-found" });
    expect(await handle(null)).toEqual({ ok: false, reason: "not-found" });
    expect(await handle({ op: "apply", root: "/tmp", src: { file: "a.tsx", line: 0, column: 1 }, tweak: { field: "text", value: "x" } })).toEqual({ ok: false, reason: "not-found" });
  });
  it("rejects a field that is not editable", async () => {
    const root = await project();
    expect(await handle({ op: "apply", root, src: { file: "app/page.tsx", line: 2, column: 10 }, tweak: { field: "position", value: "x" } })).toEqual({ ok: false, reason: "not-found" });
  });
});
