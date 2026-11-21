"use client";

import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { FormFactor } from "@meld/prototype";
import type { CompileError, CompileResult } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { PasteInput } from "./create-pasted-screen";
import { detectScreenKind } from "./detect-kind";
import { buildPastedSource, stylesheetNotice } from "./paste-source";

export const DEFAULT_PASTE_NAME = "Pasted screen";
export const FORM_FACTOR_CHOICES: readonly { value: FormFactor; label: "Phone" | "Tablet" | "Desktop" }[] = [
  { value: "mobile", label: "Phone" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
];

export function PasteDialog({ isOpen, onOpenChange, compile, onCreate, onNotice }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  onCreate: (input: PasteInput) => Promise<"created" | "error">;
  /** Told when the paste was changed to make it run, after the screen is created. */
  onNotice?: (message: string) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(DEFAULT_PASTE_NAME);
  const [formFactor, setFormFactor] = useState<FormFactor>("mobile");
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<CompileError[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setProblem(null);
    setErrors([]);
    const detected = detectScreenKind(code);
    if (!detected.ok) { setProblem(detected.message); return; }
    const built = buildPastedSource(code, detected.kind);
    if (!built.ok) { setProblem(built.message); return; }
    setBusy(true);
    try {
      // Unsupported packages and other errors are named before anything is created.
      const result = await compile(built.source);
      if (!result.ok) { setErrors(result.errors); return; }
      const created = await onCreate({ name: name.trim() || DEFAULT_PASTE_NAME, source: built.source, formFactor });
      if (created === "error") { setProblem("Could not save this screen. Try again."); return; }
      setCode("");
      setName(DEFAULT_PASTE_NAME);
      onOpenChange(false);
      if (built.removedStylesheets) onNotice?.(stylesheetNotice(built.removedStylesheets));
    } catch {
      setProblem("Could not check this code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={640}>
      <DialogHeader title="Paste code" subtitle="React (Tailwind and Lucide icons built in) or plain HTML" onOpenChange={onOpenChange} />
      <VStack gap={3} padding={4}>
        <TextArea
          label="Code"
          value={code}
          rows={14}
          hasSpellCheck={false}
          placeholder="Paste a React component or an HTML page"
          status={problem ? { type: "error", message: problem } : undefined}
          onChange={(value) => { setCode(value); setProblem(null); setErrors([]); }}
        />
        <TextInput label="Name" value={name} onChange={setName} />
        <SegmentedControl label="Device" value={formFactor} onChange={(value) => setFormFactor(value as FormFactor)}>
          {FORM_FACTOR_CHOICES.map((choice) => <SegmentedControlItem key={choice.value} value={choice.value} label={choice.label} />)}
        </SegmentedControl>
        {errors.length ? (
          <VStack gap={1}>
            <Banner status="error" title={errors.length === 1 ? "This code can't run yet" : `This code can't run yet (${errors.length} problems)`} />
            <List density="compact">
              {errors.map((error, index) => (
                <ListItem key={`${index}-${error.message}`} label={error.message} description={error.file || undefined} />
              ))}
            </List>
          </VStack>
        ) : null}
        <HStack gap={2} justify="end">
          <Button label="Cancel" variant="ghost" onClick={() => onOpenChange(false)} />
          <Button label={busy ? "Checking…" : "Create screen"} variant="primary" isDisabled={busy} onClick={() => void submit()} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
