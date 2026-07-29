import {
  CreatePairingCodeInputSchema,
  createPairingCode,
} from "@/features/ai/device-service";
import { createClient } from "@/lib/supabase/server";

const INVALID_REQUEST = "Invalid pairing code request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const CREATE_CONFLICT = "We could not create the pairing code.";

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

  const parsed = CreatePairingCodeInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const pairingCode = await createPairingCode(
      supabase,
      parsed.data,
    );
    return Response.json(pairingCode, {
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
