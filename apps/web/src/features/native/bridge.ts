export type NativeMessage =
  | { v: 1; type: "ready"; workspaceId: string | null }
  | { v: 1; type: "notify"; title: string; body: string; path: string }
  | { v: 1; type: "shelfConnectCode"; code: string }
  | { v: 1; type: "shelfConnectFailed"; message: string }
  | ({ v: 1; type: "frame" } & FrameSnapshot);

export type FrameActivityEntry = {
  id: string;
  state: "working" | "needs_you";
  label: string;
};

// What the native Orion frame (SwiftUI sidebar + project tabs) needs to draw
// itself. Posted whenever the page's data or address changes.
export type FrameSnapshot = {
  workspaceId: string;
  // The page's address relative to the site, e.g. "/<ws>/rooms/<id>?tab=prd".
  path: string;
  projects: { id: string; name: string; icon: string; color: string }[];
  tabs: { id: string; projectId: string; name: string; createdAt: string }[];
  hasTasteUpdates: boolean;
  // Idle entries are omitted; absence means idle.
  activity: { projects: FrameActivityEntry[]; tabs: FrameActivityEntry[] };
};

export type FrameResult =
  | { status: "ok"; path?: string }
  | { status: "error"; message: string };

// What the native frame can ask the page to do. The page runs these through
// the same server actions the web UI uses, so sign-in and permissions apply
// unchanged. Each call resolves to a FrameResult; "path" is where to go next.
export type FrameHandlers = {
  navigate: (path: string) => FrameResult;
  createProject: (input: { name: string; color?: string; icon?: string }) => Promise<FrameResult>;
  createTab: (projectId: string) => Promise<FrameResult>;
  renameProject: (projectId: string, name: string) => Promise<FrameResult>;
  deleteProject: (projectId: string) => Promise<FrameResult>;
};

export type NativeHandlers = { requestShelfConnect: () => void };

type MessageHandler = { postMessage: (message: NativeMessage) => void };
type BridgeWindow = Window & {
  webkit?: { messageHandlers?: { orion?: MessageHandler } };
  __orionNative?: NativeHandlers;
  __orionFrame?: FrameHandlers;
};

function bridgeWindow(): BridgeWindow | null {
  return typeof window === "undefined" ? null : (window as BridgeWindow);
}

export function postToNative(message: NativeMessage): void {
  try {
    bridgeWindow()?.webkit?.messageHandlers?.orion?.postMessage(message);
  } catch {
    // The app may be mid-reload; a lost notice is harmless.
  }
}

export function registerNativeHandlers(handlers: NativeHandlers): () => void {
  const target = bridgeWindow();
  if (!target) return () => {};
  target.__orionNative = handlers;
  return () => {
    if (target.__orionNative === handlers) delete target.__orionNative;
  };
}

export function registerFrameHandlers(handlers: FrameHandlers): () => void {
  const target = bridgeWindow();
  if (!target) return () => {};
  target.__orionFrame = handlers;
  return () => {
    if (target.__orionFrame === handlers) delete target.__orionFrame;
  };
}
