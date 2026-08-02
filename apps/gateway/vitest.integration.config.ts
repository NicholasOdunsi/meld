import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    // Install the WebSocket global @supabase/realtime-js needs on Node 20,
    // before any test constructs a Supabase client.
    setupFiles: ["./src/supabase-websocket.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
