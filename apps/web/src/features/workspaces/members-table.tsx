"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  proportional,
  Table,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  retryInvitationDeliveryFromForm,
  revokeInvitationFromForm,
  type WorkspaceFormState,
} from "./actions";
import { getRoleBadgeVariant } from "./product-roles";

export interface MemberRow extends Record<string, unknown> {
  id: string;
  email: string;
  role: string;
  state: string;
  stateVariant: "success" | "warning" | "error" | "neutral";
  expiration: string;
  workspaceId: string;
  invitationId?: string;
  canRetry: boolean;
  canRevoke: boolean;
}

const INITIAL_STATE: WorkspaceFormState = { status: "idle" };

function RowActionButton({
  label,
  destructive = false,
}: {
  label: string;
  destructive?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      label={label}
      size="sm"
      variant={destructive ? "destructive" : "secondary"}
      isLoading={pending}
    />
  );
}

function RetryForm({ row }: { row: MemberRow }) {
  const router = useRouter();
  const [state, action] = useActionState(
    retryInvitationDeliveryFromForm,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status !== "idle") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={action}>
      <input
        type="hidden"
        name="workspaceId"
        value={row.workspaceId}
      />
      <input
        type="hidden"
        name="invitationId"
        value={row.invitationId}
      />
      <RowActionButton label="Retry" />
    </form>
  );
}

function RevokeForm({ row }: { row: MemberRow }) {
  const router = useRouter();
  const [state, action] = useActionState(
    revokeInvitationFromForm,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Revoke this invitation? A future invite will use a new link.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input
        type="hidden"
        name="workspaceId"
        value={row.workspaceId}
      />
      <input
        type="hidden"
        name="invitationId"
        value={row.invitationId}
      />
      <RowActionButton label="Revoke" destructive />
    </form>
  );
}

const columns: TableColumn<MemberRow>[] = [
  {
    key: "email",
    header: "Person",
    width: proportional(2),
  },
  {
    key: "role",
    header: "Role",
    width: proportional(1),
    renderCell: (row) => (
      <Badge
        variant={getRoleBadgeVariant(row.role)}
        label={row.role}
      />
    ),
  },
  {
    key: "state",
    header: "State",
    width: proportional(1),
    renderCell: (row) => (
      <HStack gap={2} vAlign="center">
        <StatusDot variant={row.stateVariant} label={row.state} />
        <Text>{row.state}</Text>
      </HStack>
    ),
  },
  {
    key: "expiration",
    header: "Expires",
    width: proportional(1),
  },
  {
    key: "id",
    header: "Actions",
    width: proportional(1),
    renderCell: (row) => (
      <HStack gap={2} wrap="wrap">
        {row.canRetry ? <RetryForm row={row} /> : null}
        {row.canRevoke ? <RevokeForm row={row} /> : null}
        {!row.canRetry && !row.canRevoke ? (
          <Text type="supporting">—</Text>
        ) : null}
      </HStack>
    ),
  },
];

export function MembersTable({ rows }: { rows: MemberRow[] }) {
  return (
    <Table
      data={rows}
      columns={columns}
      idKey="id"
      density="balanced"
      dividers="rows"
      hasHover
      verticalAlign="middle"
    />
  );
}
