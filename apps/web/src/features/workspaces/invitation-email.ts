import { Resend } from "resend";

export async function sendInvitationEmail(input: {
  to: string;
  organizationName: string;
  invitedByName: string;
  acceptUrl: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Invitation email delivery is not configured.");
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: input.to,
      subject: `Join ${input.organizationName} on Meld`,
      text: `${input.invitedByName} invited you to ${input.organizationName}. Accept: ${input.acceptUrl}`,
    },
    {
      idempotencyKey: input.idempotencyKey,
    },
  );

  if (error || !data?.id) {
    throw new Error("Invitation email delivery failed.");
  }

  return { providerId: data.id };
}
