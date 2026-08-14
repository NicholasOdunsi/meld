"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
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
import { Tldraw, type Editor, type TLUserStore } from "tldraw";
import type { TLRichText } from "@tldraw/tlschema";
import "tldraw/tldraw.css";
import type { FlowDocument } from "@meld/contracts";
import { planScreenSeeds } from "@meld/prototype";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";
import { HistoryDrawer } from "@/features/design/components/history-drawer";
import { ScreenComposer } from "@/features/design/components/screen-composer";
import type { RoomDesignScreen } from "@/features/design/design-screen-generation";
import { seedDesignScreensFromFlow } from "@/features/design/seed-design-screens";
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
  // until an editor is mounted and a screen frame with sketch content is
  // selected. Feeds the composer below so Generate/Regenerate can target the
  // selected frame with its serialized sketch layout.
  const sketchSelection = useCanvasSketchSelection(editorRef, isEditorReady);
  // The History drawer (Task 9): a right-column overlay toggled from the
  // canvas control cluster, unified conversation + design-event timeline for
  // the room, filtered to the selected screen frame when one is selected.
  const [historyOpen, setHistoryOpen] = useState(false);
  const hasSeededRef = useRef(false);
  const latestFlowRef = useRef<FlowDocument | null>(null);
  const effectiveAccessRef = useRef(effectiveAccess);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorWaiters = useRef(new Set<(editor: Editor) => void>());
  const reconciledKeyRef = useRef<string | null>(null);
  const [seededScreens, setSeededScreens] = useState<CanvasScreen[]>([]);
  const seededScreenSeedRef = useRef(false);
  // The server prop is authoritative; freshly-seeded rows layer on top until the
  // next server read. Dedupe by id so a later server read that includes the seeds
  // supersedes the local copies.
  const effectiveCanvasScreens = useMemo(() => {
    const byId = new Map<string, CanvasScreen>();
    for (const screen of canvasScreens) byId.set(screen.id, screen);
    for (const screen of seededScreens) if (!byId.has(screen.id)) byId.set(screen.id, screen);
    return Array.from(byId.values());
  }, [canvasScreens, seededScreens]);
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
      void screenId;
      router.push("?tab=prototype");
    },
    [router],
  );
  const CanvasScreenLayer = useMemo(() => {
    function CanvasScreenLayerComponent() {
      return (
        <ScreenFrameOverlay
          screens={effectiveCanvasScreens}
          onPreview={openPreview}
        />
      );
    }
    return CanvasScreenLayerComponent;
  }, [effectiveCanvasScreens, openPreview]);
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
      captureFlow();
      return () => {
        unlisten();
        if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
        if (editorRef.current === editor) editorRef.current = null;
        setIsEditorReady(false);
        if (window.__MELD_TLDRAW_TRIAL_EDITOR__ === editor) {
          delete window.__MELD_TLDRAW_TRIAL_EDITOR__;
        }
      };
    },
    [captureFlow, readOnly, scheduleCapture, trialEnabled],
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
        .map((shape) => ({
          id: shape.id,
          meldScreenId:
            typeof shape.meta.meldScreenId === "string"
              ? shape.meta.meldScreenId
              : null,
        }));
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
              }),
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
        <StackItem
          style={{
            position: "absolute",
            top: "var(--spacing-3)",
            right: "var(--spacing-3)",
            zIndex: 3,
          }}
        >
          <HStack gap={2}>
            <Button
              label="Preview prototype"
              icon={"\u25b6"}
              size="sm"
              variant="secondary"
              onClick={() => openPreview()}
            />
            <Button
              label="History"
              size="sm"
              variant={historyOpen ? "primary" : "secondary"}
              clickAction={() => setHistoryOpen((open) => !open)}
            >
              History
            </Button>
          </HStack>
        </StackItem>
        <StackItem
          style={{
            position: "absolute",
            top: "var(--spacing-0)",
            right: "var(--spacing-0)",
            height: "100%",
            zIndex: 2,
          }}
        >
          <HistoryDrawer
            roomId={roomId}
            selectedScreenId={sketchSelection?.targetScreenId ?? null}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />
        </StackItem>
        {effectiveAccess === "edit" ? (
          <StackItem
            data-testid="canvas-screen-composer-anchor"
            style={{
              position: "absolute",
              bottom: "var(--spacing-4)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2,
            }}
          >
            <Card
              padding={0}
              width="calc(var(--spacing-12) * 8)"
              maxWidth="calc(100% - var(--spacing-8))"
            >
              <ScreenComposer
                roomId={roomId}
                access={effectiveAccess}
                screens={screens}
                selection={sketchSelection}
              />
            </Card>
          </StackItem>
        ) : null}
      </StackItem>
    </VStack>
  );
}
