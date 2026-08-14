"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIndexAbove, type Editor } from "tldraw";
import type { TLArrowBinding, TLShapeId } from "@tldraw/tlschema";
import type { RefObject } from "react";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import {
  clearDesignScreenActionLink,
  setDesignScreenActionLink,
} from "@/features/design/design-screen-links";
import { screenFrameId } from "./screen-frame-reconcile";
import {
  clearForRemovedArrow,
  meldLinkFromMeta,
  reconcileScreenLinks,
  screenLinkArrowRecords,
  screenLinkFromArrow,
  type ExistingLinkArrow,
  type ScreenArrowTerminals,
  type ScreenLinkRow,
} from "./screen-link-arrow";

// The picker the canvas renders when a drawn arrow links two frames but the
// source screen has more than one nav action: the user chooses which button
// the arrow wires up. Positioned in screen (viewport) coordinates.
export type ScreenLinkPicker = {
  arrowId: string;
  sourceScreenId: string;
  targetScreenId: string;
  actions: { id: string; label: string }[];
  left: number;
  top: number;
};

export type ScreenLinkPickerActions = {
  picker: ScreenLinkPicker | null;
  pick: (actionId: string) => void;
  cancel: () => void;
};

// How long after the last document change the canvas rescans for a new,
// unpicked link arrow. A binding lands a beat after its arrow, so a short
// settle window lets both terminals resolve before we read them.
const SCAN_DEBOUNCE_MS = 120;

function screenIdForShape(editor: Editor, shapeId: TLShapeId): string | null {
  const shape = editor.getShape(shapeId);
  const meldScreenId = shape?.meta?.meldScreenId;
  return typeof meldScreenId === "string" ? meldScreenId : null;
}

// Resolve which screen each end of an arrow binds to by walking its arrow
// bindings and reading the bound frame's `meta.meldScreenId`.
function terminalsForArrow(editor: Editor, arrowId: TLShapeId): ScreenArrowTerminals {
  let startScreenId: string | null = null;
  let endScreenId: string | null = null;
  const bindings = editor.getBindingsFromShape(arrowId, "arrow");
  for (const binding of bindings) {
    const screenId = screenIdForShape(editor, binding.toId);
    if (binding.props.terminal === "start") startScreenId = screenId;
    else if (binding.props.terminal === "end") endScreenId = screenId;
  }
  return { startScreenId, endScreenId };
}

function actionsForScreen(
  screen: CanvasScreen | undefined,
): { id: string; label: string }[] {
  return (screen?.preview?.actions ?? []).map((action) => ({
    id: action.id,
    label: action.label,
  }));
}

