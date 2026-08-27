"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createWorkspaceFromForm,
  type WorkspaceFormState,
} from "@/features/workspaces/actions";
import { MeldAuthShell } from "@/ui/meld/auth-shell";
import { MeldBanner } from "@/ui/meld/banner";
import { MeldButton } from "@/ui/meld/button";
import { MeldFileDrop } from "@/ui/meld/file-drop";
import { MeldForm } from "@/ui/meld/form";
import { MeldTextInput } from "@/ui/meld/text-input";
import { PixelPlus } from "@/ui/pixel-icons";

const INITIAL_STATE: WorkspaceFormState = { status: "idle" };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function CreateWorkspaceButton() {
  const { pending } = useFormStatus();

  return (
    <MeldButton
      type="submit"
      label="Create workspace"
      icon={<PixelPlus pack="filled" width={18} height={18} aria-hidden />}
      variant="primary"
      size="lg"
      fullWidth
      isLoading={pending}
    />
  );
}

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [state, action] = useActionState(
    createWorkspaceFromForm,
    INITIAL_STATE,
  );
  const submitAction = (formData: FormData) => {
    if (logo) {
      formData.set("logo", logo);
    }
    action(formData);
  };

  return (
    <MeldAuthShell
      title="Create your workspace."
      subtitle="Add your workspace name and logo"
      banner={
        state.message ? (
          <MeldBanner
            status={state.status === "success" ? "success" : "error"}
            title={state.message}
          />
        ) : null
      }
    >
      <MeldForm action={submitAction}>
        <MeldTextInput
          label="Workspace name"
          inputSize="lg"
          value={name}
          onChange={(event) => setName(event.target.value)}
          name="name"
          placeholder="Northstar"
          errorMessage={state.fieldErrors?.name}
        />
        <MeldFileDrop
          label="Workspace logo"
          accept="image/png,image/jpeg,image/webp"
          value={logo}
          onValueChange={setLogo}
          hint="PNG, JPEG, or WebP up to 2 MB"
          errorMessage={
            state.fieldErrors?.logo ??
            (logo && logo.size > MAX_LOGO_BYTES
              ? "That file is larger than 2 MB."
              : undefined)
          }
        />
        <CreateWorkspaceButton />
      </MeldForm>
    </MeldAuthShell>
  );
}
