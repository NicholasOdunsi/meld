import { describe, expect, it } from "vitest";
import { handleCompileRequest } from "./compile-protocol";

const react = { kind: "react", files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" };

describe("handleCompileRequest", () => {
  it("compiles a valid request", () => {
    const response = handleCompileRequest({ id: 3, source: react, tagElements: true });
    expect(response?.id).toBe(3);
    expect(response?.result.ok).toBe(true);
  });
  it("returns compile errors for an invalid source", () => {
    expect(handleCompileRequest({ id: 4, source: { ...react, entry: "Main.tsx" }, tagElements: false })).toEqual({
      id: 4, result: { ok: false, errors: [{ file: "", message: "The entry must be one of the files" }] },
    });
  });
  it("ignores messages that are not compile requests", () => {
    expect(handleCompileRequest({ id: "x" })).toBeNull();
    expect(handleCompileRequest(null)).toBeNull();
  });
});
