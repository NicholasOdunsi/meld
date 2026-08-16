"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useMemo, useState } from "react";
import { diffPrdDocuments, type PrdDiff } from "../prd-diff";
import type { RoomPrd } from "../schemas";

function deduplicateAndSort(history: RoomPrd[], currentPrd: RoomPrd) {
  const byId = new Map<string, RoomPrd>();
  for (const version of [...history, currentPrd]) {
    byId.set(version.id, version);
  }
  return [...byId.values()].sort((left, right) => right.version - left.version);
}

function rowChangeSummary(diff: PrdDiff) {
  const beforeRows = diff.before;
  const afterRows = diff.after;
  if (!Array.isArray(beforeRows) || !Array.isArray(afterRows)) {
    return `${diff.label} changed`;
  }

  const added = afterRows.filter((row) => !beforeRows.includes(row)).length;
  const removed = beforeRows.filter((row) => !afterRows.includes(row)).length;
  if (added === 0 && removed === 0) return `${diff.label} changed`;

  const changes = [
    added > 0 ? `${added} added` : null,
    removed > 0 ? `${removed} removed` : null,
  ].filter(Boolean);
  return `${diff.label}: ${changes.join(", ")}`;
}

function VersionMetadata({
  version,
  isCurrent,
  isLastAccepted,
}: {
  version: RoomPrd;
  isCurrent: boolean;
  isLastAccepted: boolean;
}) {
  return (
    <HStack gap={1} wrap="wrap">
      {version.status === "accepted" ? (
        <Badge label="Accepted" variant="neutral" />
      ) : null}
      {isCurrent ? <Token label="Current" color="blue" /> : null}
      {isLastAccepted ? <Token label="Last accepted" color="green" /> : null}
    </HStack>
  );
}

export function PrdVersionHistory({
  currentPrd,
  history,
  isOpen,
  onOpenChange,
}: {
  currentPrd: RoomPrd;
  history: RoomPrd[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const versions = useMemo(
    () => deduplicateAndSort(history, currentPrd),
    [currentPrd, history],
  );
  const [selectedVersionId, setSelectedVersionId] = useState(currentPrd.id);

  // Reset the selection to the current version whenever it changes (e.g. after a
  // save or acceptance). Adjusting state during render is React's recommended
  // alternative to a prop-syncing effect.
  const [seenCurrentId, setSeenCurrentId] = useState(currentPrd.id);
  if (seenCurrentId !== currentPrd.id) {
    setSeenCurrentId(currentPrd.id);
    setSelectedVersionId(currentPrd.id);
  }

  const selectedIndex = Math.max(
    0,
    versions.findIndex((version) => version.id === selectedVersionId),
  );
  const selectedVersion = versions[selectedIndex] ?? currentPrd;
  const comparisonVersion =
    selectedIndex === 0 ? versions[1] : versions[selectedIndex - 1];
  const newerVersion = comparisonVersion
    ? selectedVersion.version > comparisonVersion.version
      ? selectedVersion
      : comparisonVersion
    : null;
  const olderVersion = comparisonVersion
    ? selectedVersion.version > comparisonVersion.version
      ? comparisonVersion
      : selectedVersion
    : null;
  const diffs =
    newerVersion && olderVersion
      ? diffPrdDocuments(olderVersion.document, newerVersion.document)
      : [];
  const lastAcceptedId = versions.find(
    (version) => version.status === "accepted",
  )?.id;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="calc(var(--spacing-12) * 10)"
      purpose="info"
    >
      <Layout
        height="auto"
        header={
          <DialogHeader
            title="Version history"
            subtitle="Select a version to compare it with its nearest neighbor."
            onOpenChange={onOpenChange}
          />
        }
      >
        <VStack gap={4} padding={4} width="100%">
          <VStack gap={2} width="100%">
            <Heading level={3}>Versions</Heading>
            <List density="compact" hasDividers>
              {versions.map((version) => (
                <ListItem
                  key={version.id}
                  label={<Text>{`Version v${version.version}`}</Text>}
                  description={
                    <Text color="secondary">
                      {`${version.status === "accepted" ? "Accepted" : "Draft"} · Updated ${new Date(version.updatedAt).toLocaleString()}`}
                    </Text>
                  }
                  endContent={
                    <VersionMetadata
                      version={version}
                      isCurrent={version.id === currentPrd.id}
                      isLastAccepted={version.id === lastAcceptedId}
                    />
                  }
                  isSelected={version.id === selectedVersion.id}
                  onClick={() => setSelectedVersionId(version.id)}
                />
              ))}
            </List>
          </VStack>
          <Card padding={4} width="100%">
            <VStack gap={2} width="100%">
              <Heading level={3}>Comparison</Heading>
              {newerVersion && olderVersion ? (
                <>
                  <Text color="secondary">
                    {`v${newerVersion.version} compared with v${olderVersion.version}`}
                  </Text>
                  {diffs.length === 0 ? (
                    <Text>{`No changes compared with v${newerVersion.version}.`}</Text>
                  ) : (
                    <List density="compact" hasDividers>
                      {diffs.map((diff) => (
                        <ListItem
                          key={diff.sectionId}
                          label={<Text>{rowChangeSummary(diff)}</Text>}
                        />
                      ))}
                    </List>
                  )}
                </>
              ) : (
                <Text>No earlier version is available for comparison.</Text>
              )}
            </VStack>
          </Card>
        </VStack>
      </Layout>
    </Dialog>
  );
}
