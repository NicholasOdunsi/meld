import { isDeviceFakeEnabled } from "@/features/ai/e2e-gate";
import {
  ProviderSetupServiceError,
  getProviderSetup,
} from "@/features/ai/provider-setup-service";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const RequestIdSchema = z.string().uuid();
const INVALID_REQUEST = "Invalid provider setup request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const SETUP_NOT_FOUND = "Provider setup not found.";
const SETUP_CONFLICT = "We could not read the provider setup.";

type ProviderSetupRouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function GET(
  _request: Request,
  context: ProviderSetupRouteContext,
) {
  const responseHeaders = new Headers();

  if (isDeviceFakeEnabled()) {
    const parsedFakeId = RequestIdSchema.safeParse(
      (await context.params).requestId,
    );
    if (!parsedFakeId.success) {
      return Response.json({ error: INVALID_REQUEST }, { status: 400 });
    }
    const fake = await import("@/features/ai/e2e-fake");
    const view = fake.fakeGetProviderSetup(parsedFakeId.data);
    if (!view) {
      return Response.json({ error: SETUP_NOT_FOUND }, { status: 404 });
    }
    return Response.json(view, { status: 200 });
  }

  const supabase = await createClient(responseHeaders);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return Response.json(
      { error: AUTHENTICATION_REQUIRED },
      { status: 401, headers: responseHeaders },
    );
  }

  const parsedRequestId = RequestIdSchema.safeParse(
    (await context.params).requestId,
  );
  if (!parsedRequestId.success) {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const setup = await getProviderSetup(supabase, parsedRequestId.data);
    return Response.json(setup, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (caught) {
    if (
      caught instanceof ProviderSetupServiceError &&
      caught.code === "not_found"
    ) {
      return Response.json(
        { error: SETUP_NOT_FOUND },
        { status: 404, headers: responseHeaders },
      );
    }

    return Response.json(
      { error: SETUP_CONFLICT },
      { status: 409, headers: responseHeaders },
    );
  }
}
