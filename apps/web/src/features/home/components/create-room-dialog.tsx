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
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Start a Discovery Room"
        onOpenChange={onOpenChange}
        hasDivider
      />
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
    </Dialog>
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
