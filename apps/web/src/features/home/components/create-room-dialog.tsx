"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createDiscoveryRoomFromForm,
  type DiscoveryFormState,
} from "@/features/discovery/actions";

export function CreateRoomDialog({
  organizationId,
  isOpen,
  onOpenChange,
}: {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  // The Astryx Dialog hides rather than unmounts on close, so a failed
  // submit would otherwise leave the stale error message and typed room
  // name in place the next time the dialog opens. useActionState has no
  // reset method, so a closed-to-open transition instead bumps a key that
  // remounts the form beneath the dialog, giving both the typed name and
  // the action state a fresh start. Mirrors the wasOpen prop-mirror
  // detection in UploadDialog.
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [resetKey, setResetKey] = useState(0);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setResetKey((key) => key + 1);
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Start a Discovery Room"
        onOpenChange={onOpenChange}
        hasDivider
      />
      <CreateRoomForm key={resetKey} organizationId={organizationId} />
    </Dialog>
  );
}

function CreateRoomForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, action] = useActionState(
    createDiscoveryRoomFromForm,
    { status: "idle" } satisfies DiscoveryFormState,
  );

  useEffect(() => {
    if (state.status === "success" && state.roomId) {
      router.push(`/${organizationId}/discovery/${state.roomId}`);
      router.refresh();
    }
  }, [organizationId, router, state.roomId, state.status]);

  return (
    <form action={action}>
      <VStack gap={4}>
        <input
          type="hidden"
          name="organizationId"
          value={organizationId}
        />
        <TextInput
          label="Room name"
          value={name}
          onChange={setName}
          htmlName="name"
          placeholder="Customer interviews"
          status={
            state.message
              ? { type: "error", message: state.message }
              : undefined
          }
        />
        <SubmitButton isDisabled={!name.trim()} />
      </VStack>
    </form>
  );
}

function SubmitButton({ isDisabled }: { isDisabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      label="Create room"
      variant="primary"
      isDisabled={isDisabled}
      isLoading={pending}
    />
  );
}
