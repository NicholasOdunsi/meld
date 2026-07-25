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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const destination = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const applicationOrigin = getApplicationOrigin();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(destination, applicationOrigin));
    }
  }

  const errorUrl = new URL("/sign-in", applicationOrigin);
  errorUrl.searchParams.set("error", "callback");
  return NextResponse.redirect(errorUrl);
}
