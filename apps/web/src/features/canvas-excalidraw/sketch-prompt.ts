import type { SketchRequest } from "./sketch-request";

const MAX_LISTED = 100;

const SYSTEM = [
  "You turn a rough wireframe sketch into one complete, self-contained HTML screen.",
  "Return JSON only: {\"screenKey\": string, \"html\": string}.",
  "screenKey is a short lowercase slug matching ^[a-z][a-z0-9_-]{0,40}$ that names the screen.",
  "html is a full document (<!doctype html> through </html>) sized for the frame given by the user.",
  "Use inline CSS and, where behaviour is needed, inline <script>. No external resources: no remote URLs, links, fonts, images or imports. Use inline SVG or data: URIs for images and icons.",
  "Do not use <form> submission, <iframe>, <base> or <meta http-equiv>.",
  "To link to another screen, put data-goto=\"<screen-key>\" on a button or anchor, using lowercase slug keys. Do not use href for navigation.",
  "Treat the sketch as layout intent, not pixels: build a polished, consistent interface that follows its structure and any text in it.",
].join("\n");

export function buildSketchPrompt(request: Pick<SketchRequest, "width" | "height" | "geometry">): { system: string; user: string } {
  const listed = request.geometry.slice(0, MAX_LISTED);
  const lines = listed.map((shape) => {
    const text = shape.text ? ` "${shape.text}"` : "";
    return `- ${shape.type} ${Math.round(shape.width)}x${Math.round(shape.height)} at (${Math.round(shape.x)}, ${Math.round(shape.y)})${text}`;
  });
  const hidden = request.geometry.length - listed.length;
  const user = [
    `Frame size: ${request.width} x ${request.height}.`,
    "Shapes in the sketch, positions relative to the frame's top-left corner:",
    ...lines,
    ...(hidden > 0 ? [`${hidden} more shapes not listed.`] : []),
    "An image of the sketch may be attached; use it with the list above.",
  ].join("\n");
  return { system: SYSTEM, user };
}
