import { expect, it, vi } from "vitest";
import { composeAttentionItems } from "./registry";
import type {
  AttentionContext,
  AttentionItem,
  AttentionResolver,
} from "./types";

const CONTEXT: AttentionContext = {
  userId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
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
    href: "/org/discovery/room",
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

it("omits a failing resolver and keeps the rest", async () => {
  const failing: AttentionResolver = {
    kind: "assigned_work",
    resolve: async () => {
      throw new Error("assignments table missing");
    },
  };

  const result = await composeAttentionItems(
    [
      failing,
      resolver("mention", [item("a", "2026-07-01T00:00:00.000Z")]),
    ],
    CONTEXT,
  );

  expect(result.map((entry) => entry.id)).toEqual(["a"]);
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
