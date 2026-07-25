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
