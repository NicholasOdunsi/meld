import { describe, expect, it } from "vitest";
import {
  RELEASES,
  ReleaseManifestSchema,
  nodeArtifact,
  providerRelease,
} from "./release-manifest";

const validManifest = {
  node: {
    version: "24.8.0",
    darwin: {
      arm64: {
        url: "https://nodejs.org/dist/v24.8.0/node-v24.8.0-darwin-arm64.tar.gz",
        sha256:
          "d81191a1866760eb918caa976c023036bc1fc7405ea31b148905211522045767",
      },
      x64: {
        url: "https://nodejs.org/dist/v24.8.0/node-v24.8.0-darwin-x64.tar.gz",
        sha256:
          "6fd8496b59baa8f86a24e3eb03308b763091716ffc6b6e1094d1a5e5696dd6dd",
      },
    },
  },
  providers: {
    codex: {
      package: "@openai/codex",
      version: "0.146.0",
      integrity:
        "sha512-yG3sPWNda/2YAIQIDq9MrrjoCTIQ7rxYM5IasrG3VBcuhCLTkgeg/JzqmJq1V98RE4MJ5jCxDXXQlOjrditFRw==",
      model: "gpt-5.5",
    },
    claude: {
      package: "@anthropic-ai/claude-code",
      version: "2.1.220",
      integrity:
        "sha512-ogBrvwkqF9f8okmnXKxmRNHuvtFxFEffe5pWdqOV3iQDxlUOKirFqnyWC7NGXXnDA4WkkbPH8pvSbwyCR2Auyw==",
      model: "claude-opus-4-8",
    },
  },
};

function manifestWith(
  mutate: (draft: typeof validManifest) => void,
): unknown {
  const draft = structuredClone(validManifest);
  mutate(draft);
  return draft;
}

