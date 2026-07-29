import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  ManagedFileSystem,
  PrivateFileHandle,
} from "../config/connector-config";
import { ArtifactDownloader } from "./artifact-downloader";
import { RELEASES } from "./release-manifest";

const DESTINATION =
  "/Users/ada/Library/Application Support/Meld/downloads/node-v24.8.0-darwin-arm64.tar.gz";

function sha256Of(chunks: Uint8Array[]): string {
  const hash = createHash("sha256");
  for (const chunk of chunks) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function bodyOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function failingBody(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.error(new Error("connection reset"));
    },
  });
}

interface RecordingFileSystem {
  system: ManagedFileSystem;
  directories: string[];
  opened: string[];
  removed: string[];
  writes: Map<string, Uint8Array[]>;
  closed: string[];
}

function recordingFileSystem(): RecordingFileSystem {
  const directories: string[] = [];
  const opened: string[] = [];
  const removed: string[] = [];
  const closed: string[] = [];
  const writes = new Map<string, Uint8Array[]>();

  function unavailable(operation: string): never {
    throw new Error(`unexpected ${operation}`);
  }

  const system: ManagedFileSystem = {
    exists: async (file) => writes.has(file),
    readText: () => unavailable("readText"),
    writePrivateText: () => unavailable("writePrivateText"),
    copyFile: () => unavailable("copyFile"),
    makeDirectory: async (directory) => {
      directories.push(directory);
    },
    removeTree: async (target) => {
      removed.push(target);
      writes.delete(target);
    },
    rename: () => unavailable("rename"),
    createSymlink: () => unavailable("createSymlink"),
    readSymlink: () => unavailable("readSymlink"),
    openPrivateFile: async (file): Promise<PrivateFileHandle> => {
      opened.push(file);
      const chunks: Uint8Array[] = [];
      writes.set(file, chunks);
      return {
        write: async (chunk) => {
          chunks.push(chunk);
        },
        close: async () => {
          closed.push(file);
        },
      };
    },
  };

  return { system, directories, opened, removed, writes, closed };
}

function downloaderFor(
  response: Response | Error,
  fileSystem: ManagedFileSystem,
) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  if (response instanceof Error) {
    fetch.mockRejectedValue(response);
  } else {
    fetch.mockResolvedValue(response);
  }

  return {
    fetch,
    downloader: new ArtifactDownloader({ fetch, fileSystem }),
  };
}

describe("artifact downloader", () => {
  const chunks = [
    Uint8Array.from([1, 2, 3, 4]),
    Uint8Array.from([5, 6]),
    Uint8Array.from([7]),
  ];

  it("streams the artifact into a private staged file and verifies its digest", async () => {
    const fileSystem = recordingFileSystem();
    const artifact = { url: "https://nodejs.org/x.tar.gz", sha256: sha256Of(chunks) };
    const { downloader, fetch } = downloaderFor(
      new Response(bodyOf(chunks)),
      fileSystem.system,
    );

    await expect(
      downloader.download(artifact, DESTINATION),
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(artifact.url, expect.anything());
    expect(fileSystem.directories).toEqual([
      "/Users/ada/Library/Application Support/Meld/downloads",
    ]);
    expect(fileSystem.opened).toEqual([DESTINATION]);
    expect(fileSystem.writes.get(DESTINATION)).toEqual(chunks);
    expect(fileSystem.closed).toEqual([DESTINATION]);
    expect(fileSystem.removed).toEqual([]);
  });

  it("hashes bytes as they stream instead of after buffering the whole file", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader } = downloaderFor(
      new Response(bodyOf(chunks)),
      fileSystem.system,
    );

    await downloader.download(
      { url: "https://nodejs.org/x.tar.gz", sha256: sha256Of(chunks) },
      DESTINATION,
    );

    expect(fileSystem.writes.get(DESTINATION)?.length).toBe(chunks.length);
  });

  it("deletes the staged archive and fails when the digest does not match", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader } = downloaderFor(
      new Response(bodyOf(chunks)),
      fileSystem.system,
    );

    await expect(
      downloader.download(
        {
          url: "https://nodejs.org/x.tar.gz",
          sha256:
            "0000000000000000000000000000000000000000000000000000000000000000",
        },
        DESTINATION,
      ),
    ).rejects.toThrow(/checksum/i);

    expect(fileSystem.removed).toEqual([DESTINATION]);
    expect(fileSystem.writes.has(DESTINATION)).toBe(false);
  });

  it("fails a digest of the wrong length without a comparison crash", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader } = downloaderFor(
      new Response(bodyOf(chunks)),
      fileSystem.system,
    );

    await expect(
      downloader.download(
        { url: "https://nodejs.org/x.tar.gz", sha256: "abcd" },
        DESTINATION,
      ),
    ).rejects.toThrow(/checksum/i);
    expect(fileSystem.removed).toEqual([DESTINATION]);
  });

  it("never opens a staged file when the response is not successful", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader } = downloaderFor(
      new Response("nope", { status: 404 }),
      fileSystem.system,
    );

    await expect(
      downloader.download(
        { url: "https://nodejs.org/x.tar.gz", sha256: sha256Of(chunks) },
        DESTINATION,
      ),
    ).rejects.toThrow(/404/);
    expect(fileSystem.opened).toEqual([]);
  });

  it("fails when the response has no body", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader } = downloaderFor(
      new Response(null, { status: 204 }),
      fileSystem.system,
    );

    await expect(
      downloader.download(
        { url: "https://nodejs.org/x.tar.gz", sha256: sha256Of(chunks) },
        DESTINATION,
      ),
    ).rejects.toThrow(/body/i);
    expect(fileSystem.opened).toEqual([]);
  });

  it("removes the partial archive when the stream fails midway", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader } = downloaderFor(
      new Response(failingBody(chunks.slice(0, 1))),
      fileSystem.system,
    );

    await expect(
      downloader.download(
        { url: "https://nodejs.org/x.tar.gz", sha256: sha256Of(chunks) },
        DESTINATION,
      ),
    ).rejects.toThrow(/connection reset/);
    expect(fileSystem.removed).toEqual([DESTINATION]);
  });

  it("removes nothing when the request itself never reaches a body", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader } = downloaderFor(
      new Error("offline"),
      fileSystem.system,
    );

    await expect(
      downloader.download(
        { url: "https://nodejs.org/x.tar.gz", sha256: sha256Of(chunks) },
        DESTINATION,
      ),
    ).rejects.toThrow(/offline/);
    expect(fileSystem.opened).toEqual([]);
    expect(fileSystem.removed).toEqual([]);
  });

  it("verifies the real pinned darwin arm64 digest length and alphabet", async () => {
    const fileSystem = recordingFileSystem();
    const { downloader, fetch } = downloaderFor(
      new Response(bodyOf(chunks)),
      fileSystem.system,
    );

    await expect(
      downloader.download(RELEASES.node.darwin.arm64, DESTINATION),
    ).rejects.toThrow(/checksum/i);
    expect(fetch).toHaveBeenCalledWith(
      RELEASES.node.darwin.arm64.url,
      expect.anything(),
    );
    expect(fileSystem.removed).toEqual([DESTINATION]);
  });
});
