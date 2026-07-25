import type {
  AttentionContext,
  AttentionItem,
  AttentionResolver,
} from "./types";

export async function composeAttentionItems(
  resolvers: AttentionResolver[],
  context: AttentionContext,
): Promise<AttentionItem[]> {
  const settled = await Promise.allSettled(
    resolvers.map((resolver) => resolver.resolve(context)),
  );

  const items: AttentionItem[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      items.push(...outcome.value);
      return;
    }
    console.error(
      `Attention resolver "${resolvers[index].kind}" failed.`,
    );
  });

  // Compare instants rather than timestamp text: resolvers are independent and
  // nothing in the contract forces a single normalized format, so raw string
  // comparison would invert timezone offsets and mixed fractional precision.
  return items.sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() -
      new Date(left.occurredAt).getTime(),
  );
}
