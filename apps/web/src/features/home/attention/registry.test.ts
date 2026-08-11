import { expect, it, vi } from "vitest";
import { composeAttentionItems } from "./registry";
import type {
  AttentionContext,
  AttentionItem,
  AttentionResolver,
} from "./types";

const CONTEXT: AttentionContext = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
};

function item(
  id: string,
  occurredAt: string,
  kind: AttentionItem["kind"] = "mention",
): AttentionItem {
  return {
    id,
    kind,
    title: `Item ${id}`,
    roomId: "40000000-0000-4000-8000-000000000004",
    roomName: "Checkout",
    occurredAt,
    href: "/org/rooms/room",
  };
}

function resolver(
  kind: AttentionItem["kind"],
  items: AttentionItem[],
): AttentionResolver {
  return { kind, resolve: async () => items };
}

it("sorts items from every resolver, newest first", async () => {
  const result = await composeAttentionItems(
    [
      resolver("mention", [item("a", "2026-07-01T00:00:00.000Z")]),
      resolver("decision_needed", [
        item("b", "2026-07-03T00:00:00.000Z", "decision_needed"),
      ]),
    ],
    CONTEXT,
  );

  expect(result.map((entry) => entry.id)).toEqual(["b", "a"]);
});

it("orders by instant, not by timestamp text, across timezone offsets", async () => {
  // "2026-07-01T23:00:00-05:00" is 2026-07-02T04:00:00Z, which is LATER than
  // "2026-07-02T00:00:00Z". Comparing the raw strings reads the calendar digits
  // and inverts the two.
  const result = await composeAttentionItems(
    [
      resolver("mention", [item("utc", "2026-07-02T00:00:00Z")]),
      resolver("decision_needed", [
        item("offset", "2026-07-01T23:00:00-05:00", "decision_needed"),
      ]),
    ],
    CONTEXT,
  );

  expect(result.map((entry) => entry.id)).toEqual(["offset", "utc"]);
});

it("orders by instant across mixed fractional-second precision", async () => {
  // "." (0x2E) sorts before "Z" (0x5A), so string comparison treats the
  // fractional timestamp as earlier even though it is 500ms later.
  const result = await composeAttentionItems(
    [
      resolver("mention", [item("whole", "2026-07-01T00:00:00Z")]),
      resolver("decision_needed", [
        item("fractional", "2026-07-01T00:00:00.500Z", "decision_needed"),
      ]),
    ],
    CONTEXT,
  );

  expect(result.map((entry) => entry.id)).toEqual(["fractional", "whole"]);
});

it("omits a failing resolver and keeps the rest", async () => {
  const failing: AttentionResolver = {
    kind: "assigned_work",
    resolve: async () => {
      throw new Error("assignments table missing");
    },
  };
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    const result = await composeAttentionItems(
      [
        failing,
        resolver("mention", [item("a", "2026-07-01T00:00:00.000Z")]),
      ],
      CONTEXT,
    );

    expect(result.map((entry) => entry.id)).toEqual(["a"]);

    // The log names the resolver so the failure is diagnosable...
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls
      .flat()
      .map((argument) => String(argument))
      .join(" ");
    expect(logged).toContain("assigned_work");
    // ...but never carries the error itself (OPS-04 redaction).
    expect(logged).not.toContain("assignments table missing");
  } finally {
    errorSpy.mockRestore();
  }
});

it("returns nothing when every resolver is empty", async () => {
  const result = await composeAttentionItems(
    [resolver("mention", [])],
    CONTEXT,
  );

  expect(result).toEqual([]);
});

it("passes the context to every resolver", async () => {
  const resolve = vi.fn().mockResolvedValue([]);
  await composeAttentionItems(
    [{ kind: "mention", resolve }],
    CONTEXT,
  );

  expect(resolve).toHaveBeenCalledWith(CONTEXT);
});
