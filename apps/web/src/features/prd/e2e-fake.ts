import "server-only";

import { randomUUID } from "node:crypto";
import type { Provider } from "@meld/contracts";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";

// Task 10 extends this fake with connector-like status advancement and PRD
// materialization. This Task 9 boundary intentionally only proves that the
// production RPC is unreachable while the existing E2E gate is enabled.
export async function fakeGeneratePrd(_input: {
  roomId: string;
  provider?: Provider;
}): Promise<{ id: string; status: "queued" }> {
  if (!isDiscoveryFakeEnabled()) {
    throw new Error("Development discovery fake is disabled.");
  }
  return { id: randomUUID(), status: "queued" };
}
