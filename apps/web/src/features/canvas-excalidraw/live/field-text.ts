"use client";
import { useState } from "react";

// A field's typed text and its invalid flag, kept across refreshes. When the element's value changes
// to something this box did not just apply (Undo, another edit), the box follows it and drops any
// stale error. Text typed after a commit survives that commit's own value arriving, and unapplied
// text survives a refresh that leaves the value alone. A different `selectionKey` (another element)
// starts the box over. The field is never re-keyed by its value, so it keeps its DOM node, and its
// keyboard focus, through every refresh.
export function useFieldText(value: string, selectionKey?: string) {
  const [text, setText] = useState(value);
  const [submitted, setSubmitted] = useState(value);
  const [seen, setSeen] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [key, setKey] = useState(selectionKey);
  if (key !== selectionKey) {
    setKey(selectionKey);
    setSeen(value);
    setSubmitted(value);
    setText(value);
    setInvalid(false);
  } else if (seen !== value) {
    setSeen(value);
    if (value !== submitted) {
      setText(value);
      setInvalid(false);
    }
    setSubmitted(value);
  }
  return { text, setText, submitted, setSubmitted, invalid, setInvalid };
}
