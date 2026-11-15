const MENTION = /^\s*@design agent\b[\s:,-]*/i;

export function parseDesignMention(body: string): string | null {
  if (!MENTION.test(body)) return null;
  const brief = body.replace(MENTION, "").trim();
  return brief.length > 0 ? brief : null;
}
