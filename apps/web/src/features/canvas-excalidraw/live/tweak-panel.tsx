"use client";
import { useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Selector } from "@astryxdesign/core/Selector";
import type { Field, Inspection, Tweak } from "@meld/screen-runtime/edit/types";
import type { Computed } from "./live-messages";
import { ColourField } from "./colour-field";
import { useFieldText } from "./field-text";
import { displayFontName, displayValues, FAMILIES, WEIGHTS, type FieldView } from "./inspector-values";

export type TweakPanelProps = {
  label: string;
  fields: NonNullable<Inspection>;
  computed: Computed | null;
  used: readonly string[];
  onTweak: (tweak: Tweak) => void;
  onAdd: () => void;
  canAdd: boolean;
  addReason?: string;
  // The last change is being applied and the element read again: the fields stay (dimmed, same
  // DOM nodes, focus kept) but take no new change until the fresh values arrive.
  isPending?: boolean;
};

const CODE_OWNED = "Set by the screen's code. Change it in Code.";
// NumberInput is a native number box: it fires on every keystroke and can never show the typed text back,
// so number fields are text boxes with an explicit commit step (Enter or blur) and a visible unit in the label.
const NUMBER_LABEL = {
  fontSize: "Size (px)",
  width: "Width (px)",
  height: "Height (px)",
  padding: "Padding (px)",
  gap: "Gap (px)",
  borderRadius: "Corner radius (px)",
} as const;
type NumberField = keyof typeof NUMBER_LABEL;
// Digits only (an optional "px" is stripped first), so the "whole number" wording is true.
const WHOLE_NUMBER = /^\d+$/;

function LiteralField({
  field,
  label,
  view,
  isNumber,
  isPending,
  onTweak,
}: {
  field: Field;
  label: string;
  view: FieldView;
  isNumber: boolean;
  isPending: boolean;
  onTweak: (t: Tweak) => void;
}) {
  const { text: value, setText: setValue, submitted, setSubmitted } = useFieldText(view.value ?? "");
  const [error, setError] = useState(false);
  function commit(raw: string = value) {
    const next = isNumber ? raw.trim().replace(/px$/i, "").trim() : raw.trim();
    // While the last change is still being applied, typed text waits for the next Enter or blur.
    if (!view.editable || isPending || next === submitted) return;
    if (isNumber && !WHOLE_NUMBER.test(next)) {
      setError(true);
      return;
    }
    setSubmitted(next);
    setError(false);
    onTweak({ field, value: next });
  }
  return (
    <VStack gap={0.5}>
      <TextInput
        label={label}
        size="sm"
        value={value}
        onChange={(next) => {
          setValue(next);
          setError(false);
        }}
        isDisabled={!view.editable}
        status={error ? { type: "error", message: "Use a whole number, like 8." } : undefined}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (isNumber && view.editable && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
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
      {view.auto ? <Text type="supporting">auto</Text> : null}
    </VStack>
  );
}

export function TweakPanel(props: TweakPanelProps) {
  const { label, computed, used } = props;
  const isPending = props.isPending ?? false;
  const onTweak = (tweak: Tweak) => { if (!isPending) props.onTweak(tweak); };
  const view = displayValues(props.fields, computed);
  // Keyed by field only: a refresh updates the box in place (see useFieldText). A different
  // element remounts the whole panel, which resets typing state.
  const literal = (field: Field, name: string, isNumber: boolean) => (
    <LiteralField
      key={field}
      field={field}
      label={name}
      view={view[field]}
      isNumber={isNumber}
      isPending={isPending}
      onTweak={onTweak}
    />
  );
  const number = (field: NumberField) => literal(field, NUMBER_LABEL[field], true);
  const colour = (field: "color" | "backgroundColor", name: string) => (
    <VStack gap={0.5}>
      <Text type="supporting">{name}</Text>
      <ColourField
        label={name}
        value={view[field].value}
        used={used}
        isDisabled={!view[field].editable}
        onChange={(value) => onTweak({ field, value })}
      />
    </VStack>
  );
  const note = (...fields: Field[]) =>
    fields.some((field) => !view[field].hidden && !view[field].editable) ? <Text type="supporting">{CODE_OWNED}</Text> : null;
  const section = (title: string, children: React.ReactNode) => (
    <VStack gap={2}>
      <Divider />
      <Text type="supporting">{title}</Text>
      {children}
    </VStack>
  );

  return (
    <VStack gap={3} aria-busy={isPending || undefined} data-pending={isPending || undefined} style={isPending ? { opacity: 0.6 } : undefined}>
      <Text type="label">{label}</Text>
      {view.text.hidden ? null : section("Content", <>{literal("text", "Text", false)}{note("text")}</>)}
      {section(
        "Typography",
        <>
          <Selector
            label="Font"
            size="sm"
            options={FAMILIES.map(({ value, label: name }) => ({ value, label: name }))}
            value={view.fontFamily.value ?? undefined}
            isDisabled={!view.fontFamily.editable}
            onChange={(value) => onTweak({ field: "fontFamily", value })}
          />
          {computed ? <Text type="supporting">{`Showing: ${displayFontName(computed.fontFamily)}`}</Text> : null}
          <Grid columns={{ minWidth: 96, repeat: "fit" }} gap={2}>
            {number("fontSize")}
            <Selector
              label="Weight"
              size="sm"
              options={WEIGHTS.map(({ value, label: name }) => ({ value, label: name }))}
              value={view.fontWeight.value ?? undefined}
              isDisabled={!view.fontWeight.editable}
              onChange={(value) => onTweak({ field: "fontWeight", value })}
            />
          </Grid>
          {colour("color", "Text colour")}
          {note("fontFamily", "fontSize", "fontWeight", "color")}
        </>,
      )}
      {section(
        "Layout",
        <>
          <Grid columns={{ minWidth: 96, repeat: "fit" }} gap={2}>
            {number("width")}
            {number("height")}
          </Grid>
          <Grid columns={{ minWidth: 96, repeat: "fit" }} gap={2}>
            {number("padding")}
            {view.gap.hidden ? null : number("gap")}
          </Grid>
          {note("width", "height", "padding", "gap")}
        </>,
      )}
      {section(
        "Appearance",
        <>
          {colour("backgroundColor", "Background colour")}
          {number("borderRadius")}
          {note("backgroundColor", "borderRadius")}
        </>,
      )}
      <Divider />
      {props.canAdd ? (
        <Button label="Add to chat" onClick={props.onAdd} />
      ) : props.addReason ? (
        <Text type="supporting">{props.addReason}</Text>
      ) : null}
    </VStack>
  );
}
export default TweakPanel;
