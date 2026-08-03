"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/VStack";
import type { PRDDocument } from "@meld/contracts";
import { findPrdGaps } from "../prd-review";
import { PRD_SECTIONS } from "../prd-sections";

function warningCountLabel(count: number) {
  return `${count} review warning${count === 1 ? "" : "s"}`;
}

export function PrdGapReview({
  document,
  isOpen,
  onOpenChange,
  onSelectSection,
}: {
  document: PRDDocument;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectSection: (sectionId: string) => void;
}) {
  const gaps = findPrdGaps(document);
  const gapsBySection = PRD_SECTIONS.flatMap((section) => {
    const sectionGaps = gaps.filter((gap) => gap.sectionId === section.id);
    return sectionGaps.length === 0 ? [] : [{ section, gaps: sectionGaps }];
  });

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="calc(var(--spacing-12) * 8)"
      purpose="info"
      padding={3}
    >
      <Layout
        height="auto"
        header={
          <DialogHeader
            title="Review gaps"
            subtitle="Review warnings before accepting this version."
            onOpenChange={onOpenChange}
          />
        }
      >
        <VStack gap={4} padding={3} width="100%">
          {gaps.length === 0 ? (
            <Banner
              status="success"
              title="No review warnings"
              description="This version has no known gaps."
            />
          ) : (
            <>
              <Banner
                status="warning"
                title={warningCountLabel(gaps.length)}
                description="Warnings do not block acceptance, but they should be resolved or explicitly understood."
              />
              {gapsBySection.map(({ section, gaps: sectionGaps }) => (
                <VStack key={section.id} gap={2} width="100%">
                  <Heading level={3}>{section.label}</Heading>
                  <List density="compact" hasDividers>
                    {sectionGaps.map((gap) => (
                      <ListItem
                        key={gap.id}
                        label={
                          <Link
                            href={`#${gap.sectionId}`}
                            onClick={(event) => {
                              event.preventDefault();
                              onSelectSection(gap.sectionId);
                              onOpenChange(false);
                            }}
                          >
                            {gap.message}
                          </Link>
                        }
                      />
                    ))}
                  </List>
                </VStack>
              ))}
            </>
          )}
        </VStack>
      </Layout>
    </Dialog>
  );
}
