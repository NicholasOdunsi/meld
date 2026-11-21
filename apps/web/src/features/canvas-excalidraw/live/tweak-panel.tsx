"use client";
import { useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { ALargeSmall, Baseline, Bold, MoveHorizontal, MousePointer2, PaintBucket, Redo2, SquareDashed, SquareRoundCorner, Type as TextIcon, Undo2 } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
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
type Glyph = ComponentType<SVGProps<SVGSVGElement>>;
const letter = (char: string): Glyph =>
  function Letter(props) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
        <text x="12" y="17.5" textAnchor="middle" fontSize="15" fontWeight="600">{char}</text>
      </svg>
    );
  };
// A small glyph sits inside each field, like a design tool's inspector; the full name stays the accessible label.
const GLYPH: Record<Field, Glyph> = {
  text: TextIcon,
  color: Baseline,
  backgroundColor: PaintBucket,
  fontSize: ALargeSmall,
  fontWeight: Bold,
  padding: SquareDashed,
  gap: MoveHorizontal,
  borderRadius: SquareRoundCorner,
  width: letter("W"),
  height: letter("H"),
};
const GROUPS: readonly { title: string; fields: readonly (readonly Field[])[] }[] = [
  { title: "Content", fields: [["text"]] },
  { title: "Typography", fields: [["fontSize", "fontWeight"], ["color"]] },
  { title: "Layout", fields: [["width", "height"], ["padding", "gap"]] },
  { title: "Appearance", fields: [["backgroundColor"], ["borderRadius"]] },
];
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
  const isColor = field === "color" || field === "backgroundColor";
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
      isLabelHidden
      startIcon={GLYPH[field]}
      size="sm"
      value={value}
      onChange={(next) => {
        setValue(next);
        setError(false);
      }}
      isDisabled={!state.editable}
      status={
        error
          ? {
              type: "error",
              message: isColor ? "Use a hex colour." : "Enter a valid nonnegative value.",
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
  const selected = props.selectedLabel !== null;
  const stateOf = (field: Field): FieldState => props.fields?.[field] ?? { editable: false, value: null };
  const anyComputed = (Object.keys(labels) as Field[]).some((field) => !stateOf(field).editable);
  return (
    <VStack gap={3}>
      <HStack gap={1} align="center" justify="between">
        <ToggleButton
          label="Pick"
          icon={<MousePointer2 />}
          isIconOnly
          size="sm"
          tooltip="Pick an element in the screen"
          isPressed={props.picking}
          onPressedChange={() => props.onTogglePick()}
          isDisabled={props.pickDisabled}
        />
        <HStack gap={0.5} align="center">
          <IconButton label="Undo" tooltip="Undo" icon={<Undo2 />} variant="ghost" size="sm" onClick={props.onUndo} isDisabled={!props.canUndo} />
          <IconButton label="Redo" tooltip="Redo" icon={<Redo2 />} variant="ghost" size="sm" onClick={props.onRedo} isDisabled={!props.canRedo} />
        </HStack>
      </HStack>
      {!selected ? (
        <Text type="supporting">{props.picking ? "Choose an element in the screen." : "Pick an element to edit."}</Text>
      ) : (
        <>
          <Text type="label">{props.selectedLabel}</Text>
          {GROUPS.map((group) => (
            <VStack key={group.title} gap={2}>
              <Divider />
              <Text type="supporting">{group.title}</Text>
              {group.fields.map((row) => (
                <Grid key={row.join()} columns={{ minWidth: 96, repeat: "fit" }} gap={2}>
                  {row.map((field) => {
                    const state = stateOf(field);
                    return (
                      <LiteralField
                        key={`${field}:${props.selectedLabel}:${state.value}:${state.editable}`}
                        field={field}
                        state={state}
                        onTweak={props.onTweak}
                      />
                    );
                  })}
                </Grid>
              ))}
            </VStack>
          ))}
          {anyComputed ? <Text type="supporting">Dimmed values are computed. Edit them in Code.</Text> : null}
          <Divider />
          {props.canAdd ? (
            <Button label="Add to chat" onClick={props.onAdd} />
          ) : props.addReason ? (
            <Text type="supporting">{props.addReason}</Text>
          ) : null}
        </>
      )}
    </VStack>
  );
}
export default TweakPanel;
