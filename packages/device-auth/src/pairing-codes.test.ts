import { describe, expect, it } from "vitest";
import { hashToken } from "./tokens";
import {
  mintPairingCode,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
} from "./pairing-codes";

describe("pairing codes", () => {
  it("mints eight Crockford Base32 characters with a matching hash", () => {
    const minted = mintPairingCode();

    expect(minted.code).toHaveLength(PAIRING_CODE_LENGTH);
    expect(minted.code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(minted.codeHash).toBe(hashToken(minted.code));
  });

  it("excludes the ambiguous letters from the alphabet", () => {
    for (const letter of ["I", "L", "O", "U"]) {
      expect(PAIRING_CODE_ALPHABET).not.toContain(letter);
    }
    expect(PAIRING_CODE_ALPHABET).toHaveLength(32);
  });

  it("does not repeat a code across many mints", () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => mintPairingCode().code),
    );

    expect(codes.size).toBe(500);
  });

  it("normalizes separators, whitespace, and case to one value", () => {
    const canonical = normalizePairingCode("ABCD1234");

    expect(normalizePairingCode("abcd-1234")).toBe(canonical);
    expect(normalizePairingCode("  abcd 1234  ")).toBe(canonical);
    expect(normalizePairingCode("ABCD_1234")).toBe(canonical);
  });

  it("folds the letters Crockford substitutes but not U", () => {
    expect(normalizePairingCode("IL0O")).toBe("1100");
    expect(normalizePairingCode("il0o")).toBe("1100");
    // Crockford defines no substitution for U, so it survives normalization
    // and then simply fails to match any stored hash.
    expect(normalizePairingCode("UUUU")).toBe("UUUU");
  });
});
