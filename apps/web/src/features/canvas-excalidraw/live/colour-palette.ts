const hue = (a: string, b: string, c: string, d: string, e: string) => [a, b, c, d, e] as const;
// Greys first, then eight hues from light to dark (Tailwind 200/300/400/500/700).
export const PALETTE: readonly (readonly string[])[] = [
  ["#ffffff", "#f5f5f5", "#d4d4d4", "#a3a3a3", "#737373", "#404040", "#171717", "#000000"],
  hue("#fecaca", "#fca5a5", "#f87171", "#ef4444", "#b91c1c"),
  hue("#fed7aa", "#fdba74", "#fb923c", "#f97316", "#c2410c"),
  hue("#fef08a", "#fde047", "#facc15", "#eab308", "#a16207"),
  hue("#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#15803d"),
  hue("#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0f766e"),
  hue("#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"),
  hue("#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#7e22ce"),
  hue("#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#be185d"),
];
const MAX_USED = 8;
export function normaliseHex(input: string): string | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(input.trim());
  if (!m) return null;
  const digits = m[1].toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits}`;
}
export function usedColours(files: Record<string, string>, extra: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const scan = (hex: string) => {
    const n = normaliseHex(hex);
    if (n) seen.add(n);
  };
  for (const source of Object.values(files))
    for (const m of source.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g)) scan(m[0]);
  for (const hex of extra) scan(hex);
  return [...seen].slice(0, MAX_USED);
}
