"use client";

import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createDiscoveryRoomFromForm,
  type DiscoveryFormState,
} from "../actions";
import type { DiscoveryRoom } from "../repository";

export function RoomList({
  organizationId,
  rooms,
  selectedRoomId,
  canCreate = true,
}: {
  organizationId: string;
  rooms: DiscoveryRoom[];
  selectedRoomId?: string;
  canCreate?: boolean;
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
    <VStack gap={4} padding={4}>
      <List
        hasDividers
        header={<Heading level={3}>Discovery Rooms</Heading>}
      >
        {rooms.map((room) => (
          <ListItem
            key={room.id}
            label={room.name}
            description="Shared discovery conversation"
            href={`/${organizationId}/discovery/${room.id}`}
            isSelected={room.id === selectedRoomId}
          />
        ))}
      </List>
      {canCreate ? (
        <form action={action}>
          <VStack gap={2}>
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
            <CreateRoomButton isDisabled={!name.trim()} />
          </VStack>
        </form>
      ) : null}
    </VStack>
  );
}

function CreateRoomButton({ isDisabled }: { isDisabled: boolean }) {
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
