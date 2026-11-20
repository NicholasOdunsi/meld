"use client";
import { useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import type {
  Field,
  FieldState,
  Inspection,
  Tweak,
} from "@meld/screen-runtime/edit/types";

export type TweakPanelProps = {
  picking: boolean;
  fields: Inspection;
  selectedLabel: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePick: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTweak: (tweak: Tweak) => void;
  onAdd: () => void;
  canAdd: boolean;
  pickDisabled?: boolean;
  addReason?: string;
};
export const labels: Record<Field, string> = {
  text: "Text",
  color: "Text colour",
  backgroundColor: "Background colour",
  fontSize: "Font size (px)",
  fontWeight: "Font weight",
  padding: "Padding (px)",
  gap: "Gap (px)",
  borderRadius: "Corner radius (px)",
  width: "Width (px)",
  height: "Height (px)",
};
function valid(field: Field, value: string) {
  if (field === "text") return true;
  if (field === "color" || field === "backgroundColor")
    return /^#[a-f\d]{6}$/i.test(value);
  if (field === "fontWeight") return /^[1-9]00$/.test(value);
  const number = value.endsWith("px") ? value.slice(0, -2) : value;
  return (
    /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(number) && Number.isFinite(Number(number))
  );
}
function LiteralField({
  field,
  state,
  onTweak,
}: {
  field: Field;
  state: FieldState;
  onTweak: (t: Tweak) => void;
}) {
  const initial = state.value ?? "";
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  const submitted = useRef(initial);
  function commit() {
    if (!state.editable || value === submitted.current) return;
    if (!valid(field, value)) {
      setError(true);
      return;
    }
    submitted.current = value;
    setError(false);
    onTweak({ field, value });
  }
  return (
    <TextInput
      label={labels[field]}
      value={value}
      onChange={(next) => {
        setValue(next);
        setError(false);
      }}
      isDisabled={!state.editable}
      description={
        !state.editable ? "This value is computed. Edit it in Code." : undefined
      }
      status={
        error
          ? {
              type: "error",
              message:
                field === "color" || field === "backgroundColor"
                  ? "Use a hex colour."
                  : "Enter a valid nonnegative value.",
            }
          : undefined
      }
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
export function TweakPanel(props: TweakPanelProps) {
  return (
    <VStack gap={3}>
      <HStack gap={2} wrap="wrap">
        <Button
          label="Pick"
          onClick={props.onTogglePick}
          isDisabled={props.pickDisabled}
          aria-pressed={props.picking}
        />
        <Button
          label="Undo"
          onClick={props.onUndo}
          isDisabled={!props.canUndo}
        />
        <Button
          label="Redo"
          onClick={props.onRedo}
          isDisabled={!props.canRedo}
        />
      </HStack>
      <Text>
        {props.selectedLabel ??
          (props.picking
            ? "Choose an element in the screen."
            : "Pick an element to edit.")}
      </Text>
      {Object.entries(labels).map(([key]) => {
        const field = key as Field;
        const state = props.fields?.[field] ?? { editable: false, value: null };
        return (
          <LiteralField
            key={`${field}:${props.selectedLabel}:${state.value}:${state.editable}`}
            field={field}
            state={state}
            onTweak={props.onTweak}
          />
        );
      })}
      <Button
        label="Add to chat"
        onClick={props.onAdd}
        isDisabled={!props.canAdd}
      />
      {!props.canAdd && props.addReason ? <Text>{props.addReason}</Text> : null}
    </VStack>
  );
}
export default TweakPanel;
