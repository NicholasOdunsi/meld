// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createShelfConnectCode = vi.hoisted(() => vi.fn());
vi.mock("@/features/inspiration/shelf-connection", () => ({ createShelfConnectCode }));

import { NativeBridge } from "./native-bridge";

type TestWindow = Window & { webkit?: unknown; __orionNative?: { requestShelfConnect: () => void } };

afterEach(() => {
  delete (window as TestWindow).webkit;
  vi.clearAllMocks();
});

describe("NativeBridge", () => {
  it("tells the app it is ready, then hands over a Shelf code on request", async () => {
    const postMessage = vi.fn();
    (window as TestWindow).webkit = { messageHandlers: { orion: { postMessage } } };
    createShelfConnectCode.mockResolvedValue({ status: "created", code: "ABCD-1234", expiresAt: "x" });

    render(<NativeBridge workspaceId="11111111-1111-1111-1111-111111111111" />);
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "ready", workspaceId: "11111111-1111-1111-1111-111111111111" });

    await act(async () => {
      (window as TestWindow).__orionNative?.requestShelfConnect();
    });
    expect(createShelfConnectCode).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "shelfConnectCode", code: "ABCD-1234" });
  });

  it("reports a failed code", async () => {
    const postMessage = vi.fn();
    (window as TestWindow).webkit = { messageHandlers: { orion: { postMessage } } };
    createShelfConnectCode.mockResolvedValue({ status: "error", message: "Couldn't make a code. Try again." });
    render(<NativeBridge workspaceId="11111111-1111-1111-1111-111111111111" />);
    await act(async () => {
      (window as TestWindow).__orionNative?.requestShelfConnect();
    });
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "shelfConnectFailed", message: "Couldn't make a code. Try again." });
  });

  it("renders nothing and posts nothing in a normal browser", () => {
    const { container } = render(<NativeBridge workspaceId="11111111-1111-1111-1111-111111111111" />);
    expect(container).toBeEmptyDOMElement();
  });
});
