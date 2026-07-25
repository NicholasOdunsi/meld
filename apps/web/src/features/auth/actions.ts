"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AuthActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    email?: string;
  };
};

const DEFAULT_REDIRECT_PATH = "/";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function getCallbackUrl(candidate: unknown) {
  const callbackUrl = new URL("/auth/callback", getApplicationOrigin());
  callbackUrl.searchParams.set("next", getSafeRedirectPath(candidate));
  return callbackUrl.toString();
}

function readEmail(formData: FormData) {
  const value = formData.get("email");
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function requestMagicLink(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readEmail(formData);

  if (!EMAIL_PATTERN.test(email)) {
    const message = "Enter a valid email address.";
    return {
      status: "error",
      message,
      fieldErrors: { email: message },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getCallbackUrl(formData.get("next")),
    },
  });

  if (error) {
    return {
      status: "error",
      message: "We could not send a sign-in link. Please try again.",
    };
  }

  return {
    status: "success",
    message: "Check your email for a secure sign-in link.",
  };
}

export async function signInWithGoogle(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getCallbackUrl(formData.get("next")),
    },
  });

  if (error || !data.url) {
    return {
      status: "error",
      message: "Google sign-in is unavailable. Please try again.",
    };
  }

  redirect(data.url);
}
