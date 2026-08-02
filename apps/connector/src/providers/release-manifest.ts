import { ProviderSchema, type Provider } from "@meld/contracts";
import { z } from "zod";

/**
 * Provider-agnostic floating identifiers. Whichever provider they are handed
 * to, they name "whatever model is current", which is exactly the per-machine
 * drift the pin exists to prevent — so no provider may be pinned to one.
 */
const FLOATING_MODEL_NAMES = new Set(["latest", "default"]);

/**
 * Claude accepts either an alias (`opus`, `sonnet`, `fable`) or a full model
 * name on `--model`. Aliases can silently follow a different model over time,
 * so the manifest pins the full name and refuses the aliases outright.
 */
const CLAUDE_MODEL_ALIASES = new Set(["opus", "sonnet", "haiku", "fable"]);

const ExactVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "version must be an exact major.minor.patch release, never a tag or range",
  );

const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex characters");

const IntegritySchema = z
  .string()
  .regex(
    /^sha512-[A-Za-z0-9+/]{86}==$/,
    "integrity must be a base64 sha512 npm integrity hash",
  );

const NodeArtifactUrlSchema = z.string().refine((value) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === "nodejs.org" &&
    url.pathname.endsWith(".tar.gz")
  );
}, "url must be an https nodejs.org tarball");

const ModelSchema = z
  .string()
  .min(1, "model must be pinned")
  .refine(
    (value) => value.trim() === value && value.trim().length > 0,
    "model must be an exact, nonblank model name",
  )
  .refine(
    (value) => !FLOATING_MODEL_NAMES.has(value),
    "model must name one model, not a floating identifier",
  );

const NodeArtifactSchema = z
  .object({ url: NodeArtifactUrlSchema, sha256: Sha256Schema })
  .strict();

const NodeReleaseSchema = z
  .object({
    version: ExactVersionSchema,
    darwin: z
      .object({ arm64: NodeArtifactSchema, x64: NodeArtifactSchema })
      .strict(),
  })
  .strict();

const ProviderReleaseSchema = z
  .object({
    package: z
      .string()
      .regex(
        /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/,
        "package must be a scoped npm package name",
      ),
    version: ExactVersionSchema,
    integrity: IntegritySchema,
    model: ModelSchema,
  })
  .strict();

const ClaudeReleaseSchema = ProviderReleaseSchema.extend({
  model: ModelSchema.refine(
    (value) => !CLAUDE_MODEL_ALIASES.has(value),
    "model must be a full Claude model name, not an alias",
  ),
});

export const ReleaseManifestSchema = z
  .object({
    node: NodeReleaseSchema,
    providers: z
      .object({ codex: ProviderReleaseSchema, claude: ClaudeReleaseSchema })
      .strict(),
  })
  .strict();

export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
export type NodeArtifact = z.infer<typeof NodeArtifactSchema>;
export type ProviderRelease = z.infer<typeof ProviderReleaseSchema>;
export type SupportedArchitecture = keyof ReleaseManifest["node"]["darwin"];

export const RELEASES = ReleaseManifestSchema.parse({
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
});

export function isSupportedArchitecture(
  architecture: string,
): architecture is SupportedArchitecture {
  return architecture === "arm64" || architecture === "x64";
}

export function nodeArtifact(architecture: string): NodeArtifact {
  if (!isSupportedArchitecture(architecture)) {
    throw new Error(
      `Meld does not support the ${architecture} architecture. Meld requires an ARM64 or x64 Mac.`,
    );
  }

  return RELEASES.node.darwin[architecture];
}

export function providerRelease(provider: Provider): ProviderRelease {
  return RELEASES.providers[ProviderSchema.parse(provider)];
}

export function nodeArchiveName(
  architecture: SupportedArchitecture,
): string {
  return `node-v${RELEASES.node.version}-darwin-${architecture}.tar.gz`;
}
