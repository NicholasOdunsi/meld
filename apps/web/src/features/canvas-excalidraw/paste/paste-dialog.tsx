"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { Theme } from "@astryxdesign/core/theme";
import type { FormFactor } from "@meld/prototype";
import type { CompileError, CompileResult } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { PasteInput } from "./create-pasted-screen";
import { detectScreenKind } from "./detect-kind";
import { pasteTheme } from "./paste-theme";
import { buildPastedSource, stylesheetNotice } from "./paste-source";

import "./paste-dialog.css";

// The name a screen has until AI renames it (or for good if AI can't).
export const DEFAULT_PASTE_NAME = "New screen";
export const FORM_FACTOR_CHOICES: readonly { value: FormFactor; label: "Phone" | "Tablet" | "Desktop" }[] = [
  { value: "mobile", label: "Phone" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
];
const FORM_FACTOR_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;

export function PasteDialog({ isOpen, onOpenChange, compile, onCreate, onNotice }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  onCreate: (input: PasteInput) => Promise<"created" | "error">;
  /** Told when the paste was changed to make it run, after the screen is created. */
  onNotice?: (message: string) => void;
}) {
  const [code, setCode] = useState("");
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
      // The screen starts as "New screen"; AI renames it a moment later.
      const created = await onCreate({ name: DEFAULT_PASTE_NAME, source: built.source, formFactor });
      if (created === "error") { setProblem("Could not save this screen. Try again."); return; }
      setCode("");
      onOpenChange(false);
      if (built.removedStylesheets) onNotice?.(stylesheetNotice(built.removedStylesheets));
    } catch {
      setProblem("Could not check this code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={460}>
      <DialogHeader title="Paste code" subtitle="React or plain HTML. Tailwind and Lucide icons are built in." hasDivider={false} />
      <Theme theme={pasteTheme}>
        <VStack className="orion-paste" gap={3} padding={4}>
          <SegmentedControl label="Device" layout="fill" value={formFactor} onChange={(value) => setFormFactor(value as FormFactor)}>
            {FORM_FACTOR_CHOICES.map((choice) => {
              const Icon = FORM_FACTOR_ICONS[choice.value];
              return <SegmentedControlItem key={choice.value} value={choice.value} label={choice.label} icon={<Icon size={16} />} />;
            })}
          </SegmentedControl>
          <TextArea
            label="Code"
            isLabelHidden
            value={code}
            rows={12}
            hasSpellCheck={false}
            placeholder="Paste a React component or an HTML page"
            status={problem ? { type: "error", message: problem } : undefined}
            onChange={(value) => { setCode(value); setProblem(null); setErrors([]); }}
          />
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
          <HStack className="orion-paste-actions" gap={2}>
            <Button label="Cancel" variant="secondary" size="lg" width="100%" onClick={() => onOpenChange(false)} />
            <Button label={busy ? "Checking…" : "Create"} variant="primary" size="lg" width="100%" isDisabled={busy} onClick={() => void submit()} />
          </HStack>
        </VStack>
      </Theme>
    </Dialog>
  );
}
