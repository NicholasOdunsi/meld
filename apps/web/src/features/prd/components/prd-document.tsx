"use client";

import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { Link } from "@boxicons/react/Link";
import type { PRDDocument } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PRD_SECTIONS, type PrdSectionKind } from "../prd-sections";
import type { RoomPrd } from "../schemas";
import { PrdEditor } from "./prd-editor";
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
        // A plain-string label gets single-line truncation from ListItem; PRD
        // items are full sentences, so pass a Text node (rich content) to let
        // them wrap instead of overflowing the column.
        <ListItem key={`${index}-${item}`} label={<Text>{item}</Text>} />
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
          <ListItem key={`${index}-${item}`} label={<Text>{item}</Text>} />
        ))}
      </List>
      <List
        density="compact"
        listStyle="disc"
        header={<Text type="label">Excluded</Text>}
      >
        {scope.excluded.map((item, index) => (
          <ListItem key={`${index}-${item}`} label={<Text>{item}</Text>} />
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
        // Text nodes (not plain strings) so the risk and mitigation wrap
        // instead of truncating to one line.
        <ListItem
          key={`${index}-${r.risk}`}
          label={<Text type="label">{r.risk}</Text>}
          description={<Text color="secondary">{r.mitigation}</Text>}
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

export type PrdDocumentProps = {
  prd: RoomPrd;
  ownerName: string;
  basePath: string;
  history: RoomPrd[];
  canEdit: boolean;
  canAccept: boolean;
};

export function PrdDocument({
  prd,
  ownerName,
  basePath,
  canEdit,
}: PrdDocumentProps) {
  const router = useRouter();
  const [currentPrd, setCurrentPrd] = useState(prd);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setCurrentPrd((current) =>
        prd.version >= current.version ? prd : current,
      );
    }
  }, [isEditing, prd]);

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
          <PrdHeader
            prd={currentPrd}
            ownerName={ownerName}
            canEdit={canEdit && !isEditing}
            isDirty={isDirty}
            onEdit={() => setIsEditing(true)}
          />
          {isEditing ? (
            <PrdEditor
              initialPrd={currentPrd}
              canEdit={canEdit}
              onSaved={setCurrentPrd}
              onCancel={() => {
                setIsDirty(false);
                setIsEditing(false);
              }}
              onDirtyChange={setIsDirty}
              onReviewLatest={() => {
                setIsDirty(false);
                setIsEditing(false);
                router.refresh();
              }}
            />
          ) : (
            PRD_SECTIONS.map((section) => (
              <VStack key={section.id} id={section.id} gap={2} width="100%">
                <Heading level={3}>{section.label}</Heading>
                <SectionBody
                  kind={section.kind}
                  value={currentPrd.document[section.field]}
                  basePath={basePath}
                />
              </VStack>
            ))
          )}
        </VStack>
      </VStack>
      <PrdOutlineRail items={outlineItems} />
    </HStack>
  );
}
