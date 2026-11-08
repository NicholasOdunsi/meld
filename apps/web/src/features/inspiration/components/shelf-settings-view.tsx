"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState } from "react";
import type { ShelfTokenView } from "../inspiration-shared";
import { createShelfConnectCode, listShelfTokens, revokeShelfToken } from "../shelf-connection";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

const ONE_SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;

function remaining(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((Date.parse(expiresAt) - now) / ONE_SECOND_MS));
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
}

export function ShelfSettingsView({ workspaceId, initialTokens }: { workspaceId: string; initialTokens: ShelfTokenView[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [revoking, setRevoking] = useState<ShelfTokenView | null>(null);

  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => setNow(Date.now()), ONE_SECOND_MS);
    return () => window.clearInterval(timer);
  }, [code]);

  // The shelf redeems the code in another app; pick up the new connection
  // when the person comes back to this tab.
  useEffect(() => {
    const onFocus = () => void listShelfTokens(workspaceId).then(setTokens);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [workspaceId]);

  async function handleConnect() {
    setError(null);
    const result = await createShelfConnectCode(workspaceId);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setNow(Date.now());
    setCode({ code: result.code, expiresAt: result.expiresAt });
  }

  async function handleDisconnect(token: ShelfTokenView) {
    const result = await revokeShelfToken(token.id);
    if (result.status === "error") setError("Couldn't disconnect. Try again.");
    setTokens(await listShelfTokens(workspaceId));
  }

  const isExpired = code !== null && Date.parse(code.expiresAt) <= now;
  const columns: TableColumn<ShelfTokenView>[] = [
    { key: "deviceName", header: "Shelf", width: proportional(2), renderCell: (token) => <Text weight="semibold">{token.deviceName}</Text> },
    { key: "createdAt", header: "Connected", width: proportional(1), renderCell: (token) => <Timestamp value={token.createdAt} format="date_time" /> },
    {
      key: "lastUsedAt",
      header: "Last used",
      width: proportional(1),
      renderCell: (token) =>
        token.lastUsedAt ? <Timestamp value={token.lastUsedAt} format="date_time" /> : <Text type="supporting">Never</Text>,
    },
    {
      key: "id",
      header: "Actions",
      width: proportional(1),
      renderCell: (token) => <Button label="Disconnect" variant="secondary" size="sm" onClick={() => setRevoking(token)} />,
    },
  ];

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={2}>Menu-bar shelf</Heading>
        <Text type="supporting">
          Open Orion Shelf from your menu bar, click Connect shelf here, then type the code into the shelf. Connecting
          again replaces the current connection.
        </Text>
      </VStack>
      {error ? <Banner status="error" title={error} /> : null}
      <HStack gap={4} align="center">
        <Button label="Connect shelf" variant="primary" onClick={() => void handleConnect()} />
        {code && !isExpired ? (
          <HStack gap={2} align="center">
            <Text type="code" size="xl">
              {code.code}
            </Text>
            <Button label="Copy code" variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(code.code)} />
            <Text type="supporting">{`Expires in ${remaining(code.expiresAt, now)}`}</Text>
          </HStack>
        ) : null}
        {isExpired ? <Text type="supporting">That code expired. Make a new one.</Text> : null}
      </HStack>
      {tokens.length > 0 ? (
        <Table data={tokens} columns={columns} idKey="id" density="balanced" dividers="rows" verticalAlign="middle" />
      ) : (
        <EmptyState title="No shelf connected" description="Connect the shelf to save images from anywhere on your Mac." />
      )}
      <ConfirmDeleteDialog
        isOpen={revoking !== null}
        count={1}
        title="Disconnect this shelf?"
        description="It stops saving right away. Images waiting on the Mac are kept until you connect again."
        confirmLabel="Disconnect shelf"
        onOpenChange={(isOpen) => {
          if (!isOpen) setRevoking(null);
        }}
        onConfirm={() => {
          if (revoking) void handleDisconnect(revoking);
        }}
      />
    </VStack>
  );
}
