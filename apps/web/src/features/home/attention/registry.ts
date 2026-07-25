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

  return items.sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
}
