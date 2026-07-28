import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const SHA256_BYTES = 32;

export interface MintedDeviceCredential {
  credential: string;
  tokenHash: string;
}

export interface ParsedDeviceCredential {
  deviceId: string;
  secret: string;
}

export function hashToken(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifyToken(
  secret: string,
  digest: string,
): boolean {
  const presentedDigest = Buffer.from(hashToken(secret), "hex");
  const digestIsValid = SHA256_HEX_PATTERN.test(digest);
  const storedDigest = digestIsValid
    ? Buffer.from(digest, "hex")
    : Buffer.alloc(SHA256_BYTES);
  const matches = timingSafeEqual(presentedDigest, storedDigest);

  return digestIsValid && matches;
}

export function mintDeviceCredential(
  deviceId: string,
): MintedDeviceCredential {
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new Error("Invalid device ID");
  }

  const secret = randomBytes(SHA256_BYTES).toString("base64url");
  return {
    credential: `${deviceId}.${secret}`,
    tokenHash: hashToken(secret),
  };
}

export function parseDeviceAuthorization(
  authorization: string | undefined,
): ParsedDeviceCredential | null {
  if (!authorization?.startsWith("Device ")) {
    return null;
  }

  const credential = authorization.slice("Device ".length);
  const separator = credential.indexOf(".");
  if (
    separator <= 0 ||
    separator !== credential.lastIndexOf(".")
  ) {
    return null;
  }

  const deviceId = credential.slice(0, separator);
  const secret = credential.slice(separator + 1);
  if (
    !DEVICE_ID_PATTERN.test(deviceId) ||
    !BASE64URL_PATTERN.test(secret)
  ) {
    return null;
  }

  return { deviceId, secret };
}
