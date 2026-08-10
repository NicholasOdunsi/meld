export const USER_FLOW_CONTEXT_QUESTION =
  "What user goal, starting point, and successful outcome should this flow cover?";

const CONTEXT_SIGNALS = {
  goal: /\b(goal|want|need|journey|flow|user(?:s)? (?:can|should|must))\b/i,
  start: /\b(start|begin|entry|first|from|when|after|before|open|land)\w*\b/i,
  outcome: /\b(success|complete|finish|done|result|outcome|end|so that|until)\w*\b/i,
};

export function hasStructuredConversationContext(messages: unknown[]): boolean {
  const context = messages
    .map((message) =>
      typeof message === "object" && message !== null && "body" in message
        && typeof message.body === "string"
        ? message.body.trim()
        : "",
    )
    .filter(Boolean)
    .join(" \n");
  if (context.length < 40) return false;
  return Object.values(CONTEXT_SIGNALS).every((signal) => signal.test(context));
}
