"use client";

import { useState, type FormEvent } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { InspectorPanelShell } from "../live/live-panel";
import { rgbToHex } from "../live/inspector-values";
import { TweakPanel } from "../live/tweak-panel";
import type { PreviewRequest, PreviewSelection } from "./preview-edit-store";

export function PreviewEditPanel({ selection, onRequest }: {
  selection: PreviewSelection;
  onRequest: (request: PreviewRequest) => void;
}) {
  const [draft, setDraft] = useState("");
  const disabled = selection.locked !== null || selection.pending;
  const reason = selection.locked ?? selection.reason;
  const used = [selection.computed.color, selection.computed.backgroundColor]
    .map(rgbToHex)
    .filter((color) => color !== null);

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (disabled || !text) return;
    onRequest({ kind: "describe", text });
    setDraft("");
  }

  return (
    <InspectorPanelShell label="Edit preview" header={<Text type="label">Edit preview</Text>} onClose={() => onRequest({ kind: "close" })}>
      <VStack gap={3}>
        {reason ? <Banner status="info" title={reason} container="section" /> : null}
        {selection.fields && !selection.locked ? (
          <TweakPanel
            selectionKey={selection.selectionId}
            fields={selection.fields}
            computed={selection.computed}
            used={used}
            isPending={selection.pending}
            codeOwnedMessage="This value comes from code. Describe the change below."
            onTweak={(tweak) => onRequest({ ...tweak, kind: "tweak" })}
          />
        ) : null}
        <HStack gap={2}>
          <Button label="Undo" size="sm" isDisabled={disabled || !selection.canUndo} onClick={() => onRequest({ kind: "undo" })} />
          <Button label="Redo" size="sm" isDisabled={disabled || !selection.canRedo} onClick={() => onRequest({ kind: "redo" })} />
        </HStack>
        <form onSubmit={send}>
          <VStack gap={2}>
            <TextInput label="Tell Orion what to change" size="sm" value={draft} onChange={(value) => setDraft(value.slice(0, 8_000))} isDisabled={disabled} />
            <HStack hAlign="end">
              <Button label="Send" size="sm" type="submit" variant="primary" isDisabled={disabled || draft.trim() === ""} />
            </HStack>
          </VStack>
        </form>
      </VStack>
    </InspectorPanelShell>
  );
}
