import { SHELF_ERROR_MESSAGES, ShelfErrorCodeSchema } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { SHELF_ERROR_STATUS, shelfError } from "./shelf-responses";

describe("shelfError", () => {
  it("maps every code to the spec status and message", async () => {
    expect(SHELF_ERROR_STATUS).toEqual({
      unauthorized: 401,
      invalid_code: 400,
      rate_limited: 429,
      unsupported_type: 415,
      too_large: 413,
      invalid_image: 422,
      unavailable: 503,
    });
    for (const code of ShelfErrorCodeSchema.options) {
      const response = shelfError(code);
      expect(response.status).toBe(SHELF_ERROR_STATUS[code]);
      expect(await response.json()).toEqual({ error: { code, message: SHELF_ERROR_MESSAGES[code] } });
    }
  });
});
