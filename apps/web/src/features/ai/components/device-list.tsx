"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import {
  Dialog,
  DialogHeader,
} from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  proportional,
  Table,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type { DeviceSummary } from "../device-service";

interface DeviceRow extends Record<string, unknown>, DeviceSummary {}

function providerLabel(provider: string) {
  return provider === "codex" ? "Codex" : "Claude";
}

function providerPresentation(
  provider: DeviceSummary["providers"][number],
) {
  if (
    provider.installation === "installed" &&
    provider.authentication === "authenticated" &&
    provider.compatibility === "supported"
  ) {
    return {
      label: "Connected",
      variant: "success" as const,
    };
  }

  if (
    provider.installation === "failed" ||
    provider.compatibility === "unavailable"
  ) {
    return {
      label: "Unavailable",
      variant: "error" as const,
    };
  }

  return {
    label:
      provider.authentication === "signed_out"
        ? "Sign in required"
        : "Needs attention",
    variant: "warning" as const,
  };
}

const columns: TableColumn<DeviceRow>[] = [
  {
    key: "name",
    header: "Device",
    width: proportional(2),
    renderCell: (device) => (
      <VStack gap={1}>
        <Text weight="semibold">{device.name}</Text>
        <Text type="supporting">{device.platform}</Text>
      </VStack>
    ),
  },
  {
    key: "connectorVersion",
    header: "Connector",
    width: proportional(1),
    renderCell: (device) => (
      <Text>{device.connectorVersion ?? "Unknown"}</Text>
    ),
  },
  {
    key: "lastSeenAt",
    header: "Last seen",
    width: proportional(1),
    renderCell: (device) =>
      device.lastSeenAt ? (
        <Timestamp value={device.lastSeenAt} format="date_time" />
      ) : (
        <Text type="supporting">Never</Text>
      ),
  },
  {
    key: "providers",
    header: "Providers",
    width: proportional(2),
    renderCell: (device) => (
      <VStack gap={2}>
        {device.providers.map((provider) => {
          const presentation = providerPresentation(provider);
          return (
            <HStack
              key={provider.provider}
              gap={2}
              vAlign="center"
            >
              <StatusDot
                variant={presentation.variant}
                label={`${providerLabel(provider.provider)} ${presentation.label}`}
              />
              <Text>
                {providerLabel(provider.provider)} ·{" "}
                {presentation.label}
              </Text>
            </HStack>
          );
        })}
      </VStack>
    ),
  },
  {
    key: "id",
    header: "Actions",
    width: proportional(1),
    renderCell: () => null,
  },
];

export function DeviceList({
  devices: initialDevices,
  isFake = false,
}: {
  devices: DeviceSummary[];
  isFake?: boolean;
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [revokeTarget, setRevokeTarget] =
    useState<DeviceSummary | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(
    null,
  );

  async function confirmRevoke() {
    if (!revokeTarget) {
      return;
    }

    try {
      if (!isFake) {
        const response = await fetch(
          `/api/devices/${revokeTarget.id}/revoke`,
          { method: "POST" },
        );

        if (!response.ok) {
          throw new Error("Device revoke failed");
        }
      }

      setDevices((current) =>
        current.filter((device) => device.id !== revokeTarget.id),
      );
      setRevokeTarget(null);
      setIsRevoking(false);
      setRevokeError(null);
    } catch {
      setIsRevoking(false);
      setRevokeError(
        "We could not revoke this device. Please try again.",
      );
    }
  }

  const deviceColumns: TableColumn<DeviceRow>[] = columns.map(
    (column) =>
      column.key === "id"
        ? {
            ...column,
            renderCell: (device) => (
              <Button
                label="Revoke"
                size="sm"
                variant="destructive"
                onClick={() => {
                  setIsRevoking(false);
                  setRevokeError(null);
                  setRevokeTarget(device);
                }}
              />
            ),
          }
        : column,
  );

  return (
    <>
      {devices.length > 0 ? (
        <Table
          data={devices}
          columns={deviceColumns}
          idKey="id"
          density="balanced"
          dividers="rows"
          hasHover
          verticalAlign="middle"
        />
      ) : (
        <EmptyState
          title="No connected devices"
          description="Connect this Mac to run Codex or Claude tasks from Meld."
          headingLevel={3}
        />
      )}

      {revokeTarget ? (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setRevokeTarget(null);
              setIsRevoking(false);
              setRevokeError(null);
            }
          }}
          purpose="form"
        >
          <Layout
            height="auto"
            header={
              <DialogHeader
                title={
                  isRevoking
                    ? "Revoking device…"
                    : `Revoke ${revokeTarget.name}?`
                }
                onOpenChange={() => {
                  setRevokeTarget(null);
                  setIsRevoking(false);
                  setRevokeError(null);
                }}
              />
            }
            footer={
              <LayoutFooter hasDivider>
                <HStack gap={2} hAlign="end">
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onClick={() => {
                      setRevokeTarget(null);
                      setIsRevoking(false);
                      setRevokeError(null);
                    }}
                  />
                  <Button
                    label="Revoke device"
                    variant="destructive"
                    onClick={() => setIsRevoking(true)}
                    clickAction={confirmRevoke}
                  />
                </HStack>
              </LayoutFooter>
            }
          >
            <LayoutContent>
              <VStack gap={3}>
                <Text>
                  This device stops running tasks immediately and must be
                  paired again before it can run another task.
                </Text>
                {revokeError ? (
                  <Banner
                    status="error"
                    title="Could not revoke device"
                    description={revokeError}
                  />
                ) : null}
              </VStack>
            </LayoutContent>
          </Layout>
        </Dialog>
      ) : null}
    </>
  );
}
