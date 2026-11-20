import { handleCompileRequest } from "./compile-protocol";

// Babel runs here, off the board's thread. The worker is created the first
// time a screen goes live or code is pasted, then reused.
globalThis.addEventListener("message", (event: MessageEvent) => {
  const response = handleCompileRequest(event.data);
  if (response) globalThis.postMessage(response);
});
