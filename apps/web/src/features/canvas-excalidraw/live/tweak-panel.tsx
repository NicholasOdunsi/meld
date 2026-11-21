"use client";
import { useRef, useState } from "react";
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
import { displayValues, firstFontName, FAMILIES, WEIGHTS, type FieldView } from "./inspector-values";

export type TweakPanelProps = {
  label: string;
  fields: NonNullable<Inspection>;
  computed: Computed | null;
  used: readonly string[];
  onTweak: (tweak: Tweak) => void;
  onAdd: () => void;
  canAdd: boolean;
  addReason?: string;
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
const WHOLE_NUMBER = /^\d+(?:\.\d+)?$/;

function LiteralField({
  field,
  label,
  view,
  isNumber,
  onTweak,
}: {
  field: Field;
  label: string;
  view: FieldView;
  isNumber: boolean;
  onTweak: (t: Tweak) => void;
}) {
  const initial = view.value ?? "";
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  const submitted = useRef(initial);
  function commit() {
    const next = value.trim();
    if (!view.editable || next === submitted.current) return;
    if (isNumber && !WHOLE_NUMBER.test(next)) {
      setError(true);
      return;
    }
    submitted.current = next;
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
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {view.auto ? <Text type="supporting">auto</Text> : null}
    </VStack>
  );
}

export function TweakPanel(props: TweakPanelProps) {
  const { label, computed, used, onTweak } = props;
  const view = displayValues(props.fields, computed);
  // A new element or a new value resets the local typing state.
  const literal = (field: Field, name: string, isNumber: boolean) => (
    <LiteralField
      key={`${field}:${label}:${view[field].value}:${view[field].editable}`}
      field={field}
      label={name}
      view={view[field]}
      isNumber={isNumber}
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
    <VStack gap={3}>
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
          {computed ? <Text type="supporting">{`Showing: ${firstFontName(computed.fontFamily)}`}</Text> : null}
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
