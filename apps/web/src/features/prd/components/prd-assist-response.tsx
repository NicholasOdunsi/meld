"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { Link } from "@boxicons/react/Link";
import type { Provider } from "@meld/contracts";
import { WaveText } from "@/ui/wave-text";
import { prdAssistOutcome } from "../prd-assist-outcome";
import type { PrdAssistRequest } from "../schemas";

// The one thing the PRD tab says while a request is in flight. Exported so
// the composer can show the same words in the gap between queueing a request
// and reading it back, rather than flickering through a second phrasing.
export const PRD_ASSIST_THINKING_LABEL = "Product Agent is thinking";

function alternateProvider(provider: Provider): Provider {
  return provider === "claude" ? "codex" : "claude";
}

function providerLabel(provider: Provider): string {
  return provider === "claude" ? "Claude" : "Codex";
}

// Everything a reader is told about a failure comes from a closed set of
// persisted codes. The provider's own error text is never participant-safe and
// never reaches this component.
function failureReason(request: PrdAssistRequest): string {
  if (request.proposalErrorCode === "section_has_active_proposal") {
    return "That section already has a suggestion waiting for review. Apply or discard it, then ask again.";
  }
  if (request.proposalErrorCode === "edit_not_permitted") {
    return "You have view-only access to this PRD, so the Product Agent cannot suggest a change.";
  }
  switch (request.errorCode) {
    case "authentication_required":
      return "The provider needs you to sign in again.";
    case "usage_limit_reached":
      return "That provider has reached its usage limit.";
    case "provider_unavailable":
    case "provider_install_failed":
    case "connector_outdated":
      return "The provider could not be reached from your device.";
    case "permission_changed":
      return "Your access to this room changed while the request was running.";
    case "security_boundary_violated":
    case "malformed_output":
      return "The Product Agent's reply could not be used.";
    case "execution_abandoned":
      return "The request stopped before it finished.";
    case "cancelled":
      return "The request was cancelled.";
    default:
      return "The request did not finish. Nothing in the PRD was changed.";
  }
}

// Everything the selection popover shows once a request has been sent: the
// working state, an answer, a clarifying question, or a failure with its
// recovery. The edit half of an outcome is deliberately absent -- a proposal
// renders beside the text it changes, not here.
export function PrdAssistResponse({
  request,
  basePath,
  onRetry,
}: {
  request: PrdAssistRequest;
  basePath: string;
  onRetry: (provider: Provider) => void;
}) {
  const outcome = prdAssistOutcome(request);

  if (outcome === "pending") {
    return (
      <WaveText
        text={PRD_ASSIST_THINKING_LABEL}
        type="body"
        color="secondary"
      />
    );
  }

  if (outcome === "failed") {
    const alternate = alternateProvider(request.provider);
    return (
      <Banner
        status="error"
        title="The Product Agent could not answer this"
        description={failureReason(request)}
        endContent={
          <HStack gap={2} wrap="wrap">
            <Button
              size="sm"
              variant="secondary"
              label="Try again"
              onClick={() => onRetry(request.provider)}
            />
            <Button
              size="sm"
              variant="secondary"
              label={`Try with ${providerLabel(alternate)}`}
              onClick={() => onRetry(alternate)}
            />
          </HStack>
        }
      />
    );
  }

  if (outcome === "clarification") {
    return (
      <VStack gap={1} width="100%">
        <Text type="label">Product Agent</Text>
        <Text textWrap="pretty" wordBreak="break-word">
          {request.clarifyingQuestion}
        </Text>
      </VStack>
    );
  }

  // answer or answer_and_edit. An edit-only outcome has nothing to say here:
  // its proposal is already rendered in the section it targets.
  if (request.answer === null) return null;

  // The exchange is persisted to Conversation as soon as it is classified, but
  // the ids arrive with settlement; before they do, the tab itself is still the
  // honest destination.
  const conversationHref = request.answerMessageId
    ? `${basePath}?tab=conversation#message-${request.answerMessageId}`
    : `${basePath}?tab=conversation`;

  return (
    <VStack gap={2} width="100%" style={{ minWidth: "var(--spacing-0)" }}>
      <Markdown density="compact" contentWidth="100%">
        {request.answer}
      </Markdown>
      <HStack gap={2} wrap="wrap">
        <Token
          label="Open in Conversation"
          size="sm"
          color="blue"
          icon={<Link pack="basic" size="sm" />}
          href={conversationHref}
        />
      </HStack>
    </VStack>
  );
}
