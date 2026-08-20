import type { MeldBadgeTone } from "@/ui/meld/badge";
import type { BadgeVariant } from "@astryxdesign/core/Badge";

export const PRODUCT_ROLES = [
  {
    value: "product_manager",
    label: "Product manager",
    badgeVariant: "blue",
  },
  {
    value: "product_leader",
    label: "Product leader",
    badgeVariant: "purple",
  },
  {
    value: "product_designer",
    label: "Product designer",
    badgeVariant: "pink",
  },
  {
    value: "design_engineer",
    label: "Design engineer",
    badgeVariant: "teal",
  },
  { value: "engineer", label: "Engineer", badgeVariant: "green" },
  {
    value: "stakeholder",
    label: "Stakeholder",
    badgeVariant: "orange",
  },
] as const satisfies {
  value: string;
  label: string;
  badgeVariant: BadgeVariant;
}[];

export type ProductRole = (typeof PRODUCT_ROLES)[number]["value"];

export const PRODUCT_ROLE_VALUES = PRODUCT_ROLES.map(
  (role) => role.value,
) as [ProductRole, ...ProductRole[]];

export function formatProductRole(role?: string | null) {
  return PRODUCT_ROLES.find((candidate) => candidate.value === role)
    ?.label;
}

const ROLE_LABEL_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  Admin: "cyan",
  Member: "neutral",
  Invitee: "yellow",
  Invited: "yellow",
  ...Object.fromEntries(
    PRODUCT_ROLES.map((role) => [role.label, role.badgeVariant]),
  ),
};

export function getRoleBadgeVariant(label: string): BadgeVariant {
  return ROLE_LABEL_BADGE_VARIANTS[label] ?? "neutral";
}

// Meld tones, kept alongside the Astryx variants above rather than replacing
// them: `members-table.tsx` still renders Astryx badges. This one dies with the
// other when that screen migrates.
// Sky is deliberately absent. It's the accent -- the primary button's fill --
// and a badge wearing it competes with the one thing on screen meant to be
// clicked.
const ROLE_LABEL_TONES: Record<string, MeldBadgeTone> = {
  Admin: "burgundy",
  Member: "neutral",
  Invitee: "yellow",
  Invited: "yellow",
  "Product manager": "green",
  "Product leader": "burgundy",
  "Product designer": "pink",
  "Design engineer": "yellow",
  Engineer: "green",
  Stakeholder: "red",
};

export function getRoleTone(label: string): MeldBadgeTone {
  return ROLE_LABEL_TONES[label] ?? "neutral";
}
