"use client";

import { VStack } from "@astryxdesign/core/VStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
  computed,
  createUserId,
  inlineBase64AssetStore,
  renderPlaintextFromRichText,
  UserRecordType,
} from "tldraw";
import { useSync } from "@tldraw/sync";
import { Tldraw, type Editor, type TLUserStore } from "tldraw";
import type { TLRichText } from "@tldraw/tlschema";
import "tldraw/tldraw.css";
import type { FlowDocument } from "@meld/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCanvasGatewayUri,
  requestCanvasSession,
} from "./canvas-session";
import { applyGeneratedFlow } from "./flow-document-to-tldraw";
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
  initialGenerationTaskId = null,
}: {
  workspaceId: string;
  roomId: string;
  userId: string;
  userName: string;
  access: "edit" | "view";
  trialEnabled: boolean;
  seedFlow?: FlowDocument | null;
  initialGenerationTaskId?: string | null;
}) {
  const [effectiveAccess, setEffectiveAccess] = useState(access);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const hasSeededRef = useRef(false);
  const latestFlowRef = useRef<FlowDocument | null>(null);
  const effectiveAccessRef = useRef(effectiveAccess);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorWaiters = useRef(new Set<(editor: Editor) => void>());
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
        <Spinner size="sm" label="Syncing User Flows" />
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
          hideUi={false}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        />
      </StackItem>
    </VStack>
  );
}
