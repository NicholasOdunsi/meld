import { expect, it } from "vitest";
import { deriveRoomNameFromQuestion } from "./ask-seed";

it("capitalises the first character", () => {
  expect(deriveRoomNameFromQuestion("how do refunds work")).toBe(
    "How do refunds work",
  );
});

it("strips a trailing question mark", () => {
  expect(deriveRoomNameFromQuestion("how do refunds work?")).toBe(
    "How do refunds work",
  );
});

it("strips a run of trailing question marks", () => {
  expect(deriveRoomNameFromQuestion("really???")).toBe("Really");
});

it("collapses internal whitespace", () => {
  expect(deriveRoomNameFromQuestion("how   do\n\nrefunds work")).toBe(
    "How do refunds work",
  );
});

// RoomInputSchema caps a room name at 120 characters, so anything longer
// would be rejected by the server action rather than truncated by it.
it("truncates to 120 characters on a word boundary", () => {
  const long = `${"alpha ".repeat(40)}omega`;
  const name = deriveRoomNameFromQuestion(long);

  expect(name.length).toBeLessThanOrEqual(120);
  expect(name.endsWith("alpha")).toBe(true);
});

// A single word longer than the limit has no boundary to cut on, so it is
// cut mid-word rather than returned over-length.
it("truncates a single long word without a boundary", () => {
  const name = deriveRoomNameFromQuestion("z".repeat(200));

  expect(name.length).toBe(120);
});

// The Ask row is only offered for a non-empty trimmed query, so this is a
// guard rather than a path -- but it must never return an empty string,
// which RoomInputSchema would reject.
it("falls back for input that trims to nothing", () => {
  expect(deriveRoomNameFromQuestion("   ?  ")).toBe("Untitled ask");
});
