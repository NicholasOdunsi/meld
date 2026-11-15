import type { SketchRequest } from "./sketch-request";

export type FallbackReason = "no_connection" | "usage_limit" | "needs_sign_in" | "failed" | "timeout";

export class OwnAiUnavailable extends Error {
  constructor(readonly reason: FallbackReason, readonly detail?: string) {
    super(`Own AI unavailable: ${reason}`);
    this.name = "OwnAiUnavailable";
  }
}

export type GeneratedScreen = {
  screenId: string;
  html: string;
  via: "own-ai" | "deepseek";
  provider: string | null;
  fellBackBecause?: FallbackReason;
};

export type ScreenGenerator = (input: {
  request: SketchRequest;
  instruction: string;
  signal?: AbortSignal;
}) => Promise<{ screenId: string; html: string; provider: string | null }>;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

// The owner's connected AI first; DeepSeek when there is none, it is at its
// limit, it needs a fresh sign-in, or it failed. Cancelling never falls back.
export async function buildWithFallback(input: {
  request: SketchRequest;
  instruction: string;
  ownAi: ScreenGenerator | null;
  fallback: ScreenGenerator;
  signal?: AbortSignal;
}): Promise<GeneratedScreen> {
  const { request, instruction, signal } = input;
  let reason: FallbackReason = "no_connection";
  if (input.ownAi) {
    try {
      const built = await input.ownAi({ request, instruction, signal });
      return { ...built, via: "own-ai" };
    } catch (error) {
      if (isAbort(error)) throw error;
      reason = error instanceof OwnAiUnavailable ? error.reason : "failed";
    }
  }
  const built = await input.fallback({ request, instruction, signal });
  return { ...built, via: "deepseek", fellBackBecause: reason };
}

const WHY: Record<FallbackReason, string> = {
  no_connection: "No AI of yours is connected here",
  usage_limit: "Your AI has reached its usage limit",
  needs_sign_in: "Your AI needs you to sign in again",
  failed: "Your AI could not finish",
  timeout: "Your AI took too long",
};

export function describeOutcome(screen: GeneratedScreen): string {
  if (screen.via === "own-ai") return `Built with your AI (${screen.provider ?? "connected"}).`;
  return `${WHY[screen.fellBackBecause ?? "no_connection"]}, so DeepSeek built this screen.`;
}
