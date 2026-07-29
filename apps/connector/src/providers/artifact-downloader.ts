import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import type { ManagedFileSystem } from "../config/connector-config";

export type ArtifactDownloadFailure =
  | "request-failed"
  | "http-status"
  | "empty-body"
  | "stream-failed"
  | "checksum-mismatch";

export class ArtifactDownloadError extends Error {
  override readonly name = "ArtifactDownloadError";
  readonly reason: ArtifactDownloadFailure;

  constructor(reason: ArtifactDownloadFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** The pinned coordinates of one artifact: where it lives and what it must hash to. */
export interface VerifiedArtifact {
  url: string;
  sha256: string;
}

export interface ArtifactDownloaderDependencies {
  fetch: typeof globalThis.fetch;
  fileSystem: ManagedFileSystem;
}

function digestsMatch(actual: Buffer, expectedHex: string): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }

  // `timingSafeEqual` throws on unequal lengths, so compare lengths first and
  // treat any malformed expectation as a mismatch rather than a crash.
  return (
    expected.length === actual.length && timingSafeEqual(actual, expected)
  );
}

export class ArtifactDownloader {
  private readonly fetch: typeof globalThis.fetch;
  private readonly fileSystem: ManagedFileSystem;

  constructor(dependencies: ArtifactDownloaderDependencies) {
    this.fetch = dependencies.fetch;
    this.fileSystem = dependencies.fileSystem;
  }

  /**
   * Streams `artifact` into `destination` with owner-only permissions, hashing
   * the bytes as they arrive. The staged file is deleted unless its SHA-256
   * matches the pinned digest exactly, so nothing unverified is ever extracted.
   */
  async download(
    artifact: VerifiedArtifact,
    destination: string,
  ): Promise<void> {
    const response = await this.request(artifact.url);
    const body = response.body;

    if (!response.ok) {
      await body?.cancel().catch(() => undefined);
      throw new ArtifactDownloadError(
        "http-status",
        `Downloading the pinned runtime artifact failed with HTTP ${response.status}.`,
      );
    }
    if (!body) {
      throw new ArtifactDownloadError(
        "empty-body",
        "The pinned runtime artifact response had no body.",
      );
    }

    await this.fileSystem.makeDirectory(path.dirname(destination));
    const hash = createHash("sha256");
    const handle = await this.fileSystem.openPrivateFile(destination);

    try {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          hash.update(value);
          await handle.write(value);
        }
      }
    } catch (error) {
      await handle.close().catch(() => undefined);
      await this.fileSystem.removeTree(destination);
      throw new ArtifactDownloadError(
        "stream-failed",
        `Downloading the pinned runtime artifact failed: ${
          error instanceof Error ? error.message : "unknown transfer error"
        }`,
      );
    }

    await handle.close();

    if (!digestsMatch(hash.digest(), artifact.sha256)) {
      await this.fileSystem.removeTree(destination);
      throw new ArtifactDownloadError(
        "checksum-mismatch",
        "The downloaded runtime artifact failed its pinned SHA-256 checksum and was discarded.",
      );
    }
  }

  private async request(url: string): Promise<Response> {
    try {
      return await this.fetch(url, { redirect: "follow" });
    } catch (error) {
      throw new ArtifactDownloadError(
        "request-failed",
        `Requesting the pinned runtime artifact failed: ${
          error instanceof Error ? error.message : "unknown network error"
        }`,
      );
    }
  }
}
