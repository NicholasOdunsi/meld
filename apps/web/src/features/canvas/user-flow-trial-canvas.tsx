"use client";

import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
  computed,
  createUserId,
  getIndexAbove,
  inlineBase64AssetStore,
  renderPlaintextFromRichText,
  UserRecordType,
} from "tldraw";
import { useSync } from "@tldraw/sync";
import {
  Tldraw,
  type Editor,
  type TLStoreEventInfo,
  type TLUserStore,
} from "tldraw";
import type { TLRichText } from "@tldraw/tlschema";
import "tldraw/tldraw.css";
import type { FlowDocument } from "@meld/contracts";
import { planScreenSeeds } from "@meld/prototype";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { DesignSystemBanner } from "@/features/design/components/design-system-banner";
import { ScreenComposer } from "@/features/design/components/screen-composer";
import {
  deleteDesignScreen,
  restoreDesignScreen,
} from "@/features/design/design-screen-delete";
import { getActiveDesignProfile } from "@/features/design/design-profile-reader";
import type { RoomDesignScreen } from "@/features/design/design-screen-generation";
import { seedDesignScreensFromFlow } from "@/features/design/seed-design-screens";
import { CanvasRail } from "./canvas-rail";
import {
  getCanvasGatewayUri,
  requestCanvasSession,
} from "./canvas-session";
import { shouldSeedDesignScreens } from "./design-screen-seed";
import { applyGeneratedFlow } from "./flow-document-to-tldraw";
import { ScreenFrameOverlay } from "./screen-frame-overlay";
import {
  reconcileScreenFrames,
  screenFrameRecord,
} from "./screen-frame-reconcile";
import { useCanvasSketchSelection } from "./use-canvas-selection";
import { shouldSeedJourneyFlow } from "./user-flow-seed";
import { flowDocumentFromShapes } from "./user-flow-to-document";
import { syncUserJourneyFromCanvas } from "./user-flow-sync";
import glowStyles from "./user-flow-generating-glow.module.css";
import { useUserFlowGeneration } from "./use-user-flow-generation";
import {
  markUserFlowGenerationApplied,
  type UserFlowGeneration,
} from "./user-flow-generation";

declare global {
  interface Window {
    __MELD_TLDRAW_TRIAL_EDITOR__?: Editor;
  }
}

// tldraw's documented user palette name; keep it outside Astryx CSS styles.
const TLDRAW_TRIAL_USER_COLOR = "coral";

// A stable task id for the journey seed so its shapes are deterministic and a
// second seed attempt would reuse the same ids rather than duplicate the flow.
const PRD_JOURNEY_SEED_TASK_ID = "prd-journey-seed";

// Fixed widths for the right-edge icon rail and, when open, the Agents panel
// beside it. Plain pixel numbers so both columns stay predictable without
// depending on an astryx spacing token's actual scale.
//
// Both are flex siblings of the editor host, not absolute overlays on top of
// it -- Tldraw's own box, and therefore its camera/viewport, is actually
// narrower by their combined width rather than merely painted over. Canvas
// content near the right edge doesn't end up hidden underneath either one,
// and no z-index has to fight tldraw's own floating style-panel chrome
// (`.tlui-layout`, z-index 300) since neither ever paints on top of it.
const CANVAS_RAIL_WIDTH = 64;
const CANVAS_PANEL_WIDTH = 280;

// How long after the last edit the canvas re-reads its flow into memory. The DB
// write only happens on leave; this just keeps a fresh snapshot captured before
// the editor is torn down on unmount.
const FLOW_CAPTURE_DEBOUNCE_MS = 400;
const EMPTY_CANVAS_SCREENS: CanvasScreen[] = [];
const EMPTY_DESIGN_SCREENS: RoomDesignScreen[] = [];