export function useScreenLinkWiring({
  editorRef,
  isEditorReady,
  access,
  storeStatus,
  roomId,
  canvasScreens,
  screenLinks,
  screenLinksAuthoritative,
}: {
  editorRef: RefObject<Editor | null>;
  isEditorReady: boolean;
  access: "edit" | "view";
  storeStatus: string;
  roomId: string;
  canvasScreens: CanvasScreen[];
  screenLinks: ScreenLinkRow[];
  // Whether the `screenLinks` read was authoritative (see
  // `readRoomActionLinkRows`). A non-authoritative read never removes existing
  // link arrows -- a transient blip must not wipe the shared document.
  screenLinksAuthoritative: boolean;
}): ScreenLinkPickerActions {
  const [picker, setPicker] = useState<ScreenLinkPicker | null>(null);

  // Latest props, read from inside the store listener (which closes over its
  // creation-time scope) without re-subscribing on every render. Updated in an
  // effect rather than during render (refs must not be written while rendering).
  const canvasScreensRef = useRef(canvasScreens);
  const accessRef = useRef(access);
  useEffect(() => {
    canvasScreensRef.current = canvasScreens;
    accessRef.current = access;
  }, [access, canvasScreens]);

  // Arrow ids we have already resolved (linked, auto-picked, reconciled, or
  // deliberately ignored) so the rescan never reopens a picker for them.
  const handledArrowIdsRef = useRef(new Set<string>());
  // Arrow ids the reconcile is about to delete: their removal is programmatic,
  // not a user unlink, so the removal handler must NOT clear the DB row.
  const suppressedClearIdsRef = useRef(new Set<string>());
  const reconciledKeyRef = useRef<string | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitLink = useCallback(
    (
      editor: Editor,
      arrowId: string,
      sourceScreenId: string,
      targetScreenId: string,
      actionId: string,
    ) => {
      handledArrowIdsRef.current.add(arrowId);
      setPicker((current) => (current?.arrowId === arrowId ? null : current));
      const shape = editor.getShape(arrowId as TLShapeId);
      if (shape) {
        editor.run(() => {
          editor.updateShape({
            id: arrowId as TLShapeId,
            type: "arrow",
            meta: {
              ...shape.meta,
              meldLink: { sourceScreenId, actionId, targetScreenId },
            },
          });
        });
      }
      void setDesignScreenActionLink({
        sourceScreenId,
        actionId,
        targetScreenId,
      }).then((result) => {
        if (result.status === "error") {
          // Persistence failed: drop the arrow rather than leave a link the
          // server never accepted. Suppress the clear that its removal would
          // otherwise trigger (nothing was ever written).
          suppressedClearIdsRef.current.add(arrowId);
          handledArrowIdsRef.current.delete(arrowId);
          const live = editorRef.current;
          if (live?.getShape(arrowId as TLShapeId)) {
            live.deleteShapes([arrowId as TLShapeId]);
          }
        }
      });
    },
    [editorRef],
  );

  const removeArrow = useCallback(
    (editor: Editor, arrowId: string) => {
      suppressedClearIdsRef.current.add(arrowId);
      if (editor.getShape(arrowId as TLShapeId)) {
        editor.deleteShapes([arrowId as TLShapeId]);
      }
    },
    [],
  );

  const pick = useCallback(
    (actionId: string) => {
      const editor = editorRef.current;
      const current = picker;
      if (!editor || !current) return;
      commitLink(
        editor,
        current.arrowId,
        current.sourceScreenId,
        current.targetScreenId,
        actionId,
      );
    },
    [commitLink, editorRef, picker],
  );

  const cancel = useCallback(() => {
    const editor = editorRef.current;
    const current = picker;
    setPicker(null);
    if (!editor || !current) return;
    handledArrowIdsRef.current.add(current.arrowId);
    // The user drew the arrow but chose no action: remove it so a dangling,
    // unlinked arrow doesn't linger between two frames.
    removeArrow(editor, current.arrowId);
  }, [editorRef, picker, removeArrow]);

  // Scan the page for one freshly-drawn arrow that links two frames but has no
  // action yet: auto-pick when the source has a single nav action, otherwise
  // open the picker.
  const scanForNewLink = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || accessRef.current !== "edit") return;
    if (typeof editor.getCurrentPageShapes !== "function") return;

    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.type !== "arrow") continue;
      if (handledArrowIdsRef.current.has(shape.id)) continue;
      const terminals = terminalsForArrow(editor, shape.id);
      const link = screenLinkFromArrow(
        { type: shape.type, meta: shape.meta as Record<string, unknown> },
        terminals,
      );
      if (!link) continue;
      if (link.actionId) {
        // Already resolved (reconciled or previously linked) -- never reopen.
        handledArrowIdsRef.current.add(shape.id);
        continue;
      }

      const actions = actionsForScreen(
        canvasScreensRef.current.find((screen) => screen.id === link.sourceScreenId),
      );
      if (actions.length === 0) {
        // Nothing to wire up: leave the arrow as a plain annotation.
        handledArrowIdsRef.current.add(shape.id);
        continue;
      }
      if (actions.length === 1) {
        commitLink(
          editor,
          shape.id,
          link.sourceScreenId,
          link.targetScreenId,
          actions[0]!.id,
        );
        return;
      }

      // Multiple actions: open a picker, one at a time.
      if (picker) return;
      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) return;
      const point = editor.pageToViewport({
        x: bounds.x + bounds.w / 2,
        y: bounds.y + bounds.h / 2,
      });
      setPicker({
        arrowId: shape.id,
        sourceScreenId: link.sourceScreenId,
        targetScreenId: link.targetScreenId,
        actions,
        left: point.x,
        top: point.y,
      });
      return;
    }
  }, [commitLink, editorRef, picker]);

  // Store listener: react to the local user's own document edits. New/updated
  // records schedule a rescan; removed link arrows clear their DB override.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isEditorReady || access !== "edit") return;
    if (typeof editor.store?.listen !== "function") return;

    const unlisten = editor.store.listen(
      (entry) => {
        const { added, updated, removed } = entry.changes;

        for (const record of Object.values(removed)) {
          if (record.typeName !== "shape") continue;
          handledArrowIdsRef.current.delete(record.id);
          // Consume the suppression flag (a programmatic reconcile-delete) here;
          // the pure decision below uses it to avoid clearing a valid row.
          const suppressed = suppressedClearIdsRef.current.delete(record.id);
          const clear = clearForRemovedArrow(
            {
              typeName: record.typeName,
              type: record.type,
              meta: record.meta as Record<string, unknown>,
            },
            suppressed,
          );
          if (clear) void clearDesignScreenActionLink(clear);
        }

        const touched =
          Object.keys(added).length > 0 || Object.keys(updated).length > 0;
        if (touched) {
          if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
          scanTimerRef.current = setTimeout(scanForNewLink, SCAN_DEBOUNCE_MS);
        }
      },
      { scope: "document", source: "user" },
    );

    return () => {
      unlisten();
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [access, editorRef, isEditorReady, scanForNewLink]);

  // Reconcile the authoritative link rows into `meldLink` arrows on load, the
  // same way screen frames are reconciled. Runs once per (room, links, frames)
  // key, for editors, after remote sync.
  const linksKey = screenLinks
    .map((row) => `${row.sourceScreenId}:${row.actionId}:${row.targetScreenId}`)
    .sort()
    .join("|");
  const framesKey = canvasScreens
    .map((screen) => screen.id)
    .sort()
    .join("|");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isEditorReady || access !== "edit") return;
    if (storeStatus !== "synced-remote") return;

    // The authoritative flag is part of the key so a failed read (which never
    // removes) can never block a later good read with the same rows/frames from
    // running its removals.
    const reconciliationKey = `${roomId}:${screenLinksAuthoritative}:${linksKey}:${framesKey}`;
    if (reconciledKeyRef.current === reconciliationKey) return;

    const existingArrows: ExistingLinkArrow[] = editor
      .getCurrentPageShapes()
      .filter((shape) => shape.type === "arrow")
      .map((shape) => ({
        id: shape.id,
        meldLink: meldLinkFromMeta(shape.meta as Record<string, unknown>),
      }))
      .filter((arrow) => arrow.meldLink !== null);

    const { toCreate, toRemove } = reconcileScreenLinks(screenLinks, existingArrows);

    // Removals are DESTRUCTIVE in the shared multiplayer document, so only act
    // on them when the read was authoritative. A failed/stale read (rows: [])
    // leaves every existing link arrow untouched rather than deleting them all.
    const removals = screenLinksAuthoritative ? toRemove : [];

    // Only draw an arrow once both of its frames exist on the canvas; a row
    // whose frames haven't been projected yet is retried on the next pass
    // (framesKey changes as frames land).
    const creatable = toCreate.filter((row) => {
      const startFrameId = screenFrameId(row.sourceScreenId);
      const endFrameId = screenFrameId(row.targetScreenId);
      return (
        editor.getShape(startFrameId as TLShapeId) &&
        editor.getShape(endFrameId as TLShapeId)
      );
    });

    if (creatable.length > 0 || removals.length > 0) {
      const pageId = editor.getCurrentPageId();
      editor.run(() => {
        for (const arrowId of removals) {
          suppressedClearIdsRef.current.add(arrowId);
          if (editor.getShape(arrowId as TLShapeId)) {
            editor.deleteShapes([arrowId as TLShapeId]);
          }
        }
        for (const row of creatable) {
          const { arrow, bindings } = screenLinkArrowRecords({
            row,
            startFrameId: screenFrameId(row.sourceScreenId),
            endFrameId: screenFrameId(row.targetScreenId),
            pageId,
            index: getIndexAbove(editor.getHighestIndexForParent(pageId)),
          });
          handledArrowIdsRef.current.add(arrow.id);
          editor.store.put([arrow, ...(bindings as TLArrowBinding[])]);
        }
      });
    }

    // Settle the key only on an authoritative read once every row's frames
    // exist (all creatable rows drawn). A non-authoritative read is never
    // final -- leave the ref so a subsequent good read reconciles.
    if (screenLinksAuthoritative && creatable.length === toCreate.length) {
      reconciledKeyRef.current = reconciliationKey;
    }
  }, [
    access,
    editorRef,
    framesKey,
    isEditorReady,
    linksKey,
    roomId,
    screenLinks,
    screenLinksAuthoritative,
    storeStatus,
  ]);

  return { picker, pick, cancel };
}
