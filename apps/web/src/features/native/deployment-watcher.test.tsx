// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeploymentWatcher } from "./deployment-watcher";

const MAC = "Mozilla/5.0 OrionMac/1.0.17 OrionFrame/2";

function serve(ids: string[]) {
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: ids[Math.min(i++, ids.length - 1)] }) })));
}
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe("DeploymentWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(MAC);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("reloads once a newer deployment is live", async () => {
    serve(["dpl_1", "dpl_1", "dpl_2"]);
    const reload = vi.fn();
    render(<DeploymentWatcher reload={reload} />);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reload).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing in an ordinary browser", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Safari");
    serve(["dpl_1", "dpl_2"]);
    const reload = vi.fn();
    render(<DeploymentWatcher reload={reload} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(reload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reloads right away when a call fails because the page is out of date", async () => {
    serve(["dpl_1"]);
    const reload = vi.fn();
    render(<DeploymentWatcher reload={reload} />);
    await flush();
    const event = new Event("unhandledrejection") as Event & { reason: unknown };
    event.reason = new Error('Failed to find Server Action "abc"');
    await act(async () => { window.dispatchEvent(event); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits while someone has typed text, then reloads", async () => {
    serve(["dpl_1", "dpl_2", "dpl_2", "dpl_2"]);
    const input = document.createElement("textarea");
    document.body.append(input);
    input.focus();
    input.value = "half a message";
    const reload = vi.fn();
    render(<DeploymentWatcher reload={reload} />);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reload).not.toHaveBeenCalled();
    input.value = "";
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reload).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("never reloads twice within a minute, even if the page is still stale", async () => {
    serve(["dpl_1"]);
    const reload = vi.fn();
    render(<DeploymentWatcher reload={reload} />);
    await flush();
    const fail = () => {
      const event = new Event("unhandledrejection") as Event & { reason: unknown };
      event.reason = new Error("Failed to find Server Action");
      window.dispatchEvent(event);
    };
    await act(async () => { fail(); fail(); });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
