import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_REDIRECT_PATH = "/";

function getApplicationOrigin() {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(configuredOrigin);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.");
  }

  return url.origin;
}

function getSafeRedirectPath(candidate: unknown) {
  if (typeof candidate !== "string" || !candidate.startsWith("/")) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const applicationOrigin = getApplicationOrigin();
    const destination = new URL(candidate, applicationOrigin);

    if (destination.origin !== applicationOrigin) {
      return DEFAULT_REDIRECT_PATH;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

const ORGANIZATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstPathSegment(destination: string, origin: string) {
  try {
    const { pathname } = new URL(destination, origin);
    return pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * A magic link freezes the `next` the user had when they requested it, which is
 * often an organization-scoped path (`/<orgId>/...`). By the time they follow
 * the link that organization may be gone, or they may never have been a member
 * — the org layout answers such a path with `notFound()`, so a *successful*
 * sign-in lands on a 404. Only honor an org-scoped `next` when the freshly
 * authenticated user can actually reach it; otherwise fall back to `/`, whose
 * canonical routing sends members to their organization and everyone else to
 * onboarding. Non-organization paths (e.g. `/onboarding`, `/products`) pass
 * through untouched.
 */
async function resolveReachableDestination(
  supabase: Awaited<ReturnType<typeof createClient>>,
  destination: string,
  origin: string,
) {
  const segment = firstPathSegment(destination, origin);
  if (!segment || !ORGANIZATION_ID_PATTERN.test(segment)) {
    return destination;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return DEFAULT_REDIRECT_PATH;
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", segment)
    .maybeSingle();

  if (error || !membership) {
    return DEFAULT_REDIRECT_PATH;
  }

  return destination;
}

function redirectWithHeaders(url: URL, headers: Headers) {
  const response = NextResponse.redirect(url);

  headers.forEach((value, name) => {
    response.headers.set(name, value);
  });

  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const destination = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const applicationOrigin = getApplicationOrigin();
  const responseHeaders = new Headers();

  if (code) {
    const supabase = await createClient(responseHeaders);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const reachable = await resolveReachableDestination(
        supabase,
        destination,
        applicationOrigin,
      );
      return redirectWithHeaders(
        new URL(reachable, applicationOrigin),
        responseHeaders,
      );
    }
  }

  const errorUrl = new URL("/sign-in", applicationOrigin);
  errorUrl.searchParams.set("error", "callback");
  return redirectWithHeaders(errorUrl, responseHeaders);
}