// Read the structured flow back out of the live editor (or null when the canvas
// holds no valid flow). Reuses the same meta the forward mapper stamped.
function extractFlowFromEditor(editor: Editor): FlowDocument | null {
  // Guarded so a partially torn-down editor (or a test stub) yields "no flow"
  // rather than throwing.
  const shapes = editor.getCurrentPageShapes?.();
  if (!Array.isArray(shapes)) return null;
  return flowDocumentFromShapes(
    shapes.map((shape) => ({
      type: shape.type,
      meta: shape.meta as Record<string, unknown>,
      richText: (shape.props as { richText?: unknown }).richText,
    })),
    (richText) =>
      richText ? renderPlaintextFromRichText(editor, richText as TLRichText) : "",
  );
}

export function UserFlowTrialCanvas({
  workspaceId,
  roomId,
  userId,
  userName,
  access,
  trialEnabled,
  seedFlow = null,
  canvasScreens = EMPTY_CANVAS_SCREENS,
  canvasScreensAuthoritative = true,
  initialGenerationTaskId = null,
  screens = EMPTY_DESIGN_SCREENS,
}: {
  workspaceId: string;
  roomId: string;
  userId: string;
  userName: string;
  access: "edit" | "view";
  trialEnabled: boolean;
  seedFlow?: FlowDocument | null;
  canvasScreens?: CanvasScreen[];
  canvasScreensAuthoritative?: boolean;
  initialGenerationTaskId?: string | null;
  // The room's design screens, threaded down for the sketch-aware screen
  // composer mounted on this surface (slice 3b Task 5) -- distinct from
  // `canvasScreens` above, which is the lighter canvas-projection read (name
  // + position + preview) the frame overlay renders.
  screens?: RoomDesignScreen[];
}) {
  const router = useRouter();
  const [effectiveAccess, setEffectiveAccess] = useState(access);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  // Recomputes whenever the editor's selection or shapes change (Task 4); null
  // until an editor is mounted and exactly one screen frame is selected --
  // sketch content is not required (it only affects `sketchShapes`, populated
  // when present and empty otherwise). Feeds the composer below so
  // Generate/Regenerate can target the selected frame with its serialized
  // sketch layout, and feeds the History drawer's `selectedScreenId` filter,
  // which works the same for plain generated frames with no sketch shapes.
  const sketchSelection = useCanvasSketchSelection(editorRef, isEditorReady);
  // The right-edge icon rail's Agents panel: the sketch-aware generate/chat
  // composer, mounted in-flow (not floating) when open. A History rail item
  // used to live alongside this, but it was just the room's conversation
  // again -- redundant with both the room's own Conversation surface and
  // this same Agents panel -- so it was folded away.
  const [isAgentsOpen, setIsAgentsOpen] = useState(false);
  // Gates the design-system upload banner above the screen composer.
  // Defaulting to true (has a profile) avoids a one-frame flash of the
  // banner before the first read resolves -- the non-intrusive default,
  // matching how other async-gated UI in this codebase behaves.
  const [hasActiveDesignProfile, setHasActiveDesignProfile] = useState(true);
  // The active profile's token CSS drives every canvas frame preview, exactly
  // as it drives the prototype viewer. Without it the frames render with no
  // design tokens -- a flat, unstyled wireframe instead of the real screen.
  const [designTokenCss, setDesignTokenCss] = useState("");
  useEffect(() => {
    let disposed = false;
    void getActiveDesignProfile(roomId).then((result) => {
      if (disposed) return;
      setHasActiveDesignProfile(result.hasActiveProfile);
      setDesignTokenCss(result.tokenCss);
    });
    return () => {
      disposed = true;
    };
  }, [roomId]);
  const hasSeededRef = useRef(false);
  const latestFlowRef = useRef<FlowDocument | null>(null);
  const effectiveAccessRef = useRef(effectiveAccess);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorWaiters = useRef(new Set<(editor: Editor) => void>());
  const reconciledKeyRef = useRef<string | null>(null);
  const [seededScreens, setSeededScreens] = useState<CanvasScreen[]>([]);
  const seededScreenSeedRef = useRef(false);
  // Screens deleted locally this session (frame removed from the canvas), kept
  // client-side so the reconcile effect below doesn't recreate the frame while
  // deleteDesignScreen's RPC is in flight -- see the store listener in onMount
  // that populates this from a user-initiated frame removal.
  const [deletedScreenIds, setDeletedScreenIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Mirrors deletedScreenIds for the store listener below, which needs to
  // read the current set synchronously (to recognize an undo) without being
  // torn down and re-subscribed on every delete/restore.
  const deletedScreenIdsRef = useRef(deletedScreenIds);
  useEffect(() => {
    deletedScreenIdsRef.current = deletedScreenIds;
  }, [deletedScreenIds]);
  // The server prop is authoritative; freshly-seeded rows layer on top until the
  // next server read. Dedupe by id so a later server read that includes the seeds
  // supersedes the local copies. Locally deleted screens are excluded so the
  // reconcile effect (below) never resurrects the frame it was removed from.
  const effectiveCanvasScreens = useMemo(() => {
    const byId = new Map<string, CanvasScreen>();
    for (const screen of canvasScreens) byId.set(screen.id, screen);
    for (const screen of seededScreens) if (!byId.has(screen.id)) byId.set(screen.id, screen);
    for (const id of deletedScreenIds) byId.delete(id);
    return Array.from(byId.values());
  }, [canvasScreens, seededScreens, deletedScreenIds]);
  useEffect(() => {
    effectiveAccessRef.current = effectiveAccess;
  }, [effectiveAccess]);

  // Keep an in-memory snapshot of the canvas flow while editing; only an editor
  // captures (viewers never write). The DB write happens on leave, not here.
  const captureFlow = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || effectiveAccessRef.current !== "edit") return;
    const flow = extractFlowFromEditor(editor);
    if (flow) latestFlowRef.current = flow;
  }, []);
  const scheduleCapture = useCallback(() => {
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    captureTimerRef.current = setTimeout(captureFlow, FLOW_CAPTURE_DEBOUNCE_MS);
  }, [captureFlow]);
  // A user deleting a screen's frame (Delete/Backspace, context menu, etc.)
  // only ever removes the tldraw shape -- deleteDesignScreen persists that as
  // the screen row's actual deletion, so it survives a refresh instead of
  // reconcileScreenFrames recreating the frame from the still-live DB row.
  // Undoing that (ctrl/cmd+Z) restores the frame shape locally on tldraw's
  // own undo stack with no help needed here, but the persisted deletion has
  // to be undone too, so it doesn't come back deleted after a refresh --
  // restoreDesignScreen handles that side, keyed off deletedScreenIdsRef so a
  // reappearing frame is only ever treated as a restore when we know it was
  // actually deleted (never for an ordinary newly-created screen). Both
  // directions are scoped to source: "user" (see the listen() call below) so
  // a collaborator's remote change never triggers a second, redundant RPC
  // call.
  const handleScreenFrameChanges = useCallback((entry: TLStoreEventInfo) => {
    const frameScreenIds = (records: Record<string, unknown>) =>
      Object.values(records).flatMap((record) => {
        const shape = record as {
          typeName?: string;
          type?: string;
          meta?: Record<string, unknown>;
        };
        if (shape.typeName !== "shape" || shape.type !== "frame") return [];
        const meldScreenId = shape.meta?.meldScreenId;
        return typeof meldScreenId === "string" ? [meldScreenId] : [];
      });

    const removedScreenIds = frameScreenIds(entry.changes.removed);
    if (removedScreenIds.length > 0) {
      setDeletedScreenIds((prev) => {
        const next = new Set(prev);
        for (const id of removedScreenIds) next.add(id);
        return next;
      });
      for (const id of removedScreenIds) void deleteDesignScreen(id);
    }

    const addedScreenIds = frameScreenIds(entry.changes.added);
    const restoredScreenIds = addedScreenIds.filter((id) =>
      deletedScreenIdsRef.current.has(id),
    );
    if (restoredScreenIds.length > 0) {
      setDeletedScreenIds((prev) => {
        const next = new Set(prev);
        for (const id of restoredScreenIds) next.delete(id);
        return next;
      });
      for (const id of restoredScreenIds) void restoreDesignScreen(id);
    }
  }, []);
  const waitForEditor = useCallback((): Promise<Editor> => {
    const editor = editorRef.current;
    if (editor) return Promise.resolve(editor);
    return new Promise((resolve) => editorWaiters.current.add(resolve));
  }, []);
  const applyGeneration = useCallback(
    async (result: UserFlowGeneration) => {
      const editor = await waitForEditor();
      applyGeneratedFlow(editor, result);
      await markUserFlowGenerationApplied(result.taskId);
    },
    [waitForEditor],
  );
  const openPreview = useCallback(
    (screenId?: string) => {
      router.push(
        screenId ? `?tab=prototype&screen=${screenId}` : "?tab=prototype",
      );
    },
    [router],
  );
  const CanvasScreenLayer = useMemo(() => {
    function CanvasScreenLayerComponent() {
      return (
        <ScreenFrameOverlay
          screens={effectiveCanvasScreens}
          onPreview={openPreview}
          tokenCss={designTokenCss}
        />
      );
    }
    return CanvasScreenLayerComponent;
  }, [effectiveCanvasScreens, openPreview, designTokenCss]);
  const tldrawComponents = useMemo(
    () => ({ InFrontOfTheCanvas: CanvasScreenLayer }),
    [CanvasScreenLayer],
  );
  const generation = useUserFlowGeneration({
    roomId,
    access: effectiveAccess,
    initialTaskId: initialGenerationTaskId,
    onGenerationReady: applyGeneration,
  });
  const users = useMemo<TLUserStore>(
    () => ({
      currentUser: computed("meld-canvas-current-user", () =>
        UserRecordType.create({
          id: createUserId(userId),
          name: userName,
          color: TLDRAW_TRIAL_USER_COLOR,
        }),
      ),
    }),
    [userId, userName],
  );
  const uri = useCallback(async () => {
    const nextSession = await requestCanvasSession({ workspaceId, roomId });
    setEffectiveAccess(nextSession.access);
    return getCanvasGatewayUri(
      nextSession.gatewayUrl,
      roomId,
      nextSession.ticket,
    );
  }, [workspaceId, roomId]);
  const store = useSync({
    uri,
    assets: inlineBase64AssetStore,
    users,
  });
  const isGenerating =
    generation.status === "queued" || generation.status === "running";
  const readOnly = effectiveAccess === "view";
  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      reconciledKeyRef.current = null;
      for (const resolve of editorWaiters.current) resolve(editor);
      editorWaiters.current.clear();
      setIsEditorReady(true);
      // Match the app's Astryx theme (mode="system") so the canvas follows the
      // OS color scheme instead of tldraw's light default.
      editor.user.updateUserPreferences({ colorScheme: "system" });
      // Show the dot grid by default. Grid visibility is per-tab instance state
      // (not synced to collaborators), so this only affects the local view.
      editor.updateInstanceState({ isGridMode: true });
      // Keep an e2e/debug handle only inside this non-production trial surface.
      if (trialEnabled && process.env.NODE_ENV !== "production") {
        window.__MELD_TLDRAW_TRIAL_EDITOR__ = editor;
      }
      // The gateway's access claim drives the sync mode; editor mutations also
      // consult getIsReadonly before writing, so viewers remain read-only even
      // when a command is invoked programmatically.
      if (readOnly && !editor.getIsReadonly()) editor.updateInstanceState({ isReadonly: true });
      if (!readOnly && editor.getIsReadonly()) editor.updateInstanceState({ isReadonly: false });
      // Track local edits so the flow can be synced to the PRD on leave. Only
      // the user's own document changes matter -- not remote sync or presence.
      const unlisten =
        typeof editor.store?.listen === "function"
          ? editor.store.listen(scheduleCapture, {
              scope: "document",
              source: "user",
            })
          : () => {};
      const unlistenScreenFrameChanges =
        typeof editor.store?.listen === "function"
          ? editor.store.listen(handleScreenFrameChanges, {
              scope: "document",
              source: "user",
            })
          : () => {};
      captureFlow();
      return () => {
        unlisten();
        unlistenScreenFrameChanges();
        if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
        if (editorRef.current === editor) editorRef.current = null;
        setIsEditorReady(false);
        if (window.__MELD_TLDRAW_TRIAL_EDITOR__ === editor) {
          delete window.__MELD_TLDRAW_TRIAL_EDITOR__;
        }
      };
    },
    [captureFlow, handleScreenFrameChanges, readOnly, scheduleCapture, trialEnabled],
  );

  // Sync the canvas flow into the PRD's user-journey section when the user
  // leaves the canvas: unmounting the tab, hiding the browser tab, or a full
  // navigation. Uses the last captured snapshot so it works even after the
  // editor has been torn down, and re-captures first when the editor is still
  // alive. The RPC no-ops when the journey is unchanged.
  useEffect(() => {
    const leave = () => {
      captureFlow();
      const flow = latestFlowRef.current;
      if (flow) void syncUserJourneyFromCanvas({ roomId, flow });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [captureFlow, roomId]);

  useEffect(() => {
    const editor = editorRef.current;
    if (effectiveAccess === "view" && editor && !editor.getIsReadonly()) {
      editor.updateInstanceState({ isReadonly: true });
    } else if (effectiveAccess === "edit" && editor?.getIsReadonly()) {
      editor.updateInstanceState({ isReadonly: false });
    }
  }, [effectiveAccess]);

  // Seed an empty canvas from the PRD's user-journey flow the first time an
  // editor opens it. Gated on `synced-remote` so an empty canvas is genuinely
  // empty (not merely un-synced), and one-shot so it never redraws over work.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !seedFlow) return;
    if (
      !shouldSeedJourneyFlow({
        hasSeedFlow: true,
        access: effectiveAccess,
        storeStatus: store.status,
        canvasIsEmpty: editor.getCurrentPageShapeIds().size === 0,
        hasSeeded: hasSeededRef.current,
      })
    ) {
      return;
    }
    hasSeededRef.current = true;
    applyGeneratedFlow(editor, {
      taskId: PRD_JOURNEY_SEED_TASK_ID,
      roomId,
      document: seedFlow,
      createdAt: new Date().toISOString(),
    });
  }, [seedFlow, effectiveAccess, store.status, isEditorReady, roomId]);

  // Seed empty screens from the Define flow's action nodes once, after remote
  // sync, for editors. planScreenSeeds diffs the flow's action nodes against the
  // screens that already exist; the returned rows merge into effectiveCanvasScreens
  // so the existing reconcile projects them as frames. One-shot; idempotent at the
  // DB level too (partial unique index).
  useEffect(() => {
    if (seededScreenSeedRef.current) return;
    const existingFlowNodeIds = effectiveCanvasScreens.flatMap((s) =>
      s.flowNodeId ? [s.flowNodeId] : [],
    );
    const seeds = planScreenSeeds(seedFlow, existingFlowNodeIds);
    if (
      !shouldSeedDesignScreens({
        hasUnseededActionNodes: seeds.length > 0,
        access: effectiveAccess,
        storeStatus: store.status,
        hasSeeded: seededScreenSeedRef.current,
      })
    ) {
      return;
    }
    seededScreenSeedRef.current = true;
    void seedDesignScreensFromFlow({ roomId, seeds }).then((created) => {
      if (created.length > 0) setSeededScreens((prev) => [...prev, ...created]);
    });
  }, [seedFlow, effectiveAccess, store.status, effectiveCanvasScreens, roomId]);

  const canvasScreensKey = useMemo(
    () =>
      effectiveCanvasScreens
        .map(
          (screen) =>
            `${screen.id}:${screen.name}:${screen.canvasX}:${screen.canvasY}`,
        )
        .sort()
        .join("|"),
    [effectiveCanvasScreens],
  );

  // Screen rows are authoritative; their tldraw frames are a recoverable
  // projection. Reconcile only after remote sync and only for editors, keeping
  // view sessions entirely write-free.
  useEffect(() => {
    if (!canvasScreensAuthoritative) {
      reconciledKeyRef.current = null;
      return;
    }
    if (
      !isEditorReady ||
      effectiveAccess !== "edit" ||
      store.status !== "synced-remote"
    ) {
      return;
    }

    const reconciliationKey = `${roomId}:${canvasScreensKey}`;
    if (reconciledKeyRef.current === reconciliationKey) return;
    let cancelled = false;

    void waitForEditor().then((editor) => {
      if (
        cancelled ||
        effectiveAccessRef.current !== "edit" ||
        reconciledKeyRef.current === reconciliationKey
      ) {
        return;
      }

      const pageShapes = editor.getCurrentPageShapes();
      const frames = pageShapes
        .filter((shape) => shape.type === "frame")
        .map((shape) => {
          const props = shape.props as { w?: number; h?: number };
          return {
            id: shape.id,
            meldScreenId:
              typeof shape.meta.meldScreenId === "string"
                ? shape.meta.meldScreenId
                : null,
            w: typeof props.w === "number" ? props.w : 0,
            h: typeof props.h === "number" ? props.h : 0,
          };
        });
      const reconciliation = reconcileScreenFrames(frames, effectiveCanvasScreens);
      const screensById = new Map(
        effectiveCanvasScreens.map((screen) => [screen.id, screen]),
      );
      const framesToMarkIds = new Set([
        ...reconciliation.orphans,
        ...reconciliation.duplicates,
      ]);
      const framesToMark = pageShapes.filter(
        (shape) =>
          framesToMarkIds.has(shape.id) &&
          shape.meta.meldOrphan !== true,
      );
      const duplicateIds = new Set(reconciliation.duplicates);
      const authoritativeScreenIds = new Set(
        effectiveCanvasScreens.map((screen) => screen.id),
      );
      const framesToRestore = pageShapes.filter((shape) => {
        const meldScreenId = shape.meta.meldScreenId;
        return (
          shape.type === "frame" &&
          shape.meta.meldOrphan === true &&
          typeof meldScreenId === "string" &&
          authoritativeScreenIds.has(meldScreenId) &&
          !duplicateIds.has(shape.id)
        );
      });

      if (
        reconciliation.toCreate.length > 0 ||
        reconciliation.toResize.length > 0 ||
        framesToMark.length > 0 ||
        framesToRestore.length > 0
      ) {
        const pageId = editor.getCurrentPageId();
        editor.run(() => {
          for (const screenId of reconciliation.toCreate) {
            const screen = screensById.get(screenId);
            if (!screen) continue;
            editor.store.put([
              screenFrameRecord({
                id: screen.id,
                name: screen.name,
                x: screen.canvasX,
                y: screen.canvasY,
                pageId,
                index: getIndexAbove(
                  editor.getHighestIndexForParent(pageId),
                ),
                formFactor: screen.formFactor,
              }),
            ]);
          }
          for (const resize of reconciliation.toResize) {
            const frame = pageShapes.find((shape) => shape.id === resize.id);
            if (!frame || frame.type !== "frame") continue;
            editor.store.put([
              {
                ...frame,
                props: { ...frame.props, w: resize.w, h: resize.h },
              },
            ]);
          }
          for (const frame of framesToMark) {
            editor.store.put([
              {
                ...frame,
                meta: { ...frame.meta, meldOrphan: true },
              },
            ]);
          }
          for (const frame of framesToRestore) {
            const meta = { ...frame.meta };
            Reflect.deleteProperty(meta, "meldOrphan");
            editor.store.put([{ ...frame, meta }]);
          }
        });
      }

      reconciledKeyRef.current = reconciliationKey;
    });

    return () => {
      cancelled = true;
    };
  }, [
    effectiveCanvasScreens,
    canvasScreensAuthoritative,
    canvasScreensKey,
    effectiveAccess,
    isEditorReady,
    roomId,
    store.status,
    waitForEditor,
  ]);

  if (store.status === "loading") {
    return (
      <VStack
        width="100%"
        height="100%"
        minHeight="var(--spacing-0)"
        hAlign="center"
        vAlign="center"
        gap={2}
        data-testid="user-flow-trial-canvas-loading"
        data-generating={isGenerating}
        className={isGenerating ? glowStyles.glow : undefined}
        style={{ position: "relative", overflow: "hidden" }}
      >
        <Spinner size="sm" label="Syncing Canvas" />
        <Text type="supporting" color="secondary">Syncing the shared canvas…</Text>
      </VStack>
    );
  }

  if (store.status === "error") {
    return (
      <VStack
        width="100%"
        height="100%"
        minHeight="var(--spacing-0)"
        hAlign="center"
        vAlign="center"
        gap={2}
        data-testid="user-flow-trial-canvas-error"
      >
        <StatusDot variant="error" label="Canvas connection error" />
        <Text type="supporting" color="secondary">The shared canvas could not connect.</Text>
      </VStack>
    );
  }

  return (
    <VStack
      width="100%"
      height="100%"
      minHeight="var(--spacing-0)"
      data-testid="user-flow-trial-canvas"
    >
      {/* A flex row, not an absolute overlay: the rail -- and, when open, the
          Agents panel -- are sibling columns with their own widths, so
          Tldraw's own box (and camera/viewport) is actually narrower rather
          than merely painted-over. Canvas content near the right edge never
          ends up hidden underneath either one, and opening the panel
          visibly resizes the main canvas view instead of floating on top of
          it. */}
      <HStack gap={0} width="100%" height="100%" vAlign="stretch">
        <StackItem
          size="fill"
          crossAlignSelf="stretch"
          data-testid="user-flow-editor-host"
          data-generating={isGenerating}
          className={isGenerating ? glowStyles.glow : undefined}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <Tldraw
            store={store.store}
            onMount={onMount}
            components={tldrawComponents}
            hideUi={false}
            licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
          />
        </StackItem>
        {isAgentsOpen && effectiveAccess === "edit" ? (
          <StackItem
            data-testid="canvas-panel-anchor"
            style={{
              width: `${CANVAS_PANEL_WIDTH}px`,
              height: "100%",
              flexShrink: 0,
              backgroundColor: "var(--color-background-surface)",
              overflow: "hidden",
            }}
          >
            <VStack height="100%" style={{ overflowY: "auto" }}>
              <HStack
                vAlign="center"
                justify="between"
                style={{
                  padding: "var(--spacing-2) var(--spacing-3)",
                }}
              >
                <Text type="label" weight="medium">Agents</Text>
                <Button
                  label="Collapse Agents panel"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  icon={"×"}
                  onClick={() => setIsAgentsOpen(false)}
                />
              </HStack>
              <Divider />
              {!hasActiveDesignProfile ? (
                <DesignSystemBanner
                  roomId={roomId}
                  onResolved={() => setHasActiveDesignProfile(true)}
                />
              ) : null}
              <ScreenComposer
                roomId={roomId}
                access={effectiveAccess}
                screens={screens}
                selection={sketchSelection}
                canvasScreens={effectiveCanvasScreens}
              />
            </VStack>
          </StackItem>
        ) : null}
        <StackItem
          data-testid="canvas-rail-anchor"
          style={{
            width: `${CANVAS_RAIL_WIDTH}px`,
            height: "100%",
            flexShrink: 0,
          }}
        >
          <CanvasRail
            isAgentsOpen={isAgentsOpen}
            onToggleAgents={() => setIsAgentsOpen((open) => !open)}
          />
        </StackItem>
      </HStack>
    </VStack>
  );
}
