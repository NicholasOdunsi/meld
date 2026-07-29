// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceSummary } from "../device-service";
import { DeviceList } from "./device-list";

const DEVICE: DeviceSummary = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Ada's MacBook",
  platform: "macOS 15.6",
  status: "active",
  connectorVersion: "1.2.3",
  lastSeenAt: "2026-07-29T11:45:00.000Z",
  createdAt: "2026-07-28T12:00:00.000Z",
  providers: [
    {
      provider: "claude",
      installation: "installed",
      version: "1.0.40",
      authentication: "authenticated",
      compatibility: "supported",
      lastSeenAt: "2026-07-29T11:44:00.000Z",
    },
  ],
};

describe("DeviceList", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows device metadata and provider status", () => {
    render(<DeviceList devices={[DEVICE]} />);

    const row = screen.getByRole("row", { name: /Ada's MacBook/i });
    expect(row).toHaveTextContent("Ada's MacBook");
    expect(row).toHaveTextContent("macOS 15.6");
    expect(row).toHaveTextContent("1.2.3");
    expect(row).toHaveTextContent(/Jul 29, 2026/i);
    expect(row).toHaveTextContent("Claude");
    expect(row).toHaveTextContent("Connected");
  });

  it("confirms the consequence before revoking and removes the device", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<DeviceList devices={[DEVICE]} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Ada's MacBook");
    expect(dialog).toHaveTextContent(/stops running tasks/i);
    expect(dialog).toHaveTextContent(/must be paired again/i);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Revoke device" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/devices/${DEVICE.id}/revoke`,
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Ada's MacBook")).not.toBeInTheDocument();
    });
  });
});
