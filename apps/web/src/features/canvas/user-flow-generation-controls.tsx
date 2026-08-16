"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type { UserFlowGenerationHook } from "./use-user-flow-generation";

export function UserFlowGenerationControls({
  access,
  state,
  onGenerate,
}: {
  access: "edit" | "view";
  state: UserFlowGenerationHook;
  onGenerate: (clarification?: string) => void;
}) {
  const [clarification, setClarification] = useState("");
  if (access === "view") return null;
  const needsContext = state.status === "needs_context";
  const failed = state.status === "failed";
  const isGenerating = state.status === "queued" || state.status === "running";
  return (
    <VStack gap={1} padding={2} width="100%" data-testid="user-flow-generation-controls">
      <HStack gap={2} vAlign="center">
        <Button
          label="Generate User Flow"
          variant="secondary"
          size="sm"
          isLoading={isGenerating}
          isDisabled={isGenerating}
          onClick={() => onGenerate()}
        />
        {isGenerating ? (
          <HStack gap={1} vAlign="center">
            <Spinner size="sm" label="Generating user flow" />
            <Text type="supporting" color="secondary">Generating draft</Text>
          </HStack>
        ) : null}
        {state.status === "completed" ? <StatusDot variant="success" label="Draft added" /> : null}
      </HStack>
      {needsContext ? (
        <VStack gap={1} width="100%">
          <Text type="supporting" color="primary">
            {state.message ?? "Add context before generating this flow."}
          </Text>
          <TextArea
            label="Flow context"
            isLabelHidden
            value={clarification}
            placeholder="Describe the user goal, starting point, and successful outcome"
            rows={2}
            maxLength={2000}
            onChange={setClarification}
            htmlName="user-flow-clarification"
          />
          <Button
            label="Generate with context"
            size="sm"
            isDisabled={clarification.trim().length === 0}
            onClick={() => {
              onGenerate(clarification.trim() || undefined);
              setClarification("");
            }}
          />
        </VStack>
      ) : null}
      {failed ? (
        <HStack gap={2} vAlign="center">
          <Text type="supporting" color="secondary">
            {state.message ?? "User flow generation did not complete."}
          </Text>
          <Button label="Retry generation" size="sm" onClick={() => onGenerate()} />
        </HStack>
      ) : null}
    </VStack>
  );
}
