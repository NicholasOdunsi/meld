import { randomInt } from "node:crypto";
import { hashToken } from "./tokens";

// Crockford Base32: no I, L, O (visually ambiguous) and no U (obscenity).
export const PAIRING_CODE_ALPHABET =
  "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 8;

// Crockford's decoding substitutions. U has none: it is simply not a
// legal character, so a code containing one fails to match any hash.
const SUBSTITUTIONS = new Map([
  ["I", "1"],
  ["L", "1"],
  ["O", "0"],
]);

export interface MintedPairingCode {
  code: string;
  codeHash: string;
}

export function mintPairingCode(): MintedPairingCode {
  let code = "";
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    code += PAIRING_CODE_ALPHABET[
      randomInt(PAIRING_CODE_ALPHABET.length)
    ];
  }

  return { code, codeHash: hashToken(code) };
}

export function normalizePairingCode(input: string): string {
  const upper = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  let normalized = "";
  for (const character of upper) {
    normalized += SUBSTITUTIONS.get(character) ?? character;
  }
  return normalized;
}
