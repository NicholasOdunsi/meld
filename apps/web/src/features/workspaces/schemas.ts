import { z } from "zod";
import { PRODUCT_ROLE_VALUES } from "./product-roles";

export const WorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  projectName: z.string().trim().min(1).max(120),
  logoPath: z.string().trim().min(1).max(500).optional(),
});

export const ProductRoleSchema = z.enum(PRODUCT_ROLE_VALUES);

export const InviteInputSchema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  productRole: ProductRoleSchema,
});

export const InvitationReferenceSchema = z.object({
  workspaceId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const InvitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/);

export type WorkspaceInput = z.infer<typeof WorkspaceInputSchema>;
export type InviteInput = z.infer<typeof InviteInputSchema>;
export type InvitationReference = z.infer<
  typeof InvitationReferenceSchema
>;
