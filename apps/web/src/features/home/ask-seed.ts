// The room name for a question typed into the deck's field, the counterpart
// to upload-seed.ts's deriveRoomNameFromFiles for dropped files. Kept out of
// the server action so the copy can be unit tested without Supabase wiring.
const MAX_ROOM_NAME_LENGTH = 120;
const FALLBACK_ROOM_NAME = "Untitled ask";

export function deriveRoomNameFromQuestion(question: string): string {
  const collapsed = question
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\?+$/, "")
    .trim();
  if (collapsed.length === 0) {
    return FALLBACK_ROOM_NAME;
  }

  const capitalised = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  if (capitalised.length <= MAX_ROOM_NAME_LENGTH) {
    return capitalised;
  }

  // Cut on a word boundary when there is one. A single word longer than the
  // limit has none, so it is cut mid-word -- over-length is not an option,
  // RoomInputSchema would reject it.
  const clipped = capitalised.slice(0, MAX_ROOM_NAME_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  return lastSpace > 0 ? clipped.slice(0, lastSpace).trimEnd() : clipped;
}
