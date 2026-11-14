export type NativeMessage =
  | { v: 1; type: "ready"; workspaceId: string | null }
  | { v: 1; type: "notify"; title: string; body: string; path: string }
  | { v: 1; type: "shelfConnectCode"; code: string }
  | { v: 1; type: "shelfConnectFailed"; message: string }
  | ({ v: 1; type: "frame" } & FrameSnapshot)
  | ({ v: 1; type: "stream" } & StreamSnapshot);

export type FrameActivityEntry = {
  id: string;
  state: "working" | "needs_you";
  label: string;
};

export type FrameTodoStage = "todo" | "in_progress" | "done";
export type FrameTodo = {
  id: string;
  projectId: string | null;
  text: string;
  stage: FrameTodoStage;
  position: number;
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
  todos: FrameTodo[];
  // Idle entries are omitted; absence means idle.
  activity: { projects: FrameActivityEntry[]; tabs: FrameActivityEntry[] };
};

// One chat line for the native stream.
export type StreamMessageRow = {
  id: string;
  authorKind: "human" | "orion";
  authorId: string | null;
  authorName: string;
  text: string;
  createdAt: string;
  // For an Orion reply: the message it answers (drives the quoted-reply line).
  replyToId: string | null;
  delivery: "sending" | "persisted" | "failed";
};

export type StreamModelChoice = {
  provider: string;
  models: string[];
  defaultModel: string | null;
};

export type StreamSend = { canSend: true } | { canSend: false; reason: string };

// What the native project screen needs to draw one project's chat. Posted
// whenever the room's messages, Orion's task state or readiness change.
export type StreamSnapshot = {
  roomId: string;
  projectId: string;
  currentUserId: string;
  currentUserName: string;
  orionBusy: boolean;
  send: StreamSend;
  defaultProvider: string | null;
  choices: StreamModelChoice[];
  messages: StreamMessageRow[];
};

// What the native composer can ask the page to do. Registered separately from
// FrameHandlers (window.__orionStream) so the two registrations never replace
// each other.
export type StreamHandlers = {
  post: (input: {
    roomId: string;
    body: string;
    providerOverride?: string;
    modelOverride?: string;
  }) => Promise<FrameResult>;
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
  saveTodo: (input: Omit<FrameTodo, "stage">) => Promise<FrameResult>;
  moveTodos: (ids: string[], stage: FrameTodoStage) => Promise<FrameResult>;
  deleteTodos: (ids: string[]) => Promise<FrameResult>;
  setTimeZone: (zone: string) => Promise<FrameResult>;
};

export type NativeHandlers = { requestShelfConnect: () => void };

type MessageHandler = { postMessage: (message: NativeMessage) => void };
type BridgeWindow = Window & {
  webkit?: { messageHandlers?: { orion?: MessageHandler } };
  __orionNative?: NativeHandlers;
  __orionFrame?: FrameHandlers;
  __orionStream?: StreamHandlers;
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

export function registerStreamHandler(handlers: StreamHandlers): () => void {
  const target = bridgeWindow();
  if (!target) return () => {};
  target.__orionStream = handlers;
  return () => {
    if (target.__orionStream === handlers) delete target.__orionStream;
  };
}
