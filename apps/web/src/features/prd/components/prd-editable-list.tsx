"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ChevronDown } from "@boxicons/react/ChevronDown";
import { ChevronUp } from "@boxicons/react/ChevronUp";
import { Plus } from "@boxicons/react/Plus";
import { X } from "@boxicons/react/X";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { DocTextArea } from "./prd-doc-inputs";

type PendingFocus = { index: number; caret: "start" | "end" } | null;

// A bullet list that behaves like a word processor's: Enter splits off a new
// row after the caret, Backspace at the start of a row merges it away and
// moves focus to the end of the previous row. The explicit add/move/remove
// buttons stay for keyboard/screen-reader users who don't want to rely on
// those key bindings.
export function EditableStringList({
  sectionLabel,
  rows,
  onChange,
  isDisabled = false,
  autoFocusFirstRow = false,
}: {
  sectionLabel: string;
  rows: string[];
  onChange: (rows: string[]) => void;
  isDisabled?: boolean;
  autoFocusFirstRow?: boolean;
}) {
  const rowRefs = useRef(new Map<number, HTMLTextAreaElement>());
  const pendingFocus = useRef<PendingFocus>(null);

  // Runs after every render; a no-op unless a key handler below queued a
  // target row/caret to focus (rows shift on insert/remove, so plain
  // `autoFocus` on mount can't reach the row that survives an update).
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const el = rowRefs.current.get(target.index);
    if (!el) return;
    el.focus();
    const pos = target.caret === "start" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
  });

  function updateRow(index: number, value: string) {
    onChange(rows.map((row, i) => (i === index ? value : row)));
  }

  function addRow() {
    onChange([...rows, ""]);
    pendingFocus.current = { index: rows.length, caret: "start" };
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function moveRow(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rows.length) return;
    const next = [...rows];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  function handleKeyDown(index: number) {
    return (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (isDisabled) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const next = [...rows];
        next.splice(index + 1, 0, "");
        onChange(next);
        pendingFocus.current = { index: index + 1, caret: "start" };
        return;
      }
      if (
        e.key === "Backspace" &&
        rows.length > 1 &&
        e.currentTarget.selectionStart === 0 &&
        e.currentTarget.selectionEnd === 0
      ) {
        e.preventDefault();
        const next = rows.filter((_, i) => i !== index);
        onChange(next);
        pendingFocus.current =
          index > 0 ? { index: index - 1, caret: "end" } : { index: 0, caret: "start" };
      }
    };
  }

  return (
    <VStack gap={1} width="100%">
      {rows.map((row, index) => (
        <HStack key={index} gap={2} vAlign="start" width="100%">
          <Text color="secondary" style={{ lineHeight: "var(--text-body-leading)" }}>
            {"•"}
          </Text>
          <VStack width="100%" style={{ flex: 1 }}>
            <DocTextArea
              ariaLabel={`${sectionLabel} row ${index + 1}`}
              value={row}
              onChange={(value) => updateRow(index, value)}
              onKeyDown={handleKeyDown(index)}
              isDisabled={isDisabled}
              hasAutoFocus={autoFocusFirstRow && index === 0}
              ref={(el) => {
                if (el) rowRefs.current.set(index, el);
                else rowRefs.current.delete(index);
              }}
            />
          </VStack>
          <HStack gap={0} style={{ opacity: 0.5 }}>
            <Button
              label={`Move ${sectionLabel} row ${index + 1} up`}
              icon={<ChevronUp pack="basic" size="sm" />}
              variant="ghost"
              size="sm"
              isIconOnly
              isDisabled={isDisabled || index === 0}
              onClick={() => moveRow(index, -1)}
            />
            <Button
              label={`Move ${sectionLabel} row ${index + 1} down`}
              icon={<ChevronDown pack="basic" size="sm" />}
              variant="ghost"
              size="sm"
              isIconOnly
              isDisabled={isDisabled || index === rows.length - 1}
              onClick={() => moveRow(index, 1)}
            />
            <Button
              label={`Remove ${sectionLabel} row ${index + 1}`}
              icon={<X pack="basic" size="sm" />}
              variant="ghost"
              size="sm"
              isIconOnly
              isDisabled={isDisabled}
              onClick={() => removeRow(index)}
            />
          </HStack>
        </HStack>
      ))}
      <Button
        label={`Add ${sectionLabel} row`}
        icon={<Plus pack="basic" size="sm" />}
        variant="ghost"
        size="sm"
        isDisabled={isDisabled}
        onClick={addRow}
      />
    </VStack>
  );
}
