// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseRoomRouting,
  readRoomRouting,
  roomRoutingStorageKey,
  serializeRoomRouting,
  writeRoomRouting,
} from "./room-routing-store";

const ROOM_ID = "20000000-0000-4000-8000-000000000002";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("roomRoutingStorageKey", () => {
  it("scopes the key to one room, matching the draft key convention", () => {
    expect(roomRoutingStorageKey(ROOM_ID)).toBe(
      `room-routing:${ROOM_ID}`,
    );
  });
});

describe("parseRoomRouting", () => {
  it("accepts a known provider", () => {
    expect(parseRoomRouting('{"provider":"claude"}')).toEqual({
      provider: "claude",
    });
  });

  it("rejects an unknown provider rather than propagating it", () => {
    expect(parseRoomRouting('{"provider":"gpt-9"}')).toBeUndefined();
  });

  it("rejects malformed and empty input", () => {
    expect(parseRoomRouting("not json")).toBeUndefined();
    expect(parseRoomRouting("[]")).toBeUndefined();
    expect(parseRoomRouting(null)).toBeUndefined();
  });
});

describe("read/write round trip", () => {
  it("returns what was written", () => {
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    expect(readRoomRouting(ROOM_ID)).toEqual({ provider: "claude" });
  });

  it("persists the provider and selected model", () => {
    writeRoomRouting(ROOM_ID, {
      provider: "codex",
      accountId: "not-yet-supported",
      model: "not-yet-supported",
    });
    expect(
      window.localStorage.getItem(roomRoutingStorageKey(ROOM_ID)),
    ).toBe(
      serializeRoomRouting({
        provider: "codex",
        model: "not-yet-supported",
      }),
    );
  });

  it("keeps rooms independent", () => {
    writeRoomRouting(ROOM_ID, { provider: "claude" });
    expect(
      readRoomRouting("30000000-0000-4000-8000-000000000003"),
    ).toBeUndefined();
  });
});

describe("hostile storage", () => {
  it("degrades to no override when reading throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readRoomRouting(ROOM_ID)).toBeUndefined();
  });

  it("swallows a write that throws, because persistence is a convenience", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() =>
      writeRoomRouting(ROOM_ID, { provider: "claude" }),
    ).not.toThrow();
  });
});
