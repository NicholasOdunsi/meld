import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export function UserFlowTrialUnavailable() {
  return (
    <VStack width="100%" height="fill" padding={6} hAlign="center" vAlign="center" gap={2} data-testid="user-flow-trial-unavailable">
      <StatusDot variant="warning" label="User flow access unavailable" />
      <Text type="label">Canvas is unavailable</Text>
      <Text type="supporting" color="secondary">Ask a room editor to grant access before opening this trial canvas.</Text>
    </VStack>
  );
}
