import "server-only";

import type { Provider } from "@meld/contracts";
import { fakeQueuePrdGeneration } from "@/features/discovery/e2e-fake";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";

// Queue a PRD generation against the in-memory discovery store. The status poll
// (fakeListRoomTaskStatuses) advances it queued -> running -> completed and
// materializes the PRD on completion, standing in for the connector executing
// create_prd_generate_task.
export async function fakeGeneratePrd(input: {
  roomId: string;
  provider?: Provider;
}): Promise<{ id: string; status: "queued" }> {
  if (!isDiscoveryFakeEnabled()) {
    throw new Error("Development discovery fake is disabled.");
  }
  const task = await fakeQueuePrdGeneration(input);
  return { id: task.id, status: "queued" };
}
