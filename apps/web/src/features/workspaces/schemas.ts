import { z } from "zod";

export const OrganizationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  productName: z.string().trim().min(1).max(120),
});

export const InviteInputSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
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
