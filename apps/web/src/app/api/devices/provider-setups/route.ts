import { isDeviceFakeEnabled } from "@/features/ai/e2e-gate";
import {
  CreateProviderSetupInputSchema,
  ProviderSetupServiceError,
  createProviderSetup,
  listProviderSetupsForPairing,
} from "@/features/ai/provider-setup-service";
import { createClient } from "@/lib/supabase/server";
import { ProviderSchema } from "@meld/contracts";
import { z } from "zod";

const INVALID_REQUEST = "Invalid provider setup request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const DEVICE_NOT_FOUND = "Device not found.";
const SETUP_CONFLICT = "We could not start the provider setup.";
const LIST_CONFLICT = "We could not read the provider setups.";

const ProviderSetupDiscoverySchema = z.object({
  provider: ProviderSchema,
  createdAfter: z.string().datetime({ offset: true }),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const discovery = ProviderSetupDiscoverySchema.safeParse({
    provider: url.searchParams.get("provider"),
    createdAfter: url.searchParams.get("createdAfter"),
  });
  if (!discovery.success) {
    return Response.json({ error: INVALID_REQUEST }, { status: 400 });
  }

  if (isDeviceFakeEnabled()) {
    const fake = await import("@/features/ai/e2e-fake");
    return Response.json(
      fake.fakeListProviderSetupsForPairing(
        discovery.data.provider,
        discovery.data.createdAfter,
      ),
      { status: 200 },
    );
  }

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
    const setups = await listProviderSetupsForPairing(
      supabase,
      discovery.data.provider,
      discovery.data.createdAfter,
    );
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

  const readBody = async () => {
    try {
      return { ok: true as const, value: await request.json() };
    } catch {
      return { ok: false as const };
    }
  };

  if (isDeviceFakeEnabled()) {
    const read = await readBody();
    if (!read.ok) {
      return Response.json({ error: INVALID_REQUEST }, { status: 400 });
    }
    const parsedFake = CreateProviderSetupInputSchema.safeParse(read.value);
    if (!parsedFake.success) {
      return Response.json({ error: INVALID_REQUEST }, { status: 400 });
    }
    const fake = await import("@/features/ai/e2e-fake");
    return Response.json(fake.fakeCreateProviderSetup(parsedFake.data), {
      status: 200,
    });
  }

  const supabase = await createClient(responseHeaders);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return Response.json(
      { error: AUTHENTICATION_REQUIRED },
      { status: 401, headers: responseHeaders },
    );
  }

  const read = await readBody();
  if (!read.ok) {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  const parsed = CreateProviderSetupInputSchema.safeParse(read.value);
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
