import { describe, expect, it } from "vitest";
import { CAPTURE_TOKEN_PREFIX, mintCaptureToken, parseCaptureAuthorization } from "./capture-tokens";
import { hashToken } from "./tokens";

describe("capture tokens", () => {
  it("mints a prefixed 32-byte base64url token and its sha256 hash", () => {
    const minted = mintCaptureToken();
    expect(minted.token).toMatch(/^orion_cap_[A-Za-z0-9_-]{43}$/);
    expect(minted.tokenHash).toBe(hashToken(minted.token));
    expect(minted.tokenHash).not.toContain(minted.token);
  });

  it("mints a different token every time", () => {
    expect(mintCaptureToken().token).not.toBe(mintCaptureToken().token);
  });

  it("parses a well-formed bearer header", () => {
    const { token } = mintCaptureToken();
    expect(parseCaptureAuthorization(`Bearer ${token}`)).toBe(token);
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["Bearer"],
    ["Bearer "],
    [`Basic ${CAPTURE_TOKEN_PREFIX}${"a".repeat(43)}`],
    [`Bearer ${"a".repeat(53)}`],
    [`Bearer ${CAPTURE_TOKEN_PREFIX}${"a".repeat(42)}`],
    [`Bearer ${CAPTURE_TOKEN_PREFIX}${"a".repeat(42)}=`],
    [`Device 33333333-3333-4333-8333-333333333333.${"a".repeat(43)}`],
  ])("rejects malformed header %s", (header) => {
    expect(parseCaptureAuthorization(header)).toBeNull();
  });
});
