import {
  CreateProviderSetupInputSchema,
  ProviderSetupServiceError,
  createProviderSetup,
  listActiveProviderSetups,
} from "@/features/ai/provider-setup-service";
import { createClient } from "@/lib/supabase/server";

const INVALID_REQUEST = "Invalid provider setup request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const DEVICE_NOT_FOUND = "Device not found.";
const SETUP_CONFLICT = "We could not start the provider setup.";
const LIST_CONFLICT = "We could not read the provider setups.";

export async function GET() {
  const responseHeaders = new Headers();
  const supabase = await createClient(responseHeaders);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return Response.json(
      { error: AUTHENTICATION_REQUIRED },
      { status: 401, headers: responseHeaders },
    );
  }

  try {
    const setups = await listActiveProviderSetups(supabase);
    return Response.json(setups, {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: LIST_CONFLICT },
      { status: 409, headers: responseHeaders },
    );
  }
}

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

  const parsed = CreateProviderSetupInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const setup = await createProviderSetup(supabase, parsed.data);
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
        { error: DEVICE_NOT_FOUND },
        { status: 404, headers: responseHeaders },
      );
    }

    return Response.json(
      { error: SETUP_CONFLICT },
      { status: 409, headers: responseHeaders },
    );
  }
}
