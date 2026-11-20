import type { ScreenSource } from "@meld/screen-runtime/source";
export async function copyFile(
  source: ScreenSource,
  path: string,
): Promise<void> {
  if (!Object.hasOwn(source.files, path))
    throw new Error("Choose a source file to copy.");
  await navigator.clipboard.writeText(source.files[path]);
}
export async function downloadBlob(source: ScreenSource, name: string) {
  const entries = Object.entries(source.files);
  if (entries.length === 1) {
    const [path, code] = entries[0];
    return {
      name: path.split("/").at(-1)!,
      blob: new Blob([code], { type: "text/plain;charset=utf-8" }),
    };
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [path, code] of entries)
    zip.file(path, code, { createFolders: false });
  const base =
    name
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "screen";
  return {
    name: base + ".zip",
    blob: await zip.generateAsync({ type: "blob" }),
  };
}
export async function downloadSource(source: ScreenSource, name: string) {
  const out = await downloadBlob(source, name),
    url = URL.createObjectURL(out.blob);
  const anchor = document.createElement("a");
  anchor.download = out.name;
  anchor.href = url;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
