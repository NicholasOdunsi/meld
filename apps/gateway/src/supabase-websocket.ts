// @supabase/realtime-js resolves a WebSocket constructor when a Supabase client
// is constructed (even a DB-only client that never opens a realtime channel).
// Node exposes a native global WebSocket only from v22 on, so under the Node 20
// runtime this repo targets (see .nvmrc / package.json engines) realtime-js
// throws "Node.js 20 detected without native WebSocket support." at client
// construction. Install the `ws` implementation as the global before any client
// is built. Idempotent: on Node 22+ (and in the browser) the native global is
// left untouched.
import { WebSocket } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}
