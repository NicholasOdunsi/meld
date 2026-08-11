"use client";

import { Blockquote } from "@astryxdesign/core/Blockquote";
import { Button } from "@astryxdesign/core/Button";
import { useCollapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useId, type CSSProperties } from "react";
import { PRD_SECTION_ORDER } from "@meld/contracts";
import { PRD_SECTIONS } from "@/features/prd/prd-sections";
import type {
  RoomPrdContext,
  RoomPrdContextSection,
} from "../repository";

const fullWidthMinZero = {
  minWidth: "var(--spacing-0)",
  maxWidth: "100%",
} as CSSProperties;

const selectedTextStyle = {
  ...fullWidthMinZero,
  backgroundColor: "var(--color-background-muted)",
  borderInlineStartColor: "var(--color-accent)",
  paddingBlock: "var(--spacing-2)",
  paddingInlineEnd: "var(--spacing-2)",
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

function inRenderedOrder(sections: RoomPrdContextSection[]) {
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
  section: RoomPrdContextSection;
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

// A frozen fragment's text. `maxLines` is opt-in, not the default: the
// collapsed single-section row is a preview sitting inline in the thread, so a
// clamp is right there, but the excerpt disclosure exists precisely to show the
// whole frozen text and clipping it would leave Conversation with no record of
// what was discussed. A fragment may legitimately carry no quote at all, in
// which case nothing is rendered rather than an empty pair of quote marks.
function Excerpt({
  text,
  maxLines,
}: {
  text: string;
  maxLines?: number;
}) {
  if (text.length === 0) return null;
  return (
    <Blockquote
      style={selectedTextStyle}
      data-testid="prd-context-excerpt"
    >
      <Text
        color="secondary"
        maxLines={maxLines}
        hasTruncateTooltip={false}
        textWrap="pretty"
        wordBreak="break-word"
        style={fullWidthMinZero}
      >
        “{text}”
      </Text>
    </Blockquote>
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
  context: RoomPrdContext;
  basePath?: string;
}) {
  const sections = inRenderedOrder(context.sections);
  const [only] = sections;
  const previewText =
    sections.find((section) => section.quotedText.length > 0)?.quotedText ??
    "";
  const hasExpandableSelection =
    previewText.length > 0 &&
    (sections.length > 1 || previewText.length > 180);
  const selectionId = useId();
  const selectionDisclosure = useCollapsible({
    isCollapsible: { defaultIsOpen: false },
    value:
      context.assistRequestId ?? `${context.prdId}:${context.version}`,
  });

  return (
    <VStack
      gap={0.5}
      width="100%"
      data-testid="prd-context"
      style={fullWidthMinZero}
    >
      <HStack gap={1} vAlign="center" wrap="wrap">
        <Text type="label" color="secondary">
          Selected from
        </Text>
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

      {sections.length > 1 ? (
        <HStack gap={2} wrap="wrap">
          {sections.map((section) => (
            <SectionLabel
              key={section.field}
              section={section}
              basePath={basePath}
            />
          ))}
        </HStack>
      ) : null}

      {hasExpandableSelection ? (
        <VStack gap={0.5} width="100%" style={fullWidthMinZero}>
          {!selectionDisclosure.isOpen ? (
            <Excerpt text={previewText} maxLines={2} />
          ) : null}
          {selectionDisclosure.isOpen ? (
            <VStack
              id={selectionId}
              role="region"
              aria-label="Full selected text"
              gap={1}
              width="100%"
              style={fullWidthMinZero}
            >
              {sections.map((section) => (
                <VStack key={section.field} gap={0.5} width="100%">
                  {sections.length > 1 ? (
                    <Text type="label" color="secondary">
                      {section.label}
                    </Text>
                  ) : null}
                  <Excerpt text={section.quotedText} />
                </VStack>
              ))}
            </VStack>
          ) : null}
          <HStack
            width="100%"
            hAlign="end"
            data-testid="prd-context-disclosure"
          >
            <Button
              label={
                selectionDisclosure.isOpen
                  ? "Show less"
                  : "Show full selection"
              }
              variant="ghost"
              size="sm"
              aria-controls={selectionId}
              aria-expanded={selectionDisclosure.isOpen}
              onClick={selectionDisclosure.toggle}
              style={{
                backgroundColor: "transparent",
                backgroundImage: "none",
                minHeight: "var(--spacing-0)",
                padding: "var(--spacing-0)",
              }}
            >
              <Text type="supporting" color="secondary">
                {selectionDisclosure.isOpen
                  ? "Show less"
                  : "Show full selection"}
              </Text>
            </Button>
          </HStack>
        </VStack>
      ) : (
        <Excerpt text={previewText} />
      )}
    </VStack>
  );
}
