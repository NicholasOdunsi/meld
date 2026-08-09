import "server-only";

import {
  resolveAgentReadiness,
  type AgentReadiness,
} from "@/features/ai/agent-readiness";
import { createClient } from "@/lib/supabase/server";

// Server Components must read readiness directly. Calling a `use server`
// action during their initial render can be rejected as a Server Function
// invocation, leaving the model picker without its initial state.
export async function getCurrentAgentReadiness(): Promise<AgentReadiness> {
  const supabase = await createClient(new Headers());
  return resolveAgentReadiness(supabase);
}
