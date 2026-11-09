import { AppShell } from "@astryxdesign/core/AppShell";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { OrionTalkingHat, type OrionTalkingHatExpression } from "@/ui/orion-talking-hat";

const expressions: OrionTalkingHatExpression[] = ["neutral", "curious", "speaking"];

export default function OrionMascotPreview() {
  return (
    <AppShell height="auto" contentPadding={6} variant="surface">
      <VStack gap={8} maxWidth="calc(var(--spacing-12) * 22)">
        <VStack gap={2}>
          <Heading level={1}>Orion talking hat</Heading>
          <Text type="supporting">A weathered, fold-faced mascot in three expressions.</Text>
        </VStack>
        <HStack gap={6} wrap="wrap" vAlign="start">
          {expressions.map((expression) => (
            <Card key={expression} padding={4} width="calc(var(--spacing-12) * 7)">
              <VStack gap={3} hAlign="center">
                <OrionTalkingHat expression={expression} width="100%" height="auto" aria-label={`Orion talking hat, ${expression}`} />
                <Text type="label">{expression}</Text>
              </VStack>
            </Card>
          ))}
        </HStack>
        <VStack gap={3}>
          <Heading level={2}>Small size</Heading>
          <HStack gap={4} vAlign="center" wrap="wrap">
            {expressions.map((expression) => (
              <Card key={expression} padding={3} variant="muted">
                <VStack gap={2} hAlign="center">
                  <OrionTalkingHat appearance="avatar" expression={expression} width={64} height={64} aria-label={`Orion talking hat avatar, ${expression}`} />
                  <Text type="supporting">{expression}</Text>
                </VStack>
              </Card>
            ))}
          </HStack>
        </VStack>
      </VStack>
    </AppShell>
  );
}
