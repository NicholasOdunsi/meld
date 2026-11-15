"use client";

import { memo, useMemo, type Ref, type PointerEventHandler, type MouseEventHandler } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import type { CanvasDocument, CanvasObject } from "./document";
import type { Camera } from "./camera";
import { previewChromeCss } from "./preview-theme";
import { fixtureAssets } from "./fixtures";

type Props = {
  document: CanvasDocument; camera: Camera; selectedIds: string[]; screens: CanvasScreen[];
  tokenCss: string; viewport: {width: number; height: number}; ref: Ref<SVGSVGElement>;
  onPointerDown: PointerEventHandler<SVGSVGElement>; onPointerMove: PointerEventHandler<SVGSVGElement>;
  onPointerUp: PointerEventHandler<SVGSVGElement>; onPointerCancel: PointerEventHandler<SVGSVGElement>;
  onDoubleClick: MouseEventHandler<SVGSVGElement>;
  editing: {id: string; text: string} | null; onTextChange: (value: string) => void;
  onTextDone: () => void;
};
const FramePreview = memo(function FramePreview({screen, tokenCss}: {screen: CanvasScreen; tokenCss: string}) {
  const doc = useMemo(() => {
    try { return buildFramePreviewDoc(screen, tokenCss, previewChromeCss); } catch { return null; }
  }, [screen, tokenCss]);
  return doc ? <iframe title={`${screen.name} preview`} sandbox="" srcDoc={doc}
    width="100%" height="100%" style={{width: "100%", height: "100%", border: "none", pointerEvents: "none", display: "block"}} />
    : <Text>Preview unavailable</Text>;
});
function ObjectContent({object, screen, tokenCss}: {object: CanvasObject; screen?: CanvasScreen; tokenCss: string}) {
  if (object.kind === "rectangle") return <rect width={object.width} height={object.height}
    rx="var(--radius-inner)" fill="var(--color-background-surface)" stroke="var(--color-text-secondary)" strokeWidth={2} />;
  if (object.kind === "stroke") return object.points.length === 1
    ? <circle cx={object.points[0].x} cy={object.points[0].y} r={1.5} fill="var(--color-text-primary)" />
    : <polyline points={object.points.map(p => `${p.x},${p.y}`).join(" ")}
      fill="none" stroke="var(--color-text-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
  if (object.kind === "image" && Object.hasOwn(fixtureAssets, object.assetId)) return <image href={fixtureAssets[object.assetId]}
    width={object.width} height={object.height} preserveAspectRatio="xMidYMid slice" />;
  return <foreignObject width={object.width} height={object.height} style={{pointerEvents: "none", overflow: "hidden"}}>
    {object.kind === "html-frame" && screen ? <FramePreview screen={screen} tokenCss={tokenCss} /> :
      <VStack padding={2} height="100%" style={{whiteSpace: "pre-wrap", overflow: "hidden"}}>
        <Text>{object.kind === "text" ? object.text : object.kind === "image" ? "Image asset unavailable" : "Screen unavailable"}</Text>
      </VStack>}
  </foreignObject>;
}
export function CanvasScene({ref: sceneRef, ...props}: Props) {
  const {camera, document, viewport, selectedIds, screens} = props;
  const screensById = new Map(screens.map(s => [s.id, s]));
  const margin = 100 / camera.zoom;
  const left = -camera.x/camera.zoom-margin, top = -camera.y/camera.zoom-margin;
  const right = left+viewport.width/camera.zoom+2*margin, bottom = top+viewport.height/camera.zoom+2*margin;
  const visible = document.objects.filter(o => o.x+o.width >= left && o.y+o.height >= top && o.x <= right && o.y <= bottom);
  return <svg ref={sceneRef} role="application" aria-label="Canvas workspace" tabIndex={0}
    data-object-count={document.objects.length} data-visible-count={visible.length} data-zoom={camera.zoom}
    width="100%" height="100%"
    style={{display: "block", touchAction: "none", userSelect: "none", background: "var(--color-background-body)"}}
    onPointerDown={props.onPointerDown} onPointerMove={props.onPointerMove}
    onPointerUp={props.onPointerUp} onPointerCancel={props.onPointerCancel}
    onLostPointerCapture={props.onPointerCancel} onDoubleClick={props.onDoubleClick}>
    <title>Sketches and live HTML frames</title>
    <defs><pattern id="canvas-next-grid" width={24} height={24} patternUnits="userSpaceOnUse"
      patternTransform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
      <circle cx={1} cy={1} r={0.7} fill="var(--color-border-secondary)" />
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#canvas-next-grid)" />
    <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
      {visible.map(object => <g key={object.id} data-object-id={object.id} data-kind={object.kind}
        transform={`translate(${object.x} ${object.y})`}>
        <ObjectContent object={object} tokenCss={props.tokenCss} screen={object.kind === "html-frame" ? screensById.get(object.screenId) : undefined} />
      </g>)}
      {document.objects.filter(o => selectedIds.includes(o.id)).map(object => <g key={`selection-${object.id}`}>
        <rect x={object.x} y={object.y} width={object.width} height={object.height} fill="none"
          stroke="var(--color-accent)" strokeWidth={1.5/camera.zoom} />
        <rect data-resize-id={object.id} x={object.x+object.width-5/camera.zoom} y={object.y+object.height-5/camera.zoom}
          width={10/camera.zoom} height={10/camera.zoom} fill="var(--color-background-surface)"
          stroke="var(--color-accent)" strokeWidth={1/camera.zoom} style={{cursor: "nwse-resize"}} />
      </g>)}
      {props.editing && (() => {
        const object = document.objects.find(o => o.id === props.editing?.id);
        return object && <foreignObject x={object.x} y={object.y} width={Math.max(240, object.width)} height={Math.max(100, object.height)}
          onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === "Enter") props.onTextDone(); }}>
          <TextInput label="Note text" value={props.editing.text} onChange={props.onTextChange} hasAutoFocus />
        </foreignObject>;
      })()}
    </g>
  </svg>;
}
