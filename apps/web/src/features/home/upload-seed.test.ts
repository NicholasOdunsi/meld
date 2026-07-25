import { expect, it } from "vitest";
import { deriveRoomNameFromFiles } from "./upload-seed";

it("names the room after a single upload", () => {
  expect(deriveRoomNameFromFiles(["checkout-brief.md"])).toBe(
    "Checkout brief",
  );
});

it("names the room after the first upload and a count", () => {
  expect(
    deriveRoomNameFromFiles(["checkout-brief.md", "notes.txt"]),
  ).toBe("Checkout brief and 1 more");
});

it("falls back when there are no files", () => {
  expect(deriveRoomNameFromFiles([])).toBe("Imported documents");
});

it("truncates to the 120 character room-name limit", () => {
  const long = `${"a".repeat(200)}.md`;
  expect(deriveRoomNameFromFiles([long]).length).toBeLessThanOrEqual(
    120,
  );
});
