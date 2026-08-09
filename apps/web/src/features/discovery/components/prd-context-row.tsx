"use client";

import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { CSSProperties } from "react";
import { PRD_SECTION_ORDER } from "@meld/contracts";
import { PRD_SECTIONS } from "@/features/prd/prd-sections";
import type {
  DiscoveryPrdContext,
  DiscoveryPrdContextSection,
} from "../repository";

const fullWidthMinZero = {
  minWidth: "var(--spacing-0)",
  maxWidth: "100%",
} as CSSProperties;

const SECTION_ANCHORS = new Map<string, string>(
  PRD_SECTIONS.map((section) => [section.field as string, section.id]),
);

// PRD_SECTION_ORDER is the one ordering authority for a PRD's sections; a
// field it does not name sorts last, keeping the order the row froze it in
// (Array.prototype.sort is stable, so equal ranks never shuffle).
const SECTION_RANK = new Map<string, number>(
  PRD_SECTION_ORDER.map((field, index) => [field as string, index]),
);

export function prdSectionHref(
  basePath: string | undefined,
  field: string,
): string | null {
  const anchor = SECTION_ANCHORS.get(field);
  return anchor ? `${basePath ?? ""}?tab=prd#${anchor}` : null;
}

export function prdSectionKind(field: string) {
  return (
    PRD_SECTIONS.find((section) => section.field === field)?.kind ?? "prose"
  );
}

function inRenderedOrder(sections: DiscoveryPrdContextSection[]) {
  return [...sections].sort(
    (left, right) =>
      (SECTION_RANK.get(left.field) ?? Number.MAX_SAFE_INTEGER) -
      (SECTION_RANK.get(right.field) ?? Number.MAX_SAFE_INTEGER),
  );
}

// A section this build does not render has no anchor to jump to, so its label
// stays plain text rather than becoming a link that goes nowhere.
function SectionLabel({
  section,
  basePath,
}: {
  section: DiscoveryPrdContextSection;
  basePath?: string;
}) {
  const href = prdSectionHref(basePath, section.field);
  return href ? (
    <Link href={href}>{section.label}</Link>
  ) : (
    <Text type="supporting" color="secondary">
      {section.label}
    </Text>
  );
}

function Excerpt({ text }: { text: string }) {
  return (
    <Text
      color="secondary"
      maxLines={2}
      hasTruncateTooltip={false}
      textWrap="pretty"
      wordBreak="break-word"
      style={fullWidthMinZero}
    >
      “{text}”
    </Text>
  );
}

// What PRD text a message was written against, frozen at submission time. It
// reads out of the message row alone -- no follow-up query -- which is why a
// Realtime INSERT can render it, and why the quote and the version stay exactly
// as they were even after the live PRD has moved on.
export function PrdContextRow({
  context,
  basePath,
}: {
  context: DiscoveryPrdContext;
  basePath?: string;
}) {
  const sections = inRenderedOrder(context.sections);
  const [only] = sections;

  return (
    <VStack
      gap={0.5}
      width="100%"
      data-testid="prd-context"
      style={fullWidthMinZero}
    >
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text type="supporting" color="secondary">
          PRD
        </Text>
        <Text type="supporting" color="secondary">
          /
        </Text>
        {sections.length === 1 ? (
          <SectionLabel section={only} basePath={basePath} />
        ) : (
          <Text type="supporting" color="secondary">
            {sections.length} selected sections
          </Text>
        )}
        <Text type="supporting" color="secondary">
          /
        </Text>
        <Text type="supporting" color="secondary">
          v{context.version}
        </Text>
      </HStack>

      {sections.length === 1 ? (
        <Excerpt text={only.quotedText} />
      ) : (
        <VStack gap={0.5} width="100%" style={fullWidthMinZero}>
          <HStack gap={2} wrap="wrap">
            {sections.map((section) => (
              <SectionLabel
                key={section.field}
                section={section}
                basePath={basePath}
              />
            ))}
          </HStack>
          <Collapsible
            defaultIsOpen={false}
            trigger={<Text type="label">Selected excerpts</Text>}
          >
            <VStack gap={1} width="100%" style={fullWidthMinZero}>
              {sections.map((section) => (
                <VStack key={section.field} gap={0.5} width="100%">
                  <Text type="label" color="secondary">
                    {section.label}
                  </Text>
                  <Excerpt text={section.quotedText} />
                </VStack>
              ))}
            </VStack>
          </Collapsible>
        </VStack>
      )}
    </VStack>
  );
}
