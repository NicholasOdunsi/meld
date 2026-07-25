import { z } from "zod";
import { PRODUCT_ROLE_VALUES } from "./product-roles";

export const OrganizationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  productName: z.string().trim().min(1).max(120),
  logoPath: z.string().trim().min(1).max(500).optional(),
});

export const ProductRoleSchema = z.enum(PRODUCT_ROLE_VALUES);

export const InviteInputSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  productRole: ProductRoleSchema,
});

export const InvitationReferenceSchema = z.object({
  organizationId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const InvitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/);

export type OrganizationInput = z.infer<typeof OrganizationInputSchema>;
export type InviteInput = z.infer<typeof InviteInputSchema>;
export type InvitationReference = z.infer<
  typeof InvitationReferenceSchema
>;
