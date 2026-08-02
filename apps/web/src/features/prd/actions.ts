"use server";

import type { Provider } from "@meld/contracts";
import { ProviderSchema } from "@meld/contracts";
import { z } from "zod";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";
import { createPrdGenerateTask } from "./create-prd-generate-task";

const GeneratePrdInputSchema = z.object({
  roomId: z.string().uuid(),
  provider: ProviderSchema.optional(),
}).strict();

export type GeneratePrdResult =
  | { status: "queued"; taskId: string }
  | { status: "error"; message: string };

export async function generatePrd(input: {
  roomId: string;
  provider?: Provider;
}): Promise<GeneratePrdResult> {
  const parsed = GeneratePrdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const task = isDiscoveryFakeEnabled()
      ? await (await import("./e2e-fake")).fakeGeneratePrd(parsed.data)
      : await createPrdGenerateTask(parsed.data);
    return { status: "queued", taskId: task.id };
  } catch {
    return {
      status: "error",
      message: "Could not start PRD generation.",
    };
  }
}
