import type { DesignProfile } from "@meld/contracts";

// Deterministically compile validated profile DATA into CSS custom properties.
// The model never writes this - Meld does - so it is a pure function of the
// profile. Component `rules` are model guidance, not CSS, and are not emitted.
export function compileTokenCss(profile: DesignProfile): string {
  const lines: string[] = [];
  for (const c of profile.colors) {
    lines.push(`  --ds-color-${c.name}: ${c.value};`);
  }
  for (const t of profile.typeScale) {
    lines.push(`  --ds-font-${t.name}: ${t.px}px;`);
  }
  for (const s of profile.spacing) {
    lines.push(`  --ds-space-${s.name}: ${s.px}px;`);
  }
  for (const r of profile.radii) {
    lines.push(`  --ds-radius-${r.name}: ${r.px}px;`);
  }
  return `:root {\n${lines.join("\n")}\n}`;
}
