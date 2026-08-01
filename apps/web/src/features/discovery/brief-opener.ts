// The opener text createRoomFromBrief posts on the caller's behalf when a
// brief import lands with the Product Agent ready to review it. Split out
// from actions.ts so the copy can be unit tested without pulling in the
// server action's Supabase/backend wiring.
export const PRODUCT_AGENT_MENTION = "@Product Agent";

export function buildBriefOpener(fileCount: number): string {
  return fileCount > 1
    ? `${PRODUCT_AGENT_MENTION} — please review these documents and give me a breakdown of them.`
    : `${PRODUCT_AGENT_MENTION} — please review this brief and give me a breakdown of it.`;
}