describe("release manifest", () => {
  it("pins the exact Node version and both darwin artifacts", () => {
    expect(RELEASES.node.version).toBe("24.8.0");
    expect(RELEASES.node.darwin.arm64).toEqual({
      url: "https://nodejs.org/dist/v24.8.0/node-v24.8.0-darwin-arm64.tar.gz",
      sha256:
        "d81191a1866760eb918caa976c023036bc1fc7405ea31b148905211522045767",
    });
    expect(RELEASES.node.darwin.x64).toEqual({
      url: "https://nodejs.org/dist/v24.8.0/node-v24.8.0-darwin-x64.tar.gz",
      sha256:
        "6fd8496b59baa8f86a24e3eb03308b763091716ffc6b6e1094d1a5e5696dd6dd",
    });
  });

  it("pins both provider packages, versions, integrities, and models", () => {
    expect(RELEASES.providers.codex).toEqual({
      package: "@openai/codex",
      version: "0.146.0",
      integrity:
        "sha512-yG3sPWNda/2YAIQIDq9MrrjoCTIQ7rxYM5IasrG3VBcuhCLTkgeg/JzqmJq1V98RE4MJ5jCxDXXQlOjrditFRw==",
      model: "gpt-5.5",
    });
    expect(RELEASES.providers.claude).toEqual({
      package: "@anthropic-ai/claude-code",
      version: "2.1.220",
      integrity:
        "sha512-ogBrvwkqF9f8okmnXKxmRNHuvtFxFEffe5pWdqOV3iQDxlUOKirFqnyWC7NGXXnDA4WkkbPH8pvSbwyCR2Auyw==",
      model: "claude-opus-4-8",
    });
  });

  it("selects the artifact and checksum for each supported architecture", () => {
    expect(nodeArtifact("arm64")).toBe(RELEASES.node.darwin.arm64);
    expect(nodeArtifact("x64")).toBe(RELEASES.node.darwin.x64);
    expect(nodeArtifact("arm64").sha256).not.toBe(
      nodeArtifact("x64").sha256,
    );
  });

  it("rejects an unknown architecture", () => {
    expect(() => nodeArtifact("ia32")).toThrow(/architecture/i);
    expect(() => nodeArtifact("arm")).toThrow(/architecture/i);
  });

  it("returns the pinned release for each provider", () => {
    expect(providerRelease("codex").package).toBe("@openai/codex");
    expect(providerRelease("claude").package).toBe(
      "@anthropic-ai/claude-code",
    );
  });

  it("rejects a floating Node version", () => {
    for (const version of ["latest", "lts", "24", "24.8", "^24.8.0"]) {
      expect(
        ReleaseManifestSchema.safeParse(
          manifestWith((draft) => {
            draft.node.version = version;
          }),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects a floating provider version or range", () => {
    for (const version of [
      "latest",
      "next",
      "^0.146.0",
      "~0.146.0",
      ">=0.146.0",
      "0.146.x",
    ]) {
      expect(
        ReleaseManifestSchema.safeParse(
          manifestWith((draft) => {
            draft.providers.codex.version = version;
          }),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects a checksum of the wrong length or alphabet", () => {
    for (const sha256 of [
      "d81191a1866760eb918caa976c023036bc1fc7405ea31b1489052115220457",
      "d81191a1866760eb918caa976c023036bc1fc7405ea31b148905211522045767a",
      "D81191A1866760EB918CAA976C023036BC1FC7405EA31B148905211522045767",
      "",
    ]) {
      expect(
        ReleaseManifestSchema.safeParse(
          manifestWith((draft) => {
            draft.node.darwin.arm64.sha256 = sha256;
          }),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects an unknown architecture key and a missing one", () => {
    expect(
      ReleaseManifestSchema.safeParse(
        manifestWith((draft) => {
          (draft.node.darwin as Record<string, unknown>).arm =
            draft.node.darwin.arm64;
        }),
      ).success,
    ).toBe(false);
    expect(
      ReleaseManifestSchema.safeParse(
        manifestWith((draft) => {
          delete (draft.node.darwin as Partial<typeof draft.node.darwin>)
            .x64;
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects a non-nodejs.org or non-https artifact URL", () => {
    for (const url of [
      "http://nodejs.org/dist/v24.8.0/node-v24.8.0-darwin-arm64.tar.gz",
      "https://example.com/node-v24.8.0-darwin-arm64.tar.gz",
      "https://nodejs.org.evil.test/dist/v24.8.0/node.tar.gz",
    ]) {
      expect(
        ReleaseManifestSchema.safeParse(
          manifestWith((draft) => {
            draft.node.darwin.arm64.url = url;
          }),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects a malformed npm integrity hash", () => {
    for (const integrity of [
      "sha1-yG3sPWNda/2YAIQIDq9MrrjoCTIQ7rxYM5IasrG3VBc=",
      "yG3sPWNda/2YAIQIDq9MrrjoCTIQ7rxYM5IasrG3VBcuhCLTkgeg/JzqmJq1V98RE4MJ5jCxDXXQlOjrditFRw==",
      "sha512-tooshort==",
      "",
    ]) {
      expect(
        ReleaseManifestSchema.safeParse(
          manifestWith((draft) => {
            draft.providers.codex.integrity = integrity;
          }),
        ).success,
      ).toBe(false);
    }
  });

  it("requires a nonblank pinned model for every provider", () => {
    for (const model of ["", " ", "\t", " gpt-5.5 "]) {
      expect(
        ReleaseManifestSchema.safeParse(
          manifestWith((draft) => {
            draft.providers.codex.model = model;
          }),
        ).success,
      ).toBe(false);
    }
    expect(
      ReleaseManifestSchema.safeParse(
        manifestWith((draft) => {
          delete (
            draft.providers.codex as Partial<
              typeof draft.providers.codex
            >
          ).model;
        }),
      ).success,
    ).toBe(false);
  });

  it("refuses a Claude model alias in place of the full model name", () => {
    for (const alias of ["opus", "sonnet", "haiku", "fable", "default"]) {
      expect(
        ReleaseManifestSchema.safeParse(
          manifestWith((draft) => {
            draft.providers.claude.model = alias;
          }),
        ).success,
      ).toBe(false);
    }
    expect(
      ReleaseManifestSchema.safeParse(
        manifestWith((draft) => {
          draft.providers.claude.model = "claude-sonnet-5";
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects an unpinned provider or an unexpected field", () => {
    expect(
      ReleaseManifestSchema.safeParse(
        manifestWith((draft) => {
          delete (
            draft.providers as Partial<typeof draft.providers>
          ).claude;
        }),
      ).success,
    ).toBe(false);
    expect(
      ReleaseManifestSchema.safeParse(
        manifestWith((draft) => {
          (draft.providers.codex as Record<string, unknown>).tag =
            "latest";
        }),
      ).success,
    ).toBe(false);
  });
});
