export const FIGMA_ALLOWED_HOSTS: ReadonlySet<string> = new Set(["figma.com", "www.figma.com"]);

export function normalizeFigmaUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!FIGMA_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
  url.hostname = url.hostname.toLowerCase();
  url.username = "";
  url.password = "";
  url.hash = "";
  const nodeId = url.searchParams.get("node-id");
  url.search = "";
  if (nodeId) url.searchParams.set("node-id", nodeId);
  return url.toString();
}

const URL_TOKEN = /https?:\/\/[^\s<>"')]+/g;

export function extractFigmaReferences(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of body.match(URL_TOKEN) ?? []) {
    const normalized = normalizeFigmaUrl(token);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

export function parseFigmaOEmbed(json: unknown): { title: string | null; thumbnailUrl: string | null } {
  if (!json || typeof json !== "object") return { title: null, thumbnailUrl: null };
  const record = json as Record<string, unknown>;
  return {
    title: typeof record.title === "string" ? record.title : null,
    thumbnailUrl: typeof record.thumbnail_url === "string" ? record.thumbnail_url : null,
  };
}
