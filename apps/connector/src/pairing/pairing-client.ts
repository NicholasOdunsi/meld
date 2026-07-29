import { hostname, platform } from "node:os";
import {
  ProviderSchema,
  type Provider,
} from "@meld/contracts";
import { z } from "zod";
import type { CredentialStore } from "./credential-store";

const PairingResponseSchema = z.object({
  deviceId: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    ),
  deviceToken: z.string().min(1),
  requestedProvider: ProviderSchema,
});

interface PairingClientOptions {
  baseUrl: string;
  credentialStore: CredentialStore;
  fetch: typeof globalThis.fetch;
}

export interface PairingResult {
  deviceId: string;
  requestedProvider: Provider;
}

export class PairingClient {
  private readonly baseUrl: string;
  private readonly credentialStore: CredentialStore;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: PairingClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.credentialStore = options.credentialStore;
    this.fetch = options.fetch;
  }

  async pair(code: string): Promise<PairingResult> {
    if (!(await this.credentialStore.probe())) {
      throw new Error(
        "Keychain is not writable. Fix Keychain access before pairing.",
      );
    }

    const response = await this.fetch(
      `${this.baseUrl}/api/devices/pair`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          platform: platform(),
          name: hostname(),
        }),
      },
    );
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error("Invalid or expired pairing code.");
      }
      if (response.status === 429) {
        throw new Error("Too many pairing attempts.");
      }
      throw new Error(
        `Pairing request failed with HTTP ${response.status}.`,
      );
    }

    const parsed = PairingResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error("Invalid pairing response.");
    }

    const {
      deviceId,
      deviceToken,
      requestedProvider,
    } = parsed.data;

    try {
      await this.credentialStore.save({ deviceId, deviceToken });
    } catch {
      throw new Error(
        `Pairing redeemed device ${deviceId}, but its credential could not be saved. Revoke this orphaned device and pair again.`,
      );
    }

    return { deviceId, requestedProvider };
  }
}
