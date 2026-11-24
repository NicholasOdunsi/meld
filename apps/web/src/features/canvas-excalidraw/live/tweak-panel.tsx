"use client";
import { useId, type ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { ALargeSmall, Bold, CaseSensitive, MoveHorizontal, SquareDashed, SquareRoundCorner, Type } from "lucide-react";
import type { Field, Inspection, Tweak } from "@meld/screen-runtime/edit/types";
import type { Computed } from "./live-messages";
import { useFieldText } from "./field-text";
import { AutoIcon, ColourRow, FieldCell, FieldRow, Section, SelectField, TextField } from "./inspector-ui";
import { ICON_SIZE } from "./inspector-theme";
import { displayFontName, displayValues, FAMILIES, WEIGHTS, type FieldView } from "./inspector-values";

export type TweakPanelProps = {
  fields: NonNullable<Inspection>;
  computed: Computed | null;
  used: readonly string[];
  onTweak: (tweak: Tweak) => void;
  // The last change is being applied and the element read again: the fields stay (dimmed, same
  // DOM nodes, focus kept) but take no new change until the fresh values arrive.
  isPending?: boolean;
  // Identifies the picked element. Typed text and errors reset when it changes; a refresh of the
  // same element keeps the same key, so the boxes (and focus) survive it.
  selectionKey?: string;
};

const CODE_OWNED = "Set by the screen's code. Change it in Code.";
// Number fields are text boxes with an explicit commit step (Enter, blur or an arrow): a native number box
// fires on every keystroke and can never show the typed text back. The unit is never shown; names come from aria-label.
const NUMBER_LABEL = {
  fontSize: "Size",
  width: "Width",
  height: "Height",
  padding: "Padding",
  gap: "Gap",
  borderRadius: "Corner radius",
} as const;
type NumberField = keyof typeof NUMBER_LABEL;
// Digits only (an optional "px" is stripped first), so the "whole number" wording is true.
const WHOLE_NUMBER = /^\d+$/;
// Text as a reader sees it: HTML whitespace runs are one space, none at the edges. A no-break
// space is text, so it is kept (a JS trim() would drop it and turn an untouched blur into an edit).
function visibleText(text: string): string {
  return text.replace(/[ \t\n\r\f]+/g, " ").replace(/^ | $/g, "");
}

function LiteralField({
  field,
  index,
  label,
  icon,
  letter,
  view,
  isNumber,
  isPending,
  selectionKey,
  onTweak,
}: {
  field: Field;
  index?: number;
  label: string;
  icon?: ReactNode;
  letter?: string;
  view: FieldView;
  isNumber: boolean;
  isPending: boolean;
  selectionKey?: string;
  onTweak: (t: Tweak) => void;
}) {
  const { text: value, setText: setValue, submitted, setSubmitted, invalid: error, setInvalid: setError } = useFieldText(view.value ?? "", selectionKey);
  const errorId = useId();
  function commit(raw: string = value) {
    const next = isNumber ? raw.trim().replace(/px$/i, "").trim() : visibleText(raw);
    // While the last change is still being applied, typed text waits for the next Enter or blur.
    if (!view.editable || isPending) return;
    // Nothing new (an untouched box, even an empty one): not an error, and nothing to apply.
    // The box shows what was applied ("9px" becomes "9"), so it follows later value changes.
    // Text compares as it reads, so a multi-line source value is not rewritten by a focus and blur.
    if (next === (isNumber ? submitted : visibleText(submitted))) {
      setValue(next);
      setError(false);
      return;
    }
    if (isNumber && !WHOLE_NUMBER.test(next)) {
      setError(true);
      return;
    }
    setValue(next);
    setSubmitted(next);
    setError(false);
    onTweak({ field, value: next, ...(index === undefined ? {} : { index }) });
  }
  return (
    <FieldCell>
      <TextField
        ariaLabel={label}
        icon={icon}
        label={letter}
        inputMode={isNumber ? "numeric" : undefined}
        value={value}
        onChange={(next) => {
          setValue(next);
          setError(false);
        }}
        disabled={!view.editable}
        invalid={error}
        describedBy={error ? errorId : undefined}
        trailing={view.auto ? <AutoIcon /> : undefined}
        onCommit={() => commit()}
        onKeyDown={(event) => {
          if (isNumber && view.editable && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            // A step is a deliberate commit: parse what is shown, move by 1 (never below 0), apply at once.
            event.preventDefault();
            if (isPending) return;
            const shown = Number(value.trim().replace(/px$/i, "").trim() || view.value || 0);
            const base = Number.isFinite(shown) ? Math.round(shown) : 0;
            const next = String(Math.max(0, base + (event.key === "ArrowUp" ? 1 : -1)));
            setValue(next);
            setError(false);
            commit(next);
          }
        }}
      />
      {error ? <p id={errorId} role="alert" className="orion-i-error">Use a whole number, like 8.</p> : null}
    </FieldCell>
  );
}

export function TweakPanel(props: TweakPanelProps) {
  const { computed, used } = props;
  const isPending = props.isPending ?? false;
  const onTweak = (tweak: Tweak) => { if (!isPending) props.onTweak(tweak); };
  const view = displayValues(props.fields, computed);
  const icon = (Glyph: typeof Type) => <Glyph size={ICON_SIZE.field} aria-hidden />;
  // Keyed by field only: a refresh updates the box in place (see useFieldText), and another
  // element (a different selectionKey) resets the typed text without remounting.
  const literal = (field: Field, name: string, isNumber: boolean, look: { icon?: ReactNode; letter?: string }) => (
    <LiteralField
      key={field}
      field={field}
      label={name}
      icon={look.icon}
      letter={look.letter}
      view={view[field]}
      isNumber={isNumber}
      isPending={isPending}
      selectionKey={props.selectionKey}
      onTweak={onTweak}
    />
  );
  const number = (field: NumberField, look: { icon?: ReactNode; letter?: string }) => literal(field, NUMBER_LABEL[field], true, look);
  const colour = (field: "color" | "backgroundColor", name: string) => (
    <FieldRow>
      <ColourRow
        ariaLabel={name}
        value={view[field].value}
        used={used}
        disabled={!view[field].editable}
        onChange={(value) => onTweak({ field, value })}
      />
    </FieldRow>
  );
  const note = (...fields: Field[]) =>
    fields.some((field) => !view[field].hidden && !view[field].editable) ? <p className="orion-i-note">{CODE_OWNED}</p> : null;

  return (
    <VStack gap={0} className="orion-i-body orion-i-scope" aria-busy={isPending || undefined} data-pending={isPending || undefined}>
      {view.text.hidden ? null : (
        <Section title="Content">
          {(props.fields.text.runs ?? [view.text.value]).map((value, index) => (
            <FieldRow key={`text:${index}`}>
              <LiteralField
                field="text"
                index={props.fields.text.runs ? index : undefined}
                label={index === 0 ? "Text" : `Text ${index + 1}`}
                icon={icon(Type)}
                view={{ ...view.text, value }}
                isNumber={false}
                isPending={isPending}
                selectionKey={props.selectionKey}
                onTweak={onTweak}
              />
            </FieldRow>
          ))}
          {note("text")}
        </Section>
      )}
      <Section title="Typography">
        <FieldRow>
          <SelectField
            ariaLabel="Font"
            icon={icon(CaseSensitive)}
            options={FAMILIES}
            value={view.fontFamily.value}
            disabled={!view.fontFamily.editable}
            trailingText={computed ? displayFontName(computed.fontFamily) : undefined}
            onChange={(value) => onTweak({ field: "fontFamily", value })}
          />
        </FieldRow>
        <FieldRow>
          {number("fontSize", { icon: icon(ALargeSmall) })}
          <SelectField
            ariaLabel="Weight"
            icon={icon(Bold)}
            options={WEIGHTS}
            value={view.fontWeight.value}
            disabled={!view.fontWeight.editable}
            onChange={(value) => onTweak({ field: "fontWeight", value })}
          />
        </FieldRow>
        {colour("color", "Text colour")}
        {note("fontFamily", "fontSize", "fontWeight", "color")}
      </Section>
      <Section title="Layout">
        <FieldRow>
          {number("width", { letter: "W" })}
          {number("height", { letter: "H" })}
        </FieldRow>
        <FieldRow>
          {number("padding", { icon: icon(SquareDashed) })}
          {view.gap.hidden ? null : number("gap", { icon: icon(MoveHorizontal) })}
        </FieldRow>
        {note("width", "height", "padding", "gap")}
      </Section>
      <Section title="Appearance">
        {colour("backgroundColor", "Background colour")}
        <FieldRow>{number("borderRadius", { icon: icon(SquareRoundCorner) })}</FieldRow>
        {note("backgroundColor", "borderRadius")}
      </Section>
    </VStack>
  );
}
export default TweakPanel;
