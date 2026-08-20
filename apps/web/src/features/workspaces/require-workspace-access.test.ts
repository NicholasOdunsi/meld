import { beforeEach, expect, it, vi } from "vitest";

// The single gate in front of five workspace routes. Every page and layout
// that guards a workspace surface delegates here, and every one of their tests
// mocks this module out -- so this file is the only place the gate's actual
// behaviour is pinned.

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  getWorkspaceShell: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock("./backend", () => ({
  getWorkspaceBackend: async () => ({
    getWorkspaceShell: mocks.getWorkspaceShell,
  }),
}));

import { requireWorkspaceAccess } from "./require-workspace-access";

beforeEach(() => {
  vi.clearAllMocks();
});

it("sends a signed-out visitor to sign-in, pointed back at the workspace home", async () => {
  mocks.getWorkspaceShell.mockResolvedValue({ status: "unauthenticated" });

  await expect(requireWorkspaceAccess(WORKSPACE_ID)).rejects.toThrow(
    `redirect:/sign-in?next=%2F${WORKSPACE_ID}`,
  );

  // The encoded string is asserted verbatim rather than rebuilt with
  // `encodeURIComponent`: a redirect that loses the `next` parameter, or
  // points at settings instead of the workspace home, is a regression a
  // test that recomputes the expected value would happily agree with.
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/sign-in?next=%2F${WORKSPACE_ID}`,
  );
  expect(mocks.notFound).not.toHaveBeenCalled();
});

it("hides a workspace the visitor is not a member of", async () => {
  mocks.getWorkspaceShell.mockResolvedValue({ status: "not-a-member" });

  await expect(requireWorkspaceAccess(WORKSPACE_ID)).rejects.toThrow(
    "not-found",
  );

  // Not a redirect to sign-in: the visitor is signed in, and telling them to
  // sign in again would confirm the workspace id exists.
  expect(mocks.notFound).toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("returns the access data for a member", async () => {
  const data = {
    currentUserId: "10000000-0000-4000-8000-000000000001",
    isAdmin: true,
    workspaceName: "Northstar",
  };
  mocks.getWorkspaceShell.mockResolvedValue({ status: "ok", data });

  await expect(requireWorkspaceAccess(WORKSPACE_ID)).resolves.toEqual(data);

  expect(mocks.getWorkspaceShell).toHaveBeenCalledWith(WORKSPACE_ID);
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.notFound).not.toHaveBeenCalled();
});
