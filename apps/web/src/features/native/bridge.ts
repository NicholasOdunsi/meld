export type NativeMessage =
  | { v: 1; type: "ready"; workspaceId: string | null }
  | { v: 1; type: "notify"; title: string; body: string; path: string }
  | { v: 1; type: "shelfConnectCode"; code: string }
  | { v: 1; type: "shelfConnectFailed"; message: string };

export type NativeHandlers = { requestShelfConnect: () => void };

type MessageHandler = { postMessage: (message: NativeMessage) => void };
type BridgeWindow = Window & {
  webkit?: { messageHandlers?: { orion?: MessageHandler } };
  __orionNative?: NativeHandlers;
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
