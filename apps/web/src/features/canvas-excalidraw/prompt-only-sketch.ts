import type { SketchRequest } from "./sketch-request";

// A typed instruction can start a screen without requiring a drawn frame.
// Mobile requests get a phone-sized canvas; other requests get a desktop frame.
export function promptOnlySketch(instruction: string): SketchRequest {
  return /\b(mobile|phone|iphone|android)\b/i.test(instruction)
    ? { width: 390, height: 844, geometry: [] }
    : { width: 1280, height: 800, geometry: [] };
}
