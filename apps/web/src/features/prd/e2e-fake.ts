import "server-only";

import type { PrdAssistScopeSection, Provider } from "@meld/contracts";
import {
  fakeApplyPrdProposal as applyFakePrdProposal,
  fakeAssistPrdSection as assistFakePrdSection,
  fakeDiscardPrdProposal as discardFakePrdProposal,
  fakeListRoomPrdProposals as listFakeRoomPrdProposals,
  fakeQueuePrdGeneration,
  fakeQueuePrdSectionRevision as queueFakePrdSectionRevision,
} from "@/features/discovery/e2e-fake";
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

// A revision materializes the next PRD version exactly like a generation, so the
// fake reuses the generation queue: the poll advances it and bumps the version.
export async function fakeRevisePrd(input: {
  roomId: string;
  sourceTaskId: string;
  provider?: Provider;
}): Promise<{ id: string; status: "queued" }> {
  if (!isDiscoveryFakeEnabled()) {
    throw new Error("Development discovery fake is disabled.");
  }
  const task = await fakeQueuePrdGeneration({
    roomId: input.roomId,
    provider: input.provider,
  });
  return { id: task.id, status: "queued" };
}

export async function fakeQueuePrdSectionRevision(input: {
  roomId: string;
  field: string;
  sectionLabel: string;
  instruction: string;
  quotedText: string | null;
  provider?: Provider;
}): Promise<{ id: string; status: "queued" }> {
  if (!isDiscoveryFakeEnabled()) {
    throw new Error("Development discovery fake is disabled.");
  }
  return queueFakePrdSectionRevision(input);
}

// The status poll advances this queued -> running -> settled and materializes
// whichever of the four outcomes the instruction's fixture phrase names,
// standing in for the connector plus materialize_prd_assist_outcome.
export async function fakeAssistPrdSection(input: {
  roomId: string;
  clientRequestId: string;
  sections: PrdAssistScopeSection[];
  instruction: string;
  provider?: Provider;
}): Promise<{ taskId: string; requestId: string }> {
  if (!isDiscoveryFakeEnabled()) {
    throw new Error("Development discovery fake is disabled.");
  }
  return assistFakePrdSection(input);
}

export function fakeListPrdProposals(roomId: string) {
  return listFakeRoomPrdProposals(roomId);
}

export function fakeApplyPrdProposal(input: {
  roomId: string;
  proposalId: string;
}) {
  return applyFakePrdProposal(input);
}

export function fakeDiscardPrdProposal(input: {
  roomId: string;
  proposalId: string;
}) {
  return discardFakePrdProposal(input);
}
