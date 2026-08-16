import { Resend } from "resend";

type InvitationEmailInput = {
  to: string;
  workspaceName: string;
  invitedByName: string;
  acceptUrl: string;
  idempotencyKey: string;
};

type MailpitSendResponse = {
  ID?: unknown;
};

function getInvitationSubject(input: InvitationEmailInput) {
  return `Join ${input.workspaceName} on Meld`;
}

function getInvitationText(input: InvitationEmailInput) {
  return `${input.invitedByName} invited you to ${input.workspaceName}. Accept: ${input.acceptUrl}`;
}

function parseMailpitSender(from: string) {
  const displayAddress = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (!displayAddress) {
    return { Email: from.trim() };
  }

  const name = displayAddress[1].trim().replace(/^"|"$/g, "");
  return {
    Email: displayAddress[2].trim(),
    ...(name ? { Name: name } : {}),
  };
}

async function sendWithMailpit(
  input: InvitationEmailInput,
  from: string,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Local invitation email delivery is disabled.");
  }

  const mailpitUrl = process.env.MAILPIT_URL;
  if (!mailpitUrl) {
    throw new Error("Invitation email delivery is not configured.");
  }

  const response = await fetch(new URL("/api/v1/send", mailpitUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      From: parseMailpitSender(from),
      To: [{ Email: input.to }],
      Subject: getInvitationSubject(input),
      Text: getInvitationText(input),
      Tags: ["Meld invitation"],
      Headers: {
        "X-Meld-Idempotency-Key": input.idempotencyKey,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Invitation email delivery failed.");
  }

  const data = (await response.json()) as MailpitSendResponse;
  if (typeof data.ID !== "string" || !data.ID) {
    throw new Error("Invitation email delivery failed.");
  }

  return { providerId: data.ID };
}

async function sendWithResend(
  input: InvitationEmailInput,
  from: string,
) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Invitation email delivery is not configured.");
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: input.to,
      subject: getInvitationSubject(input),
      text: getInvitationText(input),
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

export async function sendInvitationEmail(input: InvitationEmailInput) {
  const from = process.env.INVITATION_FROM_EMAIL;
  if (!from) {
    throw new Error("Invitation email delivery is not configured.");
  }

  const transport = process.env.INVITATION_EMAIL_TRANSPORT ?? "resend";
  if (transport === "mailpit") {
    return sendWithMailpit(input, from);
  }
  if (transport === "resend") {
    return sendWithResend(input, from);
  }

  throw new Error("Invitation email delivery is not configured.");
}
