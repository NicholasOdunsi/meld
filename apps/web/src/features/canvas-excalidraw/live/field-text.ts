"use client";
import { useState } from "react";

// A field's typed text, kept across refreshes. When the element's value changes (after a tweak, or
// Undo), the box follows it unless the user has typed something not yet applied. The field is never
// re-keyed by its value, so it keeps its DOM node, and its keyboard focus, through every refresh.
export function useFieldText(value: string) {
  const [text, setText] = useState(value);
  const [submitted, setSubmitted] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (text === submitted) setText(value);
    setSubmitted(value);
  }
  return { text, setText, submitted, setSubmitted };
}
