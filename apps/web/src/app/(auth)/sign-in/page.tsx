"use client";

import { use, useActionState, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { requestMagicLink } from "@/features/auth/actions";
import type { AuthActionState } from "@/features/auth/actions";
import { MeldAuthShell } from "@/ui/meld/auth-shell";
import { MeldBanner } from "@/ui/meld/banner";
import { MeldButton } from "@/ui/meld/button";
import { MeldForm } from "@/ui/meld/form";
import { MeldTextInput } from "@/ui/meld/text-input";
import { PixelCheck, PixelLink } from "@/ui/pixel-icons";

const INITIAL_AUTH_ACTION_STATE = {
  status: "idle",
} as const;

type AuthFeedback = {
  status: "success" | "error";
  title: string;
};

function SubmitButton({
  icon,
  isDisabled,
  label,
  nextPath,
}: {
  icon?: ReactNode;
  isDisabled?: boolean;
  label: string;
  nextPath: string;
}) {
  const { pending } = useFormStatus();

  return (
    <MeldButton
      type="submit"
      label={label}
      icon={icon}
      variant="primary"
      size="lg"
      fullWidth
      isLoading={pending}
      isDisabled={isDisabled}
      name="next"
      value={nextPath}
    />
  );
}

export function MagicLinkForm({
  state,
  action,
  nextPath,
}: {
  state: AuthActionState;
  action: (payload: FormData) => void;
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const linkSent = state.status === "success";

  return (
    <MeldForm action={action}>
      <MeldTextInput
        type="email"
        label="Email address"
        inputSize="lg"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        name="email"
        placeholder="you@example.com"
        isDisabled={linkSent}
        hint={linkSent ? "A sign-in link has already been sent." : undefined}
        errorMessage={state.fieldErrors?.email}
      />
      <SubmitButton
        // A literal link glyph for the magic *link*; once it's out, the check
        // carries "done" -- so the icon reports state rather than repeating the
        // label. (The pixel set has no wand.)
        icon={
          linkSent ? (
            <PixelCheck pack="filled" width={18} height={18} aria-hidden />
          ) : (
            <PixelLink pack="filled" width={18} height={18} aria-hidden />
          )
        }
        label={linkSent ? "Sign-in link sent" : "Send magic link"}
        nextPath={nextPath}
        isDisabled={linkSent}
      />
    </MeldForm>
  );
}

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
}) {
  const parameters = use(searchParams);
  const callbackFailed = parameters.error === "callback";
  const nextPath =
    typeof parameters.next === "string" ? parameters.next : "/";
  const [magicLinkState, magicLinkAction] = useActionState(
    requestMagicLink,
    INITIAL_AUTH_ACTION_STATE,
  );
  // Tracks whether the user has submitted yet, so a fresh magic-link result
  // replaces the `?error=callback` banner instead of stacking under it.
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const submitMagicLink = (formData: FormData) => {
    setHasSubmitted(true);
    magicLinkAction(formData);
  };
  const feedback: AuthFeedback | null = hasSubmitted
    ? magicLinkState.message
      ? {
          status: magicLinkState.status === "success" ? "success" : "error",
          title: magicLinkState.message,
        }
      : null
    : callbackFailed
      ? {
          status: "error",
          title: "We could not complete sign-in. Please try again.",
        }
      : null;

  return (
    <MeldAuthShell
      title="Your AI product workspace."
      subtitle="Sign in to your Meld account"
      banner={
        feedback ? (
          <MeldBanner status={feedback.status} title={feedback.title} />
        ) : null
      }
    >
      <MagicLinkForm
        state={magicLinkState}
        action={submitMagicLink}
        nextPath={nextPath}
      />
    </MeldAuthShell>
  );
}
