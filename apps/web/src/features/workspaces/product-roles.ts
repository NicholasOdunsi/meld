export const PRODUCT_ROLES = [
  { value: "product_manager", label: "Product manager" },
  { value: "product_leader", label: "Product leader" },
  { value: "product_designer", label: "Product designer" },
  { value: "design_engineer", label: "Design engineer" },
  { value: "engineer", label: "Engineer" },
  { value: "stakeholder", label: "Stakeholder" },
] as const;

export type ProductRole = (typeof PRODUCT_ROLES)[number]["value"];

export const PRODUCT_ROLE_VALUES = PRODUCT_ROLES.map(
  (role) => role.value,
) as [ProductRole, ...ProductRole[]];

export function formatProductRole(role?: string | null) {
  return PRODUCT_ROLES.find((candidate) => candidate.value === role)
    ?.label;
}
