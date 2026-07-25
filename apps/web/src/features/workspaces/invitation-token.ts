import { createHash, createHmac } from "node:crypto";

const INVITATION_TOKEN_CONTEXT = "meld/invitation-token/v1";
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

export function readInvitationTokenSecret(
  value = process.env.INVITATION_TOKEN_SECRET,
) {
  if (!value || !BASE64URL_32_BYTES.test(value)) {
    throw new Error(
      "INVITATION_TOKEN_SECRET must be a base64url-encoded 32-byte secret.",
    );
  }

  const decoded = Buffer.from(value, "base64url");
  const uniqueBytes = new Set(decoded).size;

  if (
    decoded.byteLength !== 32 ||
    decoded.toString("base64url") !== value ||
    uniqueBytes < 8
  ) {
    throw new Error(
      "INVITATION_TOKEN_SECRET must be a high-entropy 32-byte secret.",
    );
  }

  return value;
}

export function deriveInvitationToken(
  invitationId: string,
  encodedSecret = readInvitationTokenSecret(),
) {
  const secret = Buffer.from(readInvitationTokenSecret(encodedSecret), "base64url");

  return createHmac("sha256", secret)
    .update(INVITATION_TOKEN_CONTEXT)
    .update("\0")
    .update(invitationId)
    .digest("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
