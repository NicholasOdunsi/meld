import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "./credential-store";
import { PairingClient } from "./pairing-client";

const DEVICE_ID = "40000000-0000-0000-0000-000000000001";

function fakeFetch(body: unknown, status = 201) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("pairing client", () => {
  it("stores the returned device token and never returns it to callers", async () => {
    const store = new MemoryCredentialStore();
    const fetch = fakeFetch({
      deviceId: DEVICE_ID,
      deviceToken: "dt_secret",
      requestedProvider: "claude",
    });
    const client = new PairingClient({
      baseUrl: "http://127.0.0.1:3000",
      credentialStore: store,
      fetch,
    });

    await expect(client.pair("ABCD-EFGH")).resolves.toEqual({
      deviceId: DEVICE_ID,
      requestedProvider: "claude",
    });
    expect(store.saved).toEqual({
      deviceId: DEVICE_ID,
      deviceToken: "dt_secret",
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/devices/pair",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const request = fetch.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      code: "ABCD-EFGH",
      platform: expect.any(String),
      name: expect.any(String),
    });
  });

  it("probes the credential store before spending the code", async () => {
    const store = new MemoryCredentialStore({ writable: false });
    const fetchSpy = vi.fn<typeof fetch>();
    const client = new PairingClient({
      baseUrl: "http://127.0.0.1:3000",
      credentialStore: store,
      fetch: fetchSpy,
    });

    await expect(client.pair("ABCD-EFGH")).rejects.toThrow(
      /keychain is not writable/i,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("names the orphaned device when the store fails after redemption", async () => {
    const store = new MemoryCredentialStore({ failOnSave: true });
    const client = new PairingClient({
      baseUrl: "http://127.0.0.1:3000",
      credentialStore: store,
      fetch: fakeFetch({
        deviceId: DEVICE_ID,
        deviceToken: "dt_secret",
        requestedProvider: "codex",
      }),
    });

    await expect(client.pair("ABCD-EFGH")).rejects.toThrow(
      new RegExp(DEVICE_ID),
    );
  });

  it("sanitizes the token and credential-store cause after an orphaned save", async () => {
    const sentinelToken = "sentinel_device_token";
    const sentinelCause = "sentinel_keychain_cause";
    const store = new MemoryCredentialStore();
    store.save = vi.fn().mockRejectedValue(
      new Error(sentinelCause),
    );
    const client = new PairingClient({
      baseUrl: "http://127.0.0.1:3000",
      credentialStore: store,
      fetch: fakeFetch({
        deviceId: DEVICE_ID,
        deviceToken: sentinelToken,
        requestedProvider: "codex",
      }),
    });

    const error = await client
      .pair("ABCD-EFGH")
      .catch((cause) => cause);
    const exposed = String(error);

    expect(exposed).toMatch(/orphaned device/i);
    expect(exposed).not.toContain(sentinelToken);
    expect(exposed).not.toContain(sentinelCause);
  });

  it("does not save or expose response data from a rejected redemption", async () => {
    const store = new MemoryCredentialStore();
    const client = new PairingClient({
      baseUrl: "http://127.0.0.1:3000",
      credentialStore: store,
      fetch: fakeFetch({ error: "dt_secret" }, 400),
    });

    const pairing = client.pair("BAD-CODE");
    await expect(pairing).rejects.toThrow(/invalid or expired pairing code/i);
    await expect(pairing).rejects.not.toThrow(/dt_secret/);
    expect(store.saved).toBeNull();
  });

  it.each([
    {
      deviceId: "not-a-uuid",
      deviceToken: "dt_secret",
      requestedProvider: "codex",
    },
    {
      deviceId: DEVICE_ID,
      requestedProvider: "codex",
    },
    {
      deviceId: DEVICE_ID,
      deviceToken: "dt_secret",
      requestedProvider: "unknown",
    },
  ])("does not save a malformed credential response", async (body) => {
    const store = new MemoryCredentialStore();
    const client = new PairingClient({
      baseUrl: "http://127.0.0.1:3000",
      credentialStore: store,
      fetch: fakeFetch(body),
    });

    await expect(client.pair("ABCD-EFGH")).rejects.toThrow(
      /invalid pairing response/i,
    );
    expect(store.saved).toBeNull();
  });
});
