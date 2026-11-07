import { describe, expect, it } from "vitest";
import { createShelfServerClient } from "./shelf-server";

describe("createShelfServerClient", () => {
  it("names the missing variable without printing any value", () => {
    expect(() => createShelfServerClient({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toThrow(
      "Invalid shelf configuration: MELD_SHELF_SERVICE_ROLE_KEY",
    );
    expect(() => createShelfServerClient({ MELD_SHELF_SERVICE_ROLE_KEY: "secret" })).toThrow(
      "Invalid shelf configuration: NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("builds a client when both values exist", () => {
    const client = createShelfServerClient({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      MELD_SHELF_SERVICE_ROLE_KEY: "service-role",
    });
    expect(typeof client.rpc).toBe("function");
  });
});
