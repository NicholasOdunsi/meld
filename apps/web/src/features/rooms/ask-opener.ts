// The opener createRoomFromQuestion posts on the caller's behalf when the
// deck's field is used to ask something. Sits beside brief-opener.ts, which
// does the same job for an imported brief, and reuses its mention constant
// rather than restating the literal.
import { PRODUCT_AGENT_MENTION } from "./brief-opener";

// Lives here, not in actions.ts: that file is "use server", where only async
// functions may be exported -- which is why ROOM_REPLY_RETRY_ERROR is
// module-private there. This copy needs to reach a test.
export const ASK_ERROR_MESSAGE =
  "We could not start a room. Please try again.";

export function buildAskOpener(question: string): string {
  return `${PRODUCT_AGENT_MENTION} — ${question.trim()}`;
}
