"use client";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { FileInput } from "@astryxdesign/core/FileInput";
import type { Tool } from "./interaction";
import { MAX_DOCUMENT_BYTES } from "./document";
export function CanvasToolbar({tool, onTool, canUndo, canRedo, onUndo, onRedo, onExport, onImport, zoom, onReset}: {
  tool: Tool; onTool: (tool: Tool) => void; canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void; onExport: () => void;
  onImport: (file: File) => Promise<void>; zoom: number; onReset: () => void;
}) {
  return <HStack padding={3} gap={2} wrap="wrap" style={{background: "var(--color-background-surface)"}}>
    <Text type="label">Canvas lab</Text>
    {(["select", "pan", "draw", "rectangle", "text"] as Tool[]).map(value =>
      <Button key={value} label={value[0].toUpperCase()+value.slice(1)} size="sm"
        variant={tool === value ? "primary" : "ghost"} aria-pressed={tool === value} onClick={() => onTool(value)} />)}
    <Button label="Undo" size="sm" variant="ghost" isDisabled={!canUndo} onClick={onUndo} />
    <Button label="Redo" size="sm" variant="ghost" isDisabled={!canRedo} onClick={onRedo} />
    <Button label={`${Math.round(zoom*100)}% · Reset view`} size="sm" variant="ghost" onClick={onReset} />
    <Button label="Export canvas" size="sm" onClick={onExport} />
    <FileInput label="Import canvas" isLabelHidden value={null} accept=".json,application/json" maxSize={MAX_DOCUMENT_BYTES}
      onChange={files => { const file = Array.isArray(files) ? files[0] : files; if (file) void onImport(file); }} />
  </HStack>;
}
