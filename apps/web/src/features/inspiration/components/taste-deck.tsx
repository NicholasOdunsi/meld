"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { TASTE_TILE_LABELS } from "../taste/describe-suggestion";
import { decideTasteSuggestion, type TasteSuggestionView } from "../taste/taste-actions";

export function TasteDeckButton({ pending, onDone }: { pending: TasteSuggestionView[]; onDone: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [isDeciding, setIsDeciding] = useState(false);
  if (pending.length === 0) return null;
  const card = pending[index];

  async function decide(decision: "kept" | "rejected") {
    if (!card || isDeciding) return;
    setIsDeciding(true);
    await decideTasteSuggestion({ suggestionId: card.id, decision });
    setIsDeciding(false);
    if (index + 1 < pending.length) {
      setIndex(index + 1);
    } else {
      setIsOpen(false);
      setIndex(0);
      onDone();
    }
  }

  return (
    <>
      <Button
        label={`${pending.length} ${pending.length === 1 ? "update" : "updates"} · Review`}
        variant="primary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} purpose="info" width="calc(var(--spacing-12) * 8)">
        {card ? (
          <Layout
            header={<DialogHeader title="Orion noticed something" subtitle={`${index + 1} of ${pending.length}`} onOpenChange={setIsOpen} />}
            content={
              <LayoutContent>
                <VStack gap={3}>
                  <Text type="supporting">{TASTE_TILE_LABELS[card.tile]}</Text>
                  <Heading level={2}>{card.headline}</Heading>
                  {card.evidence.length > 0 ? (
                    <HStack gap={2}>
                      {card.evidence.map((item) =>
                        item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, same as the library grid
                          <img
                            key={item.id}
                            src={item.imageUrl}
                            alt="Evidence image"
                            style={{ blockSize: "calc(var(--spacing-12) * 2)", flexGrow: 1, objectFit: "cover", borderRadius: "var(--radius-element)" }}
                          />
                        ) : null,
                      )}
                    </HStack>
                  ) : null}
                  <Text type="supporting">{card.reason}</Text>
                </VStack>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <HStack gap={2} hAlign="end">
                  <Button label="Not me" isDisabled={isDeciding} onClick={() => void decide("rejected")} />
                  <Button label="Keep it" variant="primary" isDisabled={isDeciding} onClick={() => void decide("kept")} />
                </HStack>
              </LayoutFooter>
            }
          />
        ) : null}
      </Dialog>
    </>
  );
}
