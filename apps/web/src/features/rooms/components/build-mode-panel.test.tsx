// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildModeChoice, BuildModeSummary } from "./build-mode-panel";
import type { StreamBuild } from "@/features/native/bridge";

afterEach(cleanup);

const build: StreamBuild = {
  id: "build", status: "needs_you", offline: false, branch: "orion/add-login",
  step: "Working on your request", reply: "The login page is ready.",
  changedFiles: [{ path: "login.ts", added: 10, removed: 2 }],
  approval: { id: "current", summary: "Run the login test", choices: [{ id: "accept", label: "Approve" }, { id: "decline", label: "Decline" }] },
};

describe("Build mode panel", () => {
  it("accepts a pending request once and can show changed files", async () => {
    const approve = vi.fn(async () => {});
    render(<BuildModeSummary build={build} sendApproval={approve} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(approve).toHaveBeenCalledOnce());
    expect(approve).toHaveBeenCalledWith("current", "accept");
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("login.ts")).toBeInTheDocument();
    expect(screen.getByText("+10 −2")).toBeInTheDocument();
  });

  it("shows the saved build while the Mac is offline", () => {
    render(<BuildModeSummary build={{ ...build, offline: true }} sendApproval={vi.fn()} />);
    expect(screen.getByText(/linked Mac is offline/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
  });

  it("asks before building when the router is unsure", () => {
    const start = vi.fn();
    const answer = vi.fn();
    render(<BuildModeChoice stage="unsure" linked busy={false} onBuild={start} onAnswer={answer} onLink={vi.fn()} />);
    expect(screen.getByText("Build this?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Answer instead" }));
    expect(answer).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
});
