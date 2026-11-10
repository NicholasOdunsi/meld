"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { CanvasScene } from "./canvas-scene";
import { CanvasToolbar } from "./canvas-toolbar";
import { createHistory, redo, replaceDocument, undo } from "./commands";
import { CanvasDocumentSchema, decodeCanvasDocument, MAX_DOCUMENT_BYTES, MAX_OBJECTS, MAX_STROKE_POINTS, type CanvasDocument, type Point } from "./document";
import { toWorld, zoomAt, type Camera } from "./camera";
import { boundsBetween, hitTest, resizeObject, strokeFromPoints, translateObjects, type Tool } from "./interaction";
import { previewTheme } from "./preview-theme";
import { fixtureDocument, fixtureScreens } from "./fixtures";

type Gesture = {
  pointerId: number; kind: Tool | "resize"; start: Point; screenStart: Point;
  camera: Camera; original: CanvasDocument; next: CanvasDocument;
  id: string; ids: string[]; points: Point[];
};
const initialCamera: Camera = {x: 0, y: 0, zoom: 1};
function isField(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input,textarea,select,[contenteditable=true]");
}
export function CanvasPrototype({initialDocument = fixtureDocument, onDocumentChange}: {
  initialDocument?: CanvasDocument; onDocumentChange?: (document: CanvasDocument) => void;
}) {
  const [history, setHistory] = useState(() => createHistory(CanvasDocumentSchema.parse(initialDocument)));
  const [transient, setTransient] = useState<CanvasDocument | null>(null);
  const [camera, setCamera] = useState(initialCamera);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{id: string; text: string} | null>(null);
  const [message, setMessage] = useState("");
  const [tokenCss, setTokenCss] = useState("");
  const [viewport, setViewport] = useState({width: 1200, height: 800});
  const scene = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const importSequence = useRef(0);
  const savedJson = useRef(JSON.stringify(initialDocument));
  const document = transient ?? history.present;
  const activeSelection = selectedIds.filter(id => document.objects.some(object => object.id === id));
  const commit = useCallback((doc: CanvasDocument) => {
    const result = CanvasDocumentSchema.safeParse(doc);
    if (!result.success || new TextEncoder().encode(JSON.stringify(doc)).byteLength > MAX_DOCUMENT_BYTES) {
      setMessage("Canvas limit reached. Export your work before starting another board.");
      return;
    }
    importSequence.current++;
    setHistory(h => replaceDocument(h, result.data));
  }, []);
  const cancel = useCallback(() => {
    const active = gesture.current;
    if (active?.kind === "pan") setCamera(active.camera);
    gesture.current = null;
    setTransient(null);
  }, []);
  function finishText() {
    if (!editing) return;
    commit({...history.present, objects: history.present.objects.map(o => o.id === editing.id && o.kind === "text" ? {...o, text: editing.text} : o)});
    setEditing(null);
  }
  useEffect(() => { onDocumentChange?.(history.present); }, [history.present, onDocumentChange]);
  useEffect(() => {
    const svg = scene.current;
    if (!svg) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      setTokenCss(previewTheme(getComputedStyle(svg)));
      if (rect) setViewport({width: rect.width, height: rect.height});
    });
    observer.observe(svg);
    const wheel = (event: WheelEvent) => {
      if (isField(event.target)) return;
      event.preventDefault();
      if (gesture.current) return;
      const rect = svg.getBoundingClientRect();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const dx = event.deltaX*factor, dy = event.deltaY*factor;
      setCamera(current => event.ctrlKey || event.metaKey
        ? zoomAt(current, {x: event.clientX-rect.left, y: event.clientY-rect.top}, current.zoom*Math.exp(-Math.max(-500, Math.min(500, dy))*0.002))
        : {...current, x: current.x-dx, y: current.y-dy});
    };
    const blur = () => {space.current = false; cancel();};
    svg.addEventListener("wheel", wheel, {passive: false});
    window.addEventListener("blur", blur);
    return () => { observer.disconnect(); svg.removeEventListener("wheel", wheel); window.removeEventListener("blur", blur); };
  }, [cancel]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(history.present) !== savedJson.current || editing || gesture.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [history.present, editing]);
  function screenPoint(event: {clientX: number; clientY: number}): Point {
    const rect = scene.current!.getBoundingClientRect();
    return {x: event.clientX-rect.left, y: event.clientY-rect.top};
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (gesture.current || (event.button !== 0 && event.button !== 1) || !event.isPrimary && event.pointerType === "touch") return;
    if (editing) {finishText(); event.preventDefault(); return;}
    scene.current?.focus();
    const screenStart = screenPoint(event), start = toWorld(screenStart, camera);
    const resizeId = (event.target as Element).getAttribute("data-resize-id");
    const hit = hitTest(history.present, start, 6/camera.zoom);
    const kind = event.button === 1 || space.current ? "pan" : tool === "select" && resizeId ? "resize" : tool;
    if (kind === "text") {
      if (history.present.objects.length >= MAX_OBJECTS) {setMessage("Object limit reached."); return;}
      const id = crypto.randomUUID();
      const next: CanvasDocument = {...history.present, objects: [...history.present.objects, {id, kind: "text", ...start, width: 280, height: 100, text: "New note"}]};
      commit(next); setSelectedIds([id]); setEditing({id, text: "New note"}); setTool("select"); return;
    }
    let ids = selectedIds;
    if (kind === "select") {
      ids = hit ? event.shiftKey ? selectedIds.includes(hit) ? selectedIds.filter(id => id !== hit) : [...selectedIds, hit] : selectedIds.includes(hit) ? selectedIds : [hit] : [];
      setSelectedIds(ids);
    }
    if ((kind === "draw" || kind === "rectangle") && history.present.objects.length >= MAX_OBJECTS) {setMessage("Object limit reached."); return;}
    gesture.current = {pointerId: event.pointerId, kind, start, screenStart, camera, original: history.present, next: history.present,
      id: resizeId ?? crypto.randomUUID(), ids, points: [start]};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = screenPoint(event), world = toWorld(point, active.camera);
    if (active.kind === "pan") {
      setCamera({...active.camera, x: active.camera.x+point.x-active.screenStart.x, y: active.camera.y+point.y-active.screenStart.y}); return;
    }
    let next = active.original;
    if (active.kind === "select") next = translateObjects(active.original, active.ids, {x: world.x-active.start.x, y: world.y-active.start.y});
    if (active.kind === "resize") {
      const object = active.original.objects.find(o => o.id === active.id);
      if (object) next = resizeObject(active.original, active.id, {...object, width: object.width+world.x-active.start.x, height: object.height+world.y-active.start.y});
    }
    if (active.kind === "rectangle") next = {...active.original, objects: [...active.original.objects, {id: active.id, kind: "rectangle", ...boundsBetween(active.start, world)}]};
    if (active.kind === "draw") {
      if (active.points.length < MAX_STROKE_POINTS) active.points.push(world);
      next = {...active.original, objects: [...active.original.objects, strokeFromPoints(active.id, active.points)]};
    }
    active.next = next; setTransient(next);
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    pointerMove(event);
    gesture.current = null; setTransient(null);
    if (active.kind !== "pan") {
      commit(active.next);
      if (active.kind === "draw" || active.kind === "rectangle") setSelectedIds([active.id]);
    }
  }
  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {cancel(); setEditing(null); space.current = false; event.preventDefault(); return;}
    if (isField(event.target)) return;
    if (event.code === "Space") {space.current = true; event.preventDefault(); return;}
    if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault(); cancel(); importSequence.current++; setHistory(event.shiftKey || event.key.toLowerCase() === "y" ? redo : undo); return;
    }
    if (["Delete", "Backspace"].includes(event.key)) {
      event.preventDefault(); cancel(); commit({...history.present, objects: history.present.objects.filter(o => !selectedIds.includes(o.id))}); setSelectedIds([]);
    }
  }
  async function importFile(file: File) {
    const sequence = ++importSequence.current;
    cancel(); setEditing(null);
    try {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Canvas file exceeds 8 MiB.");
      const imported = decodeCanvasDocument(await file.text());
      if (sequence !== importSequence.current) return;
      commit(imported); setSelectedIds([]); setCamera(initialCamera);
      savedJson.current = JSON.stringify(imported);
      setMessage("Imported canvas. Missing images or screens display a placeholder.");
    } catch {
      if (sequence === importSequence.current) setMessage("Could not import this canvas. Choose a valid version 1 canvas JSON file, up to 8 MiB. Your board is unchanged.");
    }
  }
  function exportFile() {
    finishText();
    const exportDoc = editing ? {...history.present, objects: history.present.objects.map(o => o.id === editing.id && o.kind === "text" ? {...o, text: editing.text} : o)} : history.present;
    const json = JSON.stringify(exportDoc, null, 2);
    // Validate the actual downloaded bytes, including formatting.
    try {decodeCanvasDocument(json);} catch {setMessage("Canvas is too large to export. Remove some objects and try again."); return;}
    const url = URL.createObjectURL(new Blob([json], {type: "application/json"}));
    const link = window.document.createElement("a"); link.href = url; link.download = "meld-canvas.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    savedJson.current = JSON.stringify(exportDoc); setMessage("Canvas exported. Keep the JSON file to reopen your work.");
  }
  return <AppShell height="fill" variant="surface" contentPadding={0}>
    {/* Frame budget: toolbar ~56px, status ~40px, scene flex. Toolbar wraps at narrower desktop widths; no inspector yet. */}
    <VStack height="100%" gap={0} onKeyDown={keyDown} onKeyUp={event => {if (event.code === "Space") space.current = false;}}
      style={{overflow: "hidden"}}>
      <CanvasToolbar tool={tool} onTool={value => {cancel(); finishText(); setTool(value);}} canUndo={!!history.past.length} canRedo={!!history.future.length}
        onUndo={() => {cancel(); importSequence.current++; setEditing(null); setHistory(undo);}} onRedo={() => {cancel(); importSequence.current++; setEditing(null); setHistory(redo);}}
        onExport={exportFile} onImport={importFile} zoom={camera.zoom} onReset={() => {cancel(); setCamera(initialCamera);}} />
      <VStack style={{flex: 1, minHeight: "var(--spacing-0)", overflow: "hidden"}}>
        <CanvasScene ref={scene} document={document} camera={camera} selectedIds={activeSelection} screens={fixtureScreens} tokenCss={tokenCss} viewport={viewport}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancel}
          editing={editing} onTextChange={text => setEditing(current => current ? {...current, text: text.slice(0, 32000)} : null)} onTextDone={finishText}
          onDoubleClick={event => {
            const id = hitTest(history.present, toWorld(screenPoint(event), camera), 6/camera.zoom);
            const object = history.present.objects.find(o => o.id === id);
            if (object?.kind === "text") {cancel(); setSelectedIds([object.id]); setEditing({id: object.id, text: object.text});}
          }} />
      </VStack>
      <HStack padding={3} gap={4} wrap="wrap" style={{background: "var(--color-background-surface)"}}>
        <Text type="supporting">Local prototype — export to keep your work</Text>
        <Text type="supporting">{document.objects.length} objects · {activeSelection.length} selected</Text>
        <Text type="supporting">Space + drag to pan · ⌘/Ctrl + scroll to zoom · Shift-click to select · Double-click notes to edit</Text>
      </HStack>
      {message && <HStack padding={3} role="status" aria-label="Canvas status"><Text type="supporting">{message}</Text></HStack>}
    </VStack>
  </AppShell>;
}
