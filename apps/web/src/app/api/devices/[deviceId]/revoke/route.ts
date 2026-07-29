import {
  DeviceServiceError,
  revokeDevice,
} from "@/features/ai/device-service";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const DeviceIdSchema = z.string().uuid();
const INVALID_REQUEST = "Invalid device request.";
const AUTHENTICATION_REQUIRED = "Authentication required.";
const DEVICE_NOT_FOUND = "Device not found.";
const REVOKE_CONFLICT = "We could not revoke the device.";

type RevokeRouteContext = {
  params: Promise<{ deviceId: string }>;
};

export async function POST(
  _request: Request,
  context: RevokeRouteContext,
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

  const parsedDeviceId = DeviceIdSchema.safeParse(
    (await context.params).deviceId,
  );
  if (!parsedDeviceId.success) {
    return Response.json(
      { error: INVALID_REQUEST },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    await revokeDevice(supabase, parsedDeviceId.data);
    return new Response(null, {
      status: 204,
      headers: responseHeaders,
    });
  } catch (caught) {
    if (
      caught instanceof DeviceServiceError &&
      caught.code === "invalid_execution_device"
    ) {
      return Response.json(
        { error: DEVICE_NOT_FOUND },
        { status: 404, headers: responseHeaders },
      );
    }

    return Response.json(
      { error: REVOKE_CONFLICT },
      { status: 409, headers: responseHeaders },
    );
  }
}
