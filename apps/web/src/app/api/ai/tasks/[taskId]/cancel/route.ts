import { cancelAITask } from "@/features/ai/task-service";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const TaskIdSchema = z.string().uuid();
const INVALID_REQUEST = "Invalid AI task request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const CANCEL_CONFLICT = "We could not cancel the AI task.";

type CancelRouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(
  _request: Request,
  context: CancelRouteContext,
) {
  const responseHeaders = new Headers();
  const supabase = await createClient(responseHeaders);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return Response.json(
      { error: AUTHENTICATION_REQUIRED },
      { status: 401, headers: responseHeaders },
    );
  }

  const parsedTaskId = TaskIdSchema.safeParse(
    (await context.params).taskId,
  );
  if (!parsedTaskId.success) {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const task = await cancelAITask(supabase, parsedTaskId.data);
    return Response.json(
      { task },
      { status: 200, headers: responseHeaders },
    );
  } catch {
    return Response.json(
      { error: CANCEL_CONFLICT },
      { status: 409, headers: responseHeaders },
    );
  }
}
