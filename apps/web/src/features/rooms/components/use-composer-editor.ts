"use client";

import type { ChatComposerInputHandle } from "@astryxdesign/core/Chat";
import { useCallback, useEffect, useRef } from "react";
import {
  applyMarkdownFormat,
  type MarkdownFormat,
} from "./composer-model";
import {
  normalizeCaretIntoTextNode,
  readEditorSelection,
  replaceEditorSelection,
  restoreEditorSelection,
  type SerializedSelection,
} from "./editor-selection";

// Owns the contenteditable: the DOM handles, caret bookkeeping across
// re-renders, markdown formatting, and the draft revision counter that lets
// a failed send restore text the user has not since retyped.
export function useComposerEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputHandleRef = useRef<ChatComposerInputHandle>(null);
  const pendingSelectionRef = useRef<SerializedSelection | null>(null);
  const currentDraftRef = useRef(value);
  const draftRevisionRef = useRef(0);

  const getEditor = useCallback(
    () =>
      editorRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      ) ?? null,
    [],
  );

  useEffect(() => {
    currentDraftRef.current = value;
  }, [value]);

  // A format action rewrites the DOM, so the caret has to be put back once
  // the new value has rendered.
  useEffect(() => {
    if (!pendingSelectionRef.current) {
      return;
    }
    restoreEditorSelection(
      getEditor(),
      pendingSelectionRef.current,
    );
    pendingSelectionRef.current = null;
  }, [getEditor, value]);

  const handleChange = useCallback(
    (nextValue: string) => {
      currentDraftRef.current = nextValue;
      draftRevisionRef.current += 1;
      onChange(nextValue);
    },
    [onChange],
  );

  const rememberSelection = useCallback(() => {
    pendingSelectionRef.current = readEditorSelection(
      getEditor(),
      value.length,
    );
  }, [getEditor, value.length]);

  const formatMessage = useCallback(
    (format: MarkdownFormat) => {
      const editor = getEditor();
      if (!editor) {
        return;
      }
      const selection =
        pendingSelectionRef.current ??
        readEditorSelection(editor, value.length);
      const selectedValue = value.slice(
        selection.start,
        selection.end,
      );
      const formatted = applyMarkdownFormat(
        selectedValue,
        0,
        selectedValue.length,
        format,
      );
      pendingSelectionRef.current = null;
      replaceEditorSelection(
        editor,
        selection,
        formatted.value,
        {
          start: formatted.selectionStart,
          end: formatted.selectionEnd,
        },
      );
    },
    [getEditor, value],
  );

  const insertText = useCallback(
    (text: string) => {
      inputHandleRef.current?.focus();
      inputHandleRef.current?.insertText(text);
      const editor = getEditor();
      normalizeCaretIntoTextNode(editor);
      editor?.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [getEditor],
  );

  const beginDraftSubmission = useCallback(
    () => draftRevisionRef.current,
    [],
  );

  // Restores a failed send's text, but only if the composer is still empty
  // and the only change since was the clear that the send itself caused --
  // otherwise it would clobber what the user has started typing.
  const restoreDraftIfUnedited = useCallback(
    (submittedRevision: number, body: string) => {
      if (
        currentDraftRef.current === "" &&
        draftRevisionRef.current === submittedRevision + 1
      ) {
        handleChange(body);
      }
    },
    [handleChange],
  );

  return {
    editorRef,
    inputHandleRef,
    getEditor,
    handleChange,
    rememberSelection,
    formatMessage,
    insertText,
    beginDraftSubmission,
    restoreDraftIfUnedited,
  };
}
