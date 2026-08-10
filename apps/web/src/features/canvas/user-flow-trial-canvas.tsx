"use client";

import { VStack } from "@astryxdesign/core/VStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { computed, createUserId, inlineBase64AssetStore, UserRecordType } from "tldraw";
import { useSync } from "@tldraw/sync";
import { Tldraw, type Editor, type TLUserStore } from "tldraw";
import "tldraw/tldraw.css";
import { useCallback, useMemo } from "react";

declare global {
  interface Window {
    __MELD_TLDRAW_TRIAL_EDITOR__?: Editor;
  }
}

// tldraw's documented user palette name; keep it outside Astryx CSS styles.
const TLDRAW_TRIAL_USER_COLOR = "coral";

export function UserFlowTrialCanvas({
  gatewayUri,
  userId,
  userName,
  access,
}: {
  gatewayUri: string;
  userId: string;
  userName: string;
  access: "edit" | "view";
}) {
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
  const store = useSync({
    uri: gatewayUri,
    assets: inlineBase64AssetStore,
    users,
  });
  const readOnly = access === "view";
  const onMount = useCallback(
    (editor: Editor) => {
      // Keep an e2e/debug handle only inside this non-production trial surface.
      window.__MELD_TLDRAW_TRIAL_EDITOR__ = editor;
      // The gateway's access claim drives the sync mode; editor mutations also
      // consult getIsReadonly before writing, so viewers remain read-only even
      // when a command is invoked programmatically.
      if (readOnly && !editor.getIsReadonly()) editor.updateInstanceState({ isReadonly: true });
      return () => {
        if (window.__MELD_TLDRAW_TRIAL_EDITOR__ === editor) {
          delete window.__MELD_TLDRAW_TRIAL_EDITOR__;
        }
      };
    },
    [readOnly],
  );

  if (store.status === "loading") {
    return (
      <VStack width="100%" height="100%" hAlign="center" vAlign="center" gap={2} data-testid="user-flow-trial-canvas-loading">
        <Spinner size="sm" label="Syncing User Flows" />
        <Text type="supporting" color="secondary">Syncing the shared canvas…</Text>
      </VStack>
    );
  }

  if (store.status === "error") {
    return (
      <VStack width="100%" height="100%" hAlign="center" vAlign="center" gap={2} data-testid="user-flow-trial-canvas-error">
        <StatusDot variant="error" label="Canvas connection error" />
        <Text type="supporting" color="secondary">The shared canvas could not connect.</Text>
      </VStack>
    );
  }

  return (
    <VStack width="100%" height="100%" style={{ minHeight: 0 }} data-testid="user-flow-trial-canvas">
      <Tldraw
        store={store.store}
        onMount={onMount}
      />
    </VStack>
  );
}
