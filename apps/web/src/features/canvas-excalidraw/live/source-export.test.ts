import { afterEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { copyFile, downloadBlob, downloadSource } from "./source-export";
const source = {
  kind: "react" as const,
  entry: "App.tsx",
  files: {
    "App.tsx": "export default ()=> <p>Hi 🚲</p>",
    "ui/main.css": "p { color:red }\n",
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("roundtrips all authored paths and bytes without synthesized folders", async () => {
  const { blob, name } = await downloadBlob(source, "My page!");
  expect(name).toBe("My-page.zip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  expect(Object.keys(zip.files).sort()).toEqual(
    Object.keys(source.files).sort(),
  );
  for (const [path, code] of Object.entries(source.files))
    expect(await zip.file(path)!.async("string")).toBe(code);
});
it("keeps original single file basename and bytes", async () => {
  const result = await downloadBlob(
    {
      kind: "html",
      entry: "ui/page.html",
      files: { "ui/page.html": "<p>😀</p>\r\n" },
    },
    "other",
  );
  expect(result.name).toBe("page.html");
  expect(await result.blob.text()).toBe("<p>😀</p>\r\n");
});
it("copies the active file exactly and surfaces failures", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await copyFile(source, "ui/main.css");
  expect(writeText).toHaveBeenCalledExactlyOnceWith(
    source.files["ui/main.css"],
  );
  await expect(copyFile(source, "missing")).rejects.toThrow();
  writeText.mockRejectedValue(new Error("denied"));
  await expect(copyFile(source, "App.tsx")).rejects.toThrow("denied");
});
it("removes download anchors and revokes object urls after dispatch", async () => {
  vi.useFakeTimers();
  const click = vi.fn(),
    remove = vi.fn(),
    append = vi.fn();
  vi.stubGlobal("document", {
    createElement: () => ({ click, remove }),
    body: { append },
  });
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:source",
    revokeObjectURL,
  });
  await downloadSource(
    { kind: "html", entry: "page.html", files: { "page.html": "hello" } },
    "page",
  );
  expect(click).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
  expect(revokeObjectURL).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:source");
});
