"use client";

import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { computed, createUserId, inlineBase64AssetStore, UserRecordType } from "tldraw";
import { useSync } from "@tldraw/sync";
import { Tldraw, type Editor, type TLUserStore } from "tldraw";
import "tldraw/tldraw.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCanvasGatewayUri,
  requestCanvasSession,
} from "./canvas-session";

declare global {
  interface Window {
    __MELD_TLDRAW_TRIAL_EDITOR__?: Editor;
  }
}

// tldraw's documented user palette name; keep it outside Astryx CSS styles.
const TLDRAW_TRIAL_USER_COLOR = "coral";

export function UserFlowTrialCanvas({
  organizationId,
  roomId,
  userId,
  userName,
  access,
  trialEnabled,
}: {
  organizationId: string;
  roomId: string;
  userId: string;
  userName: string;
  access: "edit" | "view";
  trialEnabled: boolean;
}) {
  const [effectiveAccess, setEffectiveAccess] = useState(access);
  const editorRef = useRef<Editor | null>(null);
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
    const nextSession = await requestCanvasSession({ organizationId, roomId });
    setEffectiveAccess(nextSession.access);
    return getCanvasGatewayUri(
      nextSession.gatewayUrl,
      roomId,
      nextSession.ticket,
    );
  }, [organizationId, roomId]);
  const store = useSync({
    uri,
    assets: inlineBase64AssetStore,
    users,
  });
  const readOnly = effectiveAccess === "view";
  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      // Keep an e2e/debug handle only inside this non-production trial surface.
      if (trialEnabled && process.env.NODE_ENV !== "production") {
        window.__MELD_TLDRAW_TRIAL_EDITOR__ = editor;
      }
      // The gateway's access claim drives the sync mode; editor mutations also
      // consult getIsReadonly before writing, so viewers remain read-only even
      // when a command is invoked programmatically.
      if (readOnly && !editor.getIsReadonly()) editor.updateInstanceState({ isReadonly: true });
      return () => {
        if (editorRef.current === editor) editorRef.current = null;
        if (window.__MELD_TLDRAW_TRIAL_EDITOR__ === editor) {
          delete window.__MELD_TLDRAW_TRIAL_EDITOR__;
        }
      };
    },
    [readOnly, trialEnabled],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (effectiveAccess === "view" && editor && !editor.getIsReadonly()) {
      editor.updateInstanceState({ isReadonly: true });
    }
  }, [effectiveAccess]);

  if (store.status === "loading") {
    return (
    <VStack width="100%" height="fill" minHeight="var(--spacing-0)" hAlign="center" vAlign="center" gap={2} data-testid="user-flow-trial-canvas-loading">
        <Spinner size="sm" label="Syncing User Flows" />
        <Text type="supporting" color="secondary">Syncing the shared canvas…</Text>
      </VStack>
    );
  }

  if (store.status === "error") {
    return (
      <VStack width="100%" height="fill" minHeight="var(--spacing-0)" hAlign="center" vAlign="center" gap={2} data-testid="user-flow-trial-canvas-error">
        <StatusDot variant="error" label="Canvas connection error" />
        <Text type="supporting" color="secondary">The shared canvas could not connect.</Text>
      </VStack>
    );
  }

  return (
    <VStack width="100%" height="fill" minHeight="var(--spacing-0)" data-testid="user-flow-trial-canvas">
      <HStack gap={1} padding={1} vAlign="center">
        <StatusDot variant="success" label="Shared live" isPulsing />
        <Text type="supporting" color="secondary">User Flows trial · shared live</Text>
      </HStack>
      <Tldraw
        store={store.store}
        onMount={onMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </VStack>
  );
}
