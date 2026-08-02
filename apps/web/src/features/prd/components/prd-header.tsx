import type { ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { RoomPrd } from "../schemas";

// Notion-style property row: a secondary label followed by its value.
function Property({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <HStack gap={3} align="center">
      <Text type="label" color="secondary">
        {label}
      </Text>
      {children}
    </HStack>
  );
}

function statusLabel(status: RoomPrd["status"]) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function PrdHeader({
  prd,
  ownerName,
}: {
  prd: RoomPrd;
  ownerName: string;
}) {
  return (
    <VStack gap={3} width="100%">
      <Heading level={1}>{prd.document.title}</Heading>
      <VStack gap={2}>
        <Property label="Owner">
          <Text>{ownerName}</Text>
        </Property>
        <Property label="Version">
          <Token label={`v${prd.version}`} />
        </Property>
        <Property label="Status">
          <Badge variant="neutral" label={statusLabel(prd.status)} />
        </Property>
        <Property label="Created">
          <Text color="secondary">
            {new Date(prd.createdAt).toLocaleString()}
          </Text>
        </Property>
      </VStack>
    </VStack>
  );
}
