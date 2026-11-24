import { handleSourceRequest } from "./compile-protocol";

// Source compilation and editing run off the board thread in this reused worker.
globalThis.addEventListener("message", (event: MessageEvent) => {
  const response = handleSourceRequest(event.data);
  if (response) globalThis.postMessage(response);
});
