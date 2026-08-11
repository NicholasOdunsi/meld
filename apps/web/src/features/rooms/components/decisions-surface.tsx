import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { sortRoomDecisions, type RoomDecision } from "../overview";

export function DecisionsSurface({
  decisions,
  basePath,
}: {
  decisions: readonly RoomDecision[];
  basePath: string;
}) {
  const chronologicalDecisions = sortRoomDecisions(decisions);

  return (
    <Section variant="transparent" padding={0} width="100%">
      <VStack gap={0} width="100%">
        <Section variant="transparent" padding={4} dividers={["bottom"]}>
          <Heading level={3} accessibilityLevel={2}>
            Decisions
          </Heading>
        </Section>
        {chronologicalDecisions.length > 0 ? (
          <List
            density="compact"
            hasDividers
            header={<VisuallyHidden>Room decisions</VisuallyHidden>}
          >
            {chronologicalDecisions.map((decision) => (
              <ListItem
                key={decision.id}
                label={decision.summary}
                description={
                  <Text type="supporting">
                    {decision.createdByName} ·{" "}
                    <Timestamp
                      value={decision.createdAt}
                      format="date_time"
                      type="inherit"
                    />
                  </Text>
                }
                endContent={
                  decision.sourceMessageId ? (
                    <Text type="supporting" color="accent">
                      View message
                    </Text>
                  ) : undefined
                }
                href={
                  decision.sourceMessageId
                    ? `${basePath}?tab=conversation&message=${decision.sourceMessageId}`
                    : undefined
                }
              />
            ))}
          </List>
        ) : (
          <Section variant="transparent" padding={4}>
            <Text color="secondary">No decisions recorded yet</Text>
          </Section>
        )}
      </VStack>
    </Section>
  );
}
