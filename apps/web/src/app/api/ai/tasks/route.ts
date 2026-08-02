import {
  createAITask,
  CreateAITaskInputSchema,
} from "@/features/ai/task-service";
import { createClient } from "@/lib/supabase/server";

const INVALID_REQUEST = "Invalid AI task request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const CREATE_CONFLICT = "We could not create the AI task.";

export async function POST(request: Request) {
  const responseHeaders = new Headers();
  const supabase = await createClient(responseHeaders);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return Response.json(
      { error: AUTHENTICATION_REQUIRED },
      { status: 401, headers: responseHeaders },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  const parsed = CreateAITaskInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const task = await createAITask(supabase, parsed.data);
    return Response.json(task, {
      status: 201,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: CREATE_CONFLICT },
      { status: 409, headers: responseHeaders },
    );
  }
}
