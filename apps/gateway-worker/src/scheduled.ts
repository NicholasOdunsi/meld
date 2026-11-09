import {
  createDeepSeekTodoWriter,
  createMorningRepository,
  createTaskRepository,
  DEEPSEEK_TODO_DEFAULT_MODEL,
  runMorningTodos,
} from "@meld/gateway/core";
import { createSupabase, type Env } from "./env";

// Hourly. Keeps the free Supabase project awake, and writes the owner's
// morning to-dos once a day between 6:00 and 9:59 their time.
export async function handleScheduled(
  env: Env,
  deps: { now?: () => Date; fetch?: typeof fetch } = {},
): Promise<void> {
  const supabase = createSupabase(env);
  await createTaskRepository(supabase).getAiTaskLeaseSeconds();
  if (!env.DEEPSEEK_API_KEY) return;
  try {
    await runMorningTodos({
      repository: createMorningRepository(supabase as never),
      writer: createDeepSeekTodoWriter({
        apiKey: env.DEEPSEEK_API_KEY,
        model: env.DEEPSEEK_TEXT_MODEL || DEEPSEEK_TODO_DEFAULT_MODEL,
        fetch: deps.fetch,
      }),
      now: (deps.now ?? (() => new Date()))(),
    });
  } catch {
    console.error("morning to-dos run failed");
  }
}
