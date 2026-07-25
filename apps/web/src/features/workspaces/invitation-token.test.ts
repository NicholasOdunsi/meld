import { describe, expect, it } from "vitest";
import {
  deriveInvitationToken,
  hashInvitationToken,
  readInvitationTokenSecret,
} from "./invitation-token";

const SECRET =
  "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU";

describe("invitation token derivation", () => {
  it("reconstructs the same 32-byte pseudorandom token for the same invitation", () => {
    const invitationId = "50000000-0000-4000-8000-000000000005";

    expect(deriveInvitationToken(invitationId, SECRET)).toBe(
      deriveInvitationToken(invitationId, SECRET),
    );
    expect(deriveInvitationToken(invitationId, SECRET)).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it("separates tokens for different invitation IDs", () => {
    expect(
      deriveInvitationToken(
        "50000000-0000-4000-8000-000000000005",
        SECRET,
      ),
    ).not.toBe(
      deriveInvitationToken(
        "60000000-0000-4000-8000-000000000006",
        SECRET,
      ),
    );
  });

  it("canonicalizes UUID case before token derivation", () => {
    expect(
      deriveInvitationToken(
        "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
        SECRET,
      ),
    ).toBe(
      deriveInvitationToken(
        "abcdefab-cdef-4abc-8def-abcdefabcdef",
        SECRET,
      ),
    );
  });

  it.each([
    undefined,
    "",
    "too-short",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "not+base64url/encoded______________________",
  ])("rejects an invalid server-only secret: %s", (value) => {
    expect(() => readInvitationTokenSecret(value)).toThrow(
      "INVITATION_TOKEN_SECRET",
    );
  });

  it("hashes the encoded token without retaining it", () => {
    const token = deriveInvitationToken(
      "50000000-0000-4000-8000-000000000005",
      SECRET,
    );
    const hash = hashInvitationToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
  });
});
