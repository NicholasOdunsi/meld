"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import styles from "./file-drop.module.css";
import { PixelArrowUp } from "@/ui/pixel-icons";

export type MeldFileDropProps = {
  label: string;
  /** Mirrors the native `accept` attribute. */
  accept?: string;
  name?: string;
  value: File | null;
  onValueChange: (file: File | null) => void;
  errorMessage?: string;
  /** Shown under the prompt when there's no file and no error. */
  hint?: string;
};

/**
 * Single-file dropzone.
 *
 * Wraps a real `<input type="file">` rather than reimplementing it: the input
 * stays in the DOM (visually hidden, not `display: none`) so it keeps its place
 * in the tab order and its native picker, while the zone provides the drop
 * target and the visuals.
 */
export function MeldFileDrop({
  label,
  accept,
  name,
  value,
  onValueChange,
  errorMessage,
  hint,
}: MeldFileDropProps) {
  const inputId = useId();
  const labelId = useId();
  const messageId = useId();
  const [isDragging, setIsDragging] = useState(false);

  // Derived in render rather than set from an effect: `value` is controlled, so
  // an effect would mean an extra render on every selection and would trip
  // react-hooks/set-state-in-effect. The effect below does nothing but clean
  // up -- object URLs leak until revoked, and a new one is minted per file.
  const previewUrl = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value],
  );

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    onValueChange(event.dataTransfer.files?.[0] ?? null);
  };

  const message = errorMessage ?? hint;

  return (
    <div className={styles.field}>
      {/* The zone is also a <label> so clicking it opens the picker, but the
          input is named from THIS element via aria-labelledby -- otherwise the
          accessible name concatenates both labels into
          "Workspace logo Drop your workspace logo here PNG, JPEG...". */}
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div
        className={[styles.frame, isDragging ? styles.dragging : null]
          .filter(Boolean)
          .join(" ")}
      >
        <label
          className={styles.zone}
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {previewUrl ? (
            // Not next/image: the source is a transient blob: URL, so there's
            // nothing for the optimiser to fetch or cache.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.preview} src={previewUrl} alt="" />
          ) : (
            <PixelArrowUp pack="filled" width={24} height={24} aria-hidden />
          )}
          {value ? value.name : `Drop your ${label.toLowerCase()} here`}
          {!value && hint ? <span className={styles.hint}>{hint}</span> : null}
          <input
            id={inputId}
            className={styles.input}
            type="file"
            name={name}
            accept={accept}
            aria-labelledby={labelId}
            onChange={handleChange}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={message ? messageId : undefined}
          />
        </label>
      </div>
      {errorMessage ? (
        <p id={messageId} className={`${styles.message} ${styles.error}`}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
