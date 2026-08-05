import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectorPaths } from "../config/paths";

/**
 * A stand-in for macOS's `security` CLI that the managed Claude finds first on
 * its PATH.
 *
 * The managed Claude runs under an isolated HOME with no login keychain, so its
 * real credential store -- keychain first, `.credentials.json` second -- can
 * never complete a keychain write: the write blocks on a "keychain cannot be
 * found" dialog until it times out, and Claude treats a *timeout* as a transient
 * failure and skips the plaintext fallback. The refreshed OAuth token is then
 * lost, the old refresh token is reused, and the server revokes the whole token
 * family. That is why the managed Claude dies every few hours.
 *
 * Exit 44 is `errSecItemNotFound`. Claude reads it as "the keychain is reachable
 * but holds nothing", which is a definite empty result rather than an uncertain
 * one: reads fall straight through to `.credentials.json`, and writes fail fast
 * and non-transiently so the plaintext fallback runs. So the shim forces every
 * managed Claude run -- login, status probe, and task -- onto the file store,
 * where a refreshed token persists and the token sustains itself. No keychain is
 * touched, so the user's own login keychain (and their personal Claude Code) is
 * never read or prompted.
 */
const SHIM_CONTENTS = "#!/bin/sh\nexit 44\n";

/** Owner-only read/execute; nothing else on the Mac runs Meld's shim. */
const SHIM_MODE = 0o700;

/**
 * Writes the `security` shim if it is missing or out of date, and always
 * re-asserts its executable bit. Idempotent, so it is safe to call on every
 * connector start.
 */
export async function ensureSecurityShim(paths: ConnectorPaths): Promise<void> {
  await mkdir(path.dirname(paths.securityShim), { recursive: true });
  await writeFile(paths.securityShim, SHIM_CONTENTS, {
    encoding: "utf8",
    mode: SHIM_MODE,
  });
  // writeFile only applies the mode when it creates the file, so re-assert it in
  // case an earlier run left one without the executable bit.
  await chmod(paths.securityShim, SHIM_MODE);
}
