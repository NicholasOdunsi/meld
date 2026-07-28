import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  hashToken,
  mintDeviceCredential,
  verifyToken,
} from "./tokens";

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";

describe("device credentials", () => {
  it("mints a UUID-prefixed credential with 32 random base64url bytes", () => {
    const minted = mintDeviceCredential(DEVICE_ID);
    const [deviceId, secret] = minted.credential.split(".");

    expect(deviceId).toBe(DEVICE_ID);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secret).not.toContain("=");
    expect(Buffer.from(secret!, "base64url")).toHaveLength(32);
    expect(minted.tokenHash).toBe(hashToken(secret!));
  });

  it("produces lowercase SHA-256 hashes without retaining plaintext", () => {
    const secret = "plain-device-secret";
    const digest = hashToken(secret);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(secret);
  });

  it("verifies valid secrets and rejects wrong or malformed digests", () => {
    const secret = "correct-secret";
    const digest = hashToken(secret);

    expect(verifyToken(secret, digest)).toBe(true);
    expect(verifyToken("wrong-secret", digest)).toBe(false);
    expect(verifyToken(secret, "")).toBe(false);
    expect(verifyToken(secret, "not-hex")).toBe(false);
    expect(verifyToken(secret, "A".repeat(64))).toBe(false);
    expect(verifyToken(secret, "0".repeat(62))).toBe(false);
  });
});
