"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { verifyEmailCode } from "@/features/auth/actions";
import type { AuthActionState } from "@/features/auth/actions";

const INITIAL_STATE: AuthActionState = { status: "idle" };

function SignInButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" label="Sign in" variant="primary" size="lg" width="100%" isLoading={pending} />;
}

export function EmailCodeForm({ email, nextPath }: { email: string; nextPath: string }) {
  const [state, action] = useActionState(verifyEmailCode, INITIAL_STATE);
  const [code, setCode] = useState("");

  return (
    <form action={action}>
      <FormLayout>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={nextPath} />
        <TextInput
          label="6-digit code"
          size="lg"
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          htmlName="code"
          placeholder="123456"
        />
        {state.status === "error" && state.message ? <Banner status="error" title={state.message} /> : null}
        <SignInButton />
      </FormLayout>
    </form>
  );
}
