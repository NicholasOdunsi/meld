import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { Link } from "@boxicons/react/Link";
import type { PRDDocument } from "@meld/contracts";
import { PRD_SECTIONS, type PrdSectionKind } from "../prd-sections";
import type { RoomPrd } from "../schemas";
import { PrdHeader } from "./prd-header";
import { PrdOutlineRail } from "./prd-outline-rail";

function ProseSection({ value }: { value: string }) {
  // Markdown defaults contentWidth to 680px, which reads as an unexpectedly
  // narrow column inside a full-width document body -- pass "100%" so prose
  // fills the section instead of clamping to the chat-message default.
  return (
    <Markdown density="compact" contentWidth="100%">
      {value}
    </Markdown>
  );
}

function ListSection({ items }: { items: string[] }) {
  return (
    <List density="compact" listStyle="disc">
      {items.map((item, index) => (
        <ListItem key={`${index}-${item}`} label={item} />
      ))}
    </List>
  );
}

function MvpScopeSection({ scope }: { scope: PRDDocument["mvpScope"] }) {
  return (
    <HStack gap={4} width="100%" align="start">
      <List
        density="compact"
        listStyle="disc"
        header={<Text type="label">Included</Text>}
      >
        {scope.included.map((item, index) => (
          <ListItem key={`${index}-${item}`} label={item} />
        ))}
      </List>
      <List
        density="compact"
        listStyle="disc"
        header={<Text type="label">Excluded</Text>}
      >
        {scope.excluded.map((item, index) => (
          <ListItem key={`${index}-${item}`} label={item} />
        ))}
      </List>
    </HStack>
  );
}

function RisksSection({
  risks,
}: {
  risks: PRDDocument["risksAndMitigations"];
}) {
  return (
    <List density="compact">
      {risks.map((r, index) => (
        <ListItem
          key={`${index}-${r.risk}`}
          label={r.risk}
          description={r.mitigation}
        />
      ))}
    </List>
  );
}

function DecisionHistorySection({
  decisions,
  basePath,
}: {
  decisions: PRDDocument["decisionHistory"];
  basePath: string;
}) {
  return (
    <VStack gap={4} width="100%">
      {decisions.map((decision, decisionIndex) => (
        <VStack
          key={`${decisionIndex}-${decision.decision}`}
          gap={1}
          width="100%"
        >
          <Text type="label">{decision.decision}</Text>
          <Text color="secondary">{decision.rationale}</Text>
          <HStack gap={2}>
            {decision.sourceMessageIds.map((messageId, index) => (
              <Token
                key={messageId}
                label={`Source ${index + 1}`}
                color="blue"
                icon={<Link pack="basic" size="sm" />}
                href={`${basePath}?tab=conversation#message-${messageId}`}
              />
            ))}
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}

function SectionBody({
  kind,
  value,
  basePath,
}: {
  kind: PrdSectionKind;
  value: PRDDocument[keyof PRDDocument];
  basePath: string;
}) {
  switch (kind) {
    case "prose":
      return <ProseSection value={value as string} />;
    case "list":
      return <ListSection items={value as string[]} />;
    case "mvp":
      return <MvpScopeSection scope={value as PRDDocument["mvpScope"]} />;
    case "risks":
      return (
        <RisksSection risks={value as PRDDocument["risksAndMitigations"]} />
      );
    case "decisions":
      return (
        <DecisionHistorySection
          decisions={value as PRDDocument["decisionHistory"]}
          basePath={basePath}
        />
      );
  }
}

export function PrdDocument({
  prd,
  ownerName,
  basePath,
}: {
  prd: RoomPrd;
  ownerName: string;
  basePath: string;
}) {
  const outlineItems = PRD_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
  }));

  return (
    <HStack
      width="100%"
      height="100%"
      vAlign="start"
      style={{ overflowY: "auto", overflowX: "hidden" }}
    >
      <VStack
        align="center"
        width="100%"
        style={{
          minWidth: "var(--spacing-0)",
          padding: "var(--spacing-8) var(--spacing-6)",
        }}
      >
        <VStack gap={6} width="100%" maxWidth="calc(var(--spacing-12) * 15)">
          <PrdHeader prd={prd} ownerName={ownerName} />
          {PRD_SECTIONS.map((section) => (
            <VStack key={section.id} id={section.id} gap={2} width="100%">
              <Heading level={3}>{section.label}</Heading>
              <SectionBody
                kind={section.kind}
                value={prd.document[section.field]}
                basePath={basePath}
              />
            </VStack>
          ))}
        </VStack>
      </VStack>
      <PrdOutlineRail items={outlineItems} />
    </HStack>
  );
}
