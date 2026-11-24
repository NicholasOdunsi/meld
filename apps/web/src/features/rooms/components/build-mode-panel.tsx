"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { StreamBuild } from "@/features/native/bridge";

const LABEL = { working: "Building", needs_you: "Needs approval", done: "Build complete", failed: "Build failed", cancelled: "Build cancelled" };
const VARIANT = { working: "accent", needs_you: "warning", done: "success", failed: "error", cancelled: "neutral" } as const;

export function BuildModeChoice({
  stage, linked, busy, onBuild, onAnswer, onLink,
}: {
  stage: "unsure" | "link";
  linked: boolean;
  busy: boolean;
  onBuild(): void;
  onAnswer(): void;
  onLink(repository: string, create: boolean): void;
}) {
  const [repository, setRepository] = useState("");
  return (
    <VStack gap={1} paddingBlock={2}>
      {stage === "link" && !linked ? (
        <>
          <Text type="label">Link project code</Text>
          <Text type="supporting">To link a folder, open this project on your Mac.</Text>
          <TextInput label="GitHub repository" placeholder="owner/repository or new repo name" value={repository} onChange={setRepository} />
        </>
      ) : <Text type="label">{stage === "unsure" ? "Build this?" : "Code linked"}</Text>}
      <HStack gap={1} wrap="wrap">
        {stage === "link" && !linked ? (
          <>
            <Button label="Link GitHub repo" size="sm" isDisabled={busy || !repository.trim()} onClick={() => onLink(repository.trim(), false)} />
            <Button label="Create private repo" size="sm" isDisabled={busy || !repository.trim()} onClick={() => onLink(repository.trim(), true)} />
          </>
        ) : <Button label="Build" size="sm" variant="primary" isDisabled={busy} onClick={onBuild} />}
        <Button label="Answer instead" size="sm" variant="ghost" isDisabled={busy} onClick={onAnswer} />
      </HStack>
    </VStack>
  );
}

export function BuildModeSummary({ build, sendApproval }: {
  build: StreamBuild;
  sendApproval(requestId: string, decision: "accept" | "decline"): Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string>();
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const request = build.approval;
  const answer = async (decision: "accept" | "decline") => {
    if (!request || sending) return;
    setSending(true);
    setError(false);
    try {
      await sendApproval(request.id, decision);
      setSent(request.id);
    } catch { setError(true); }
    finally { setSending(false); }
  };
  return (
    <VStack gap={1} paddingBlock={1}>
      <HStack gap={1} hAlign="between" vAlign="center">
        <HStack gap={1} vAlign="center">
          <StatusDot label={LABEL[build.status]} variant={VARIANT[build.status]} />
          <Text type="label">{LABEL[build.status]}</Text>
          {build.branch ? <Text type="code" maxLines={1}>{build.branch}</Text> : null}
        </HStack>
        {build.reply || build.changedFiles.length ? <Button label={expanded ? "Hide details" : "Show details"} size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} /> : null}
      </HStack>
      {build.offline ? <Text type="supporting">The linked Mac is offline. Showing the last saved build status.</Text> : null}
      {build.step ? <Text type="supporting">{build.step}</Text> : null}
      {request ? (
        <>
          <Text type="body">{request.summary}</Text>
          <HStack gap={1}>
            <Button label="Approve" size="sm" isDisabled={sending || sent === request.id || build.offline} onClick={() => void answer("accept")} />
            <Button label="Decline" size="sm" variant="ghost" isDisabled={sending || sent === request.id || build.offline} onClick={() => void answer("decline")} />
          </HStack>
          {error ? <Text role="alert" type="supporting">Could not send that approval. Try again.</Text> : null}
        </>
      ) : null}
      {expanded ? (
        <VStack gap={1}>
          {build.reply ? <Text type="body">{build.reply}</Text> : null}
          {build.changedFiles.map((file) => (
            <HStack key={file.path} hAlign="between" gap={1}>
              <Text type="code" maxLines={1}>{file.path}</Text>
              <Text type="supporting" hasTabularNumbers>+{file.added} −{file.removed}</Text>
            </HStack>
          ))}
        </VStack>
      ) : null}
    </VStack>
  );
}
