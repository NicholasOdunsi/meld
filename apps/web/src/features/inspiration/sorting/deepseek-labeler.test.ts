import { describe, expect, it, vi } from "vitest";
import { LabelerError, createDeepSeekLabeler } from "./deepseek-labeler";

const LABELS = {
  device: "web",
  screenType: "pricing",
  patterns: ["cards"],
  theme: "light",
  colors: ["#ffffff", "#111827"],
  styleWords: ["clean"],
  description: "Three tiers side by side; the middle one is raised and highlighted.",
};

function reply(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

describe("createDeepSeekLabeler", () => {
  it("sends the image as a data URL in JSON mode and parses the labels", async () => {
    const fetch = vi.fn(async () => reply(JSON.stringify(LABELS)));
    const labeler = createDeepSeekLabeler({ apiKey: "sk-test", model: "deepseek-flash", fetch });

    await expect(labeler.label(new Uint8Array([1, 2, 3]), "image/png")).resolves.toEqual(LABELS);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "deepseek-flash", temperature: 0, response_format: { type: "json_object" } });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } });
    expect(labeler.model).toBe("deepseek-flash");
  });

  it.each([
    ["http", () => reply("{}", 500)],
    ["bad_json", () => reply("not json")],
    ["invalid_labels", () => reply(JSON.stringify({ ...LABELS, device: "watch" }))],
  ] as const)("fails with %s", async (code, response) => {
    const labeler = createDeepSeekLabeler({ apiKey: "k", model: "m", fetch: vi.fn(async () => response()) });
    await expect(labeler.label(new Uint8Array([1]), "image/png")).rejects.toMatchObject({ code });
  });

  it("maps a thrown fetch to network and an abort to timeout", async () => {
    const network = createDeepSeekLabeler({ apiKey: "k", model: "m", fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    await expect(network.label(new Uint8Array([1]), "image/png")).rejects.toMatchObject({ code: "network" });
    const timeout = createDeepSeekLabeler({
      apiKey: "k",
      model: "m",
      fetch: vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }),
    });
    await expect(timeout.label(new Uint8Array([1]), "image/png")).rejects.toBeInstanceOf(LabelerError);
    await expect(timeout.label(new Uint8Array([1]), "image/png")).rejects.toMatchObject({ code: "timeout" });
  });
});
