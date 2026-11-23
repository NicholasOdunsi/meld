"use client";

import { useId } from "react";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { Blend, CaseSensitive, Ellipsis, Equal, Minus, SquareRoundCorner } from "lucide-react";
import { useFieldText } from "../live/field-text";
import { ColourRow, FieldCell, FieldRow, Section, SelectField, TextField } from "../live/inspector-ui";
import { ICON_SIZE } from "../live/inspector-theme";
import { LIVE_PANEL_WIDTH, PanelCloseButton } from "../live/live-panel";
import { applicableControls, clamp, MAX_STROKE_WIDTH, MAX_TEXT_SIZE, MIN_STROKE_WIDTH, MIN_TEXT_SIZE, type ShapeStyle, type StrokeStyle } from "./shape-style";

const STYLES: readonly { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];
const CORNERS = [{ value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }];
const WHOLE_NUMBER = /^\d+$/;
const icon = (Glyph: typeof Minus) => <Glyph size={ICON_SIZE.field} aria-hidden />;

// Number fields are text boxes that commit on Enter or blur (a native number box fires on every keystroke).
// They are never re-keyed by value: the box follows the element's value in place (useFieldText), so
// arrow-key steps keep the same input and its focus. The unit is never part of the name (the % is drawn by the field).
function NumberField({ label, glyph, trailing, value, min, max, error, selectionKey, onCommit }: {
  label: string;
  glyph: typeof Minus;
  trailing?: string;
  value: number;
  min: number;
  max: number;
  error: string;
  selectionKey?: string;
  onCommit: (value: number) => void;
}) {
  const { text, setText, submitted, setSubmitted, invalid, setInvalid } = useFieldText(String(value), selectionKey);
  const errorId = useId();
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
    <FieldCell>
      <TextField
        ariaLabel={label}
        icon={icon(glyph)}
        trailing={trailing}
        inputMode="numeric"
        value={text}
        invalid={invalid}
        describedBy={invalid ? errorId : undefined}
        onChange={(next) => { setText(next); setInvalid(false); }}
        onCommit={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const shown = Number(text.trim().replace(/(px|%)$/i, "").trim());
            const base = Number.isFinite(shown) && text.trim() !== "" ? shown : value;
            commit(String(clamp(Math.round(base) + (event.key === "ArrowUp" ? 1 : -1), min, max)));
          }
        }}
      />
      {invalid ? <p id={errorId} role="alert" className="orion-i-error">{error}</p> : null}
    </FieldCell>
  );
}

export function ShapePanel({ selectionKey, style, kind, elementType = "rectangle", closed = false, onChange, onTextSize, textSize, onClose }: {
  // Identifies the selected shape: typed text and errors in the number boxes reset when it changes.
  selectionKey?: string;
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
  const strokeStyleGlyph = style.strokeStyle === "dotted" ? Ellipsis : Minus;
  return (
    <LayoutPanel width={LIVE_PANEL_WIDTH} padding={0} isScrollable={false} label={kind === "text" ? "Text" : "Shape"}>
      <VStack gap={0} className="orion-panel orion-i-scope" data-testid="shape-panel">
        {/* The header is just Close: no tabs and no title. */}
        <header className="orion-panel__top">
          <PanelCloseButton onClick={onClose} />
        </header>
        <VStack gap={0} className="orion-i-body">
          {kind === "text" ? (
            <Section title="Text">
              <FieldRow>
                <ColourRow ariaLabel="Colour" value={style.stroke} used={[]} canvasFilter onChange={(stroke) => onChange({ stroke })} />
              </FieldRow>
              {textSize !== undefined ? (
                <FieldRow>
                  <NumberField selectionKey={selectionKey} label="Size" glyph={CaseSensitive} value={textSize} min={MIN_TEXT_SIZE} max={MAX_TEXT_SIZE}
                    error="Use a whole number, like 20." onCommit={(px) => onTextSize?.(px)} />
                </FieldRow>
              ) : null}
            </Section>
          ) : (
            <>
              {controls.fill ? (
                <Section title="Fill">
                  <FieldRow>
                    <ColourRow ariaLabel="Fill" value={style.fill} used={[]} canvasFilter onChange={(fill) => onChange({ fill })} onClear={() => onChange({ fill: null })} />
                  </FieldRow>
                </Section>
              ) : null}
              {controls.stroke || controls.thickness || controls.style ? (
                <Section title="Stroke">
                  {controls.stroke ? (
                    <FieldRow>
                      <ColourRow ariaLabel="Stroke" value={style.stroke} used={[]} canvasFilter onChange={(stroke) => onChange({ stroke })} />
                    </FieldRow>
                  ) : null}
                  {controls.thickness || controls.style ? (
                    <FieldRow>
                      {controls.thickness ? (
                        <NumberField selectionKey={selectionKey} label="Thickness" glyph={Equal} value={style.strokeWidth} min={MIN_STROKE_WIDTH} max={MAX_STROKE_WIDTH}
                          error="Use a whole number, like 2." onCommit={(strokeWidth) => onChange({ strokeWidth })} />
                      ) : null}
                      {controls.style ? (
                        <SelectField ariaLabel="Style" icon={icon(strokeStyleGlyph)} options={STYLES} value={style.strokeStyle}
                          onChange={(value) => onChange({ strokeStyle: value as StrokeStyle })} />
                      ) : null}
                    </FieldRow>
                  ) : null}
                </Section>
              ) : null}
              {controls.corners ? (
                <Section title="Corners">
                  <FieldRow>
                    <SelectField ariaLabel="Corners" icon={icon(SquareRoundCorner)} options={CORNERS} value={style.rounded ? "rounded" : "square"}
                      onChange={(value) => onChange({ rounded: value === "rounded" })} />
                  </FieldRow>
                </Section>
              ) : null}
              {controls.opacity ? (
                <Section title="Appearance">
                  <FieldRow>
                    <NumberField selectionKey={selectionKey} label="Opacity" glyph={Blend} trailing="%" value={style.opacity} min={0} max={100}
                      error="Use a whole number from 0 to 100, like 80." onCommit={(opacity) => onChange({ opacity })} />
                  </FieldRow>
                </Section>
              ) : null}
            </>
          )}
        </VStack>
      </VStack>
    </LayoutPanel>
  );
}
export default ShapePanel;
