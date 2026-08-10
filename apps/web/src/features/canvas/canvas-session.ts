import { z } from "zod";

export const CanvasSessionResponseSchema = z
  .object({
    ticket: z.string().min(1),
    gatewayUrl: z
      .string()
      .url()
      .refine((value) => value.startsWith("ws://") || value.startsWith("wss://")),
    access: z.enum(["edit", "view"]),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type CanvasSessionResponse = z.infer<typeof CanvasSessionResponseSchema>;

export function isCanvasGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "ws:" || url.protocol === "wss:";
  } catch {
    return false;
  }
}

export class CanvasSessionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CanvasSessionError";
    this.status = status;
  }
}

export function canvasSessionErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Sign in again to open this user flow.";
    case 403:
      return "You do not have access to this room's user flow.";
    case 404:
      return "The user flow trial is unavailable for this room.";
    case 503:
      return "The user flow trial is not configured yet.";
    default:
      return "We could not open the user flow trial.";
  }
}

export async function requestCanvasSession(input: {
  organizationId: string;
  roomId: string;
  signal?: AbortSignal;
}): Promise<CanvasSessionResponse> {
  const response = await fetch("/api/canvas-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organizationId: input.organizationId,
      roomId: input.roomId,
    }),
    cache: "no-store",
    signal: input.signal,
  });

  if (response.status !== 201) {
    throw new CanvasSessionError(
      response.status,
      canvasSessionErrorMessage(response.status),
    );
  }

  const parsed = CanvasSessionResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new CanvasSessionError(502, "The canvas session response was invalid.");
  }
  return parsed.data;
}

export function getCanvasGatewayUri(
  gatewayUrl: string,
  roomId: string,
  ticket: string,
): string {
  return `${gatewayUrl.replace(/\/$/, "")}/canvas/${encodeURIComponent(roomId)}?ticket=${encodeURIComponent(ticket)}`;
}

export function isCanvasTrialEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MELD_USER_FLOW_TRIAL_ENABLED === "true"
  );
}
