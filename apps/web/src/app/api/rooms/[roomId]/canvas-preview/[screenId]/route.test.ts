import { beforeEach, describe, expect, it, vi } from "vitest";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/features/canvas-excalidraw/room-board-actions", () => ({ readRoomExcalidrawBoard: read }));

import { GET } from "./route";

const roomId = "00000000-0000-4000-8000-000000000001";
const params = (screenId: string) => ({ params: Promise.resolve({ roomId, screenId }) });

describe("interactive canvas preview", () => {
  beforeEach(() => read.mockReset());

  it("serves a participant's screen in an isolated document", async () => {
    read.mockResolvedValue({ status: "ok", revision: 1, elements: [], screens: [{ id: "welcome", rev: 1, html: "<h1>Hello</h1><script>window.ready=true</script>" }] });
    const response = await GET(new Request("http://localhost/"), params("welcome"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Hello</h1>");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox allow-scripts");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'none'");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("serves a saved snapshot in the static sandbox", async () => {
    read.mockResolvedValue({ status: "ok", revision: 1, elements: [], screens: [
      { id: "welcome", rev: 2, html: "<h1>Picture</h1><script>window.ready=true</script>", snapshot: true },
    ] });
    const response = await GET(new Request("http://localhost/"), params("welcome"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Picture</h1>");
    expect(response.headers.get("Content-Security-Policy")).toMatch(/^sandbox; .*script-src 'none'/);
  });

  it("does not reveal missing or inaccessible boards", async () => {
    read.mockResolvedValue({ status: "error" });
    expect((await GET(new Request("http://localhost/"), params("welcome"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/"), params("Bad Id"))).status).toBe(404);
  });
});
