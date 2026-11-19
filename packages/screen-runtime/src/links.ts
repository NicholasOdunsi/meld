import { MAX_SCREEN_LINKS, SCREEN_KEY } from "./constants";

export function extractLinks(files: Record<string, string>): string[] {
  const links = new Set<string>();
  const patterns = [
    /data-goto=(["'])([^"']+)\1/g,
    /orion\.goto\(\s*(["'])([^"']+)\1\s*\)/g,
  ];

  for (const source of Object.values(files)) {
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        if (SCREEN_KEY.test(match[2])) links.add(match[2]);
      }
    }
  }

  return [...links].sort().slice(0, MAX_SCREEN_LINKS);
}
