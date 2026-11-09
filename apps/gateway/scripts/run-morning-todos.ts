// Owner-only acceptance run. Reads env, ignores the 6–9 window with --force.
// Usage: GATEWAY_SUPABASE_URL=… GATEWAY_SUPABASE_SERVICE_ROLE_KEY=… DEEPSEEK_API_KEY=… \
//   pnpm --filter @meld/gateway exec tsx scripts/run-morning-todos.ts --force
import { createClient } from "@supabase/supabase-js";
import { createDeepSeekTodoWriter, DEEPSEEK_TODO_DEFAULT_MODEL } from "../src/morning-todos/deepseek-todo-writer";
import { createMorningRepository, runMorningTodos } from "../src/morning-todos/run-morning-todos";

const url = process.env.GATEWAY_SUPABASE_URL;
const key = process.env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!url || !key || !apiKey) {
  console.error("Set GATEWAY_SUPABASE_URL, GATEWAY_SUPABASE_SERVICE_ROLE_KEY and DEEPSEEK_API_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const reports = await runMorningTodos({
  repository: createMorningRepository(supabase as never),
  writer: createDeepSeekTodoWriter({ apiKey, model: process.env.DEEPSEEK_TEXT_MODEL || DEEPSEEK_TODO_DEFAULT_MODEL }),
  now: new Date(),
  force: process.argv.includes("--force"),
});
console.log(JSON.stringify(reports, null, 2));
