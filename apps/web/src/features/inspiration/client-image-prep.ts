import { INSPIRATION_LIMITS } from "@meld/contracts";

// Browser-side mirror of the shelf's ImageNormalizer rules (spec B3), so web
// uploads reach the server already in a stored format and within limits.
export type PrepPlan =
  | { kind: "pass" }
  | { kind: "encode"; type: "image/png" | "image/jpeg"; maxEdge: number | null }
  | { kind: "reject"; message: string };

const STORED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const JPEG_QUALITY = 0.85;
const HEIC_MESSAGE = "Drop HEIC photos on the menu-bar shelf instead.";
const NOT_IMAGE_MESSAGE = "Only images can be saved.";
const UNREADABLE_MESSAGE = "That file isn't a readable image.";
const TOO_LARGE_MESSAGE = "Too large to save.";

export function planImagePrep(input: {
  type: string;
  size: number;
  width: number;
  height: number;
}): PrepPlan {
  if (HEIC_TYPES.has(input.type)) return { kind: "reject", message: HEIC_MESSAGE };
  if (!input.type.startsWith("image/")) return { kind: "reject", message: NOT_IMAGE_MESSAGE };
  const tooBig =
    Math.max(input.width, input.height) > INSPIRATION_LIMITS.maxEdge ||
    input.size > INSPIRATION_LIMITS.maxBytes;
  if (tooBig) return { kind: "encode", type: "image/jpeg", maxEdge: INSPIRATION_LIMITS.maxEdge };
  if (STORED_TYPES.has(input.type)) return { kind: "pass" };
  return { kind: "encode", type: "image/png", maxEdge: null };
}

async function encode(
  bitmap: ImageBitmap,
  type: string,
  maxEdge: number | null,
): Promise<Blob | null> {
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
}

export async function prepareImageForUpload(
  file: File,
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  if (HEIC_TYPES.has(file.type)) return { ok: false, message: HEIC_MESSAGE };
  if (!file.type.startsWith("image/")) return { ok: false, message: NOT_IMAGE_MESSAGE };

  let bitmap: ImageBitmap;
  try {
    // For a GIF this decodes the first frame only, which is what we store.
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: UNREADABLE_MESSAGE };
  }
  try {
    const plan = planImagePrep({
      type: file.type,
      size: file.size,
      width: bitmap.width,
      height: bitmap.height,
    });
    if (plan.kind === "reject") return { ok: false, message: plan.message };
    if (plan.kind === "pass") return { ok: true, blob: file };

    const first = await encode(bitmap, plan.type, plan.maxEdge);
    if (first && first.size <= INSPIRATION_LIMITS.maxBytes) return { ok: true, blob: first };
    const fallback = await encode(bitmap, "image/jpeg", INSPIRATION_LIMITS.fallbackEdge);
    if (fallback && fallback.size <= INSPIRATION_LIMITS.maxBytes) return { ok: true, blob: fallback };
    return { ok: false, message: TOO_LARGE_MESSAGE };
  } finally {
    bitmap.close();
  }
}
