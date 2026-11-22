"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { ColourField } from "../live/colour-field";
import { useFieldText } from "../live/field-text";
import { LIVE_PANEL_WIDTH } from "../live/live-panel";
import { applicableControls, clamp, MAX_STROKE_WIDTH, MAX_TEXT_SIZE, MIN_STROKE_WIDTH, MIN_TEXT_SIZE, type ShapeStyle, type StrokeStyle } from "./shape-style";

const STYLES: readonly { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];
const CORNERS = [{ value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }];
const WHOLE_NUMBER = /^\d+$/;

// Number fields are text boxes that commit on Enter or blur (a native number box fires on every keystroke).
// They are never re-keyed by value: the box follows the element's value in place (useFieldText), so
// arrow-key steps keep the same input and its focus.
function NumberField({ label, value, min, max, error, onCommit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  error: string;
  onCommit: (value: number) => void;
}) {
  const { text, setText, submitted, setSubmitted } = useFieldText(String(value));
  const [invalid, setInvalid] = useState(false);
  function commit(raw: string = text) {
    const typed = raw.trim().replace(/(px|%)$/i, "").trim();
    if (!WHOLE_NUMBER.test(typed)) {
      setInvalid(true);
      return;
    }
    const next = clamp(Number(typed), min, max);
    setInvalid(false);
    setText(String(next));
    // Enter then blur must not apply the same value twice before the element has caught up.
    if (String(next) === submitted) return;
    setSubmitted(String(next));
    onCommit(next);
  }
  return (
    <TextInput
      label={label}
      size="sm"
      value={text}
      onChange={(next) => { setText(next); setInvalid(false); }}
      onBlur={() => commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const shown = Number(text.trim().replace(/(px|%)$/i, "").trim());
          const base = Number.isFinite(shown) && text.trim() !== "" ? shown : value;
          commit(String(clamp(Math.round(base) + (event.key === "ArrowUp" ? 1 : -1), min, max)));
        }
      }}
      status={invalid ? { type: "error", message: error } : undefined}
    />
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{label}</Text>
      {children}
    </VStack>
  );
}

export function ShapePanel({ style, kind, elementType = "rectangle", closed = false, onChange, onTextSize, textSize, onClose }: {
  style: ShapeStyle;
  kind: "shape" | "text";
  // The Excalidraw type of the element the panel reads; decides which controls show.
  elementType?: string;
  // A closed line (a triangle) can be filled.
  closed?: boolean;
  onChange: (change: Partial<ShapeStyle>) => void;
  onTextSize?: (px: number) => void;
  textSize?: number;
  onClose: () => void;
}) {
  const controls = applicableControls(kind === "text" ? "text" : elementType, closed);
  return (
    <LayoutPanel width={LIVE_PANEL_WIDTH} hasDivider padding={3} label={kind === "text" ? "Text" : "Shape"}>
      <VStack gap={3} data-testid="shape-panel">
        <HStack gap={2} align="center" justify="between">
          <Text type="label">{kind === "text" ? "Text" : "Shape"}</Text>
          <Button label="Close" size="sm" variant="ghost" onClick={onClose} />
        </HStack>
        {kind === "text" ? (
          <>
            <Labelled label="Colour">
              <ColourField label="Colour" value={style.stroke} used={[]} canvasFilter onChange={(stroke) => onChange({ stroke })} />
            </Labelled>
            {textSize !== undefined ? (
              <NumberField label="Size (px)" value={textSize} min={MIN_TEXT_SIZE} max={MAX_TEXT_SIZE}
                error="Use a whole number, like 20." onCommit={(px) => onTextSize?.(px)} />
            ) : null}
          </>
        ) : (
          <>
            {controls.fill ? (
              <Labelled label="Fill">
                <ColourField label="Fill" value={style.fill} used={[]} canvasFilter onChange={(fill) => onChange({ fill })} onClear={() => onChange({ fill: null })} />
              </Labelled>
            ) : null}
            {controls.stroke ? (
              <Labelled label="Stroke">
                <ColourField label="Stroke" value={style.stroke} used={[]} canvasFilter onChange={(stroke) => onChange({ stroke })} />
              </Labelled>
            ) : null}
            <Grid columns={{ minWidth: 96, repeat: "fit" }} gap={2}>
              {controls.thickness ? (
                <NumberField label="Thickness (px)" value={style.strokeWidth} min={MIN_STROKE_WIDTH} max={MAX_STROKE_WIDTH}
                  error="Use a whole number, like 2." onCommit={(strokeWidth) => onChange({ strokeWidth })} />
              ) : null}
              {controls.opacity ? (
                <NumberField label="Opacity (%)" value={style.opacity} min={0} max={100}
                  error="Use a whole number from 0 to 100, like 80." onCommit={(opacity) => onChange({ opacity })} />
              ) : null}
            </Grid>
            {controls.style ? (
              <Selector label="Style" size="sm" options={STYLES.map(({ value, label }) => ({ value, label }))} value={style.strokeStyle}
                onChange={(value) => onChange({ strokeStyle: value as StrokeStyle })} />
            ) : null}
            {controls.corners ? (
              <Selector label="Corners" size="sm" options={CORNERS} value={style.rounded ? "rounded" : "square"}
                onChange={(value) => onChange({ rounded: value === "rounded" })} />
            ) : null}
          </>
        )}
      </VStack>
    </LayoutPanel>
  );
}
export default ShapePanel;
