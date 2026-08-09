import { describe, expect, it } from "vitest";
import { isMissingModelAwareRpc } from "./model-rpc-compat";

describe("isMissingModelAwareRpc", () => {
  it("recognizes a stale PostgREST schema without target_model", () => {
    expect(
      isMissingModelAwareRpc({
        code: "PGRST202",
        message: "Could not find the function with parameter target_model",
      }),
    ).toBe(true);
  });

  it("does not retry an RPC that rejected the request itself", () => {
    expect(
      isMissingModelAwareRpc({
        code: "P0001",
        message: "invalid_room_reply_request",
      }),
    ).toBe(false);
  });
});
