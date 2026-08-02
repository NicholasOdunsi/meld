import { describe, expect, it } from "vitest";
import { MemoryCredentialStore } from "./credential-store";

const credential = {
  deviceId: "40000000-0000-0000-0000-000000000001",
  deviceToken: "dt_secret",
};

describe("memory credential store", () => {
  it("saves, reads, and deletes a credential", async () => {
    const store = new MemoryCredentialStore();

    await store.save(credential);

    await expect(store.read()).resolves.toEqual(credential);
    await store.delete();
    await expect(store.read()).resolves.toBeNull();
  });

  it("can represent an unwritable credential store", async () => {
    const store = new MemoryCredentialStore({ writable: false });

    await expect(store.probe()).resolves.toBe(false);
    await expect(store.save(credential)).rejects.toThrow(
      /not writable/i,
    );
  });

  it("can fail only the post-redemption save", async () => {
    const store = new MemoryCredentialStore({ failOnSave: true });

    await expect(store.probe()).resolves.toBe(true);
    await expect(store.save(credential)).rejects.toThrow(/save/i);
  });
});
