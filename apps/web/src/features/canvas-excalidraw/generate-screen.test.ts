import { describe, expect, it, vi } from "vitest";
import { GenerateError, generateScreen } from "./generate-screen";

const prompt = { system: "s", user: "u" };
const reply = (content: unknown, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: ok ? 200 : 500 }));

describe("generateScreen", () => {
  it("returns a unique screen id built from the model's key", async () => {
    const fetch = reply({ screenKey: "login", html: "<html><body>Hi</body></html>" });
    const result = await generateScreen({ prompt, apiKey: "k", model: "m", fetch });
    expect(result.screenId).toMatch(/^login-[a-z0-9]{4}$/);
    expect(result.html).toContain("Hi");
  });
  it("sends the key as a bearer token, asks for JSON, and attaches the image", async () => {
    const fetch = reply({ screenKey: "a", html: "<p>x</p>" });
    await generateScreen({ prompt, imageDataUrl: "data:image/png;base64,AAAA", apiKey: "secret", model: "m", fetch });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,AAAA");
  });
  it("maps failures to typed errors", async () => {
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply({}, false) })).rejects.toMatchObject({ code: "http" });
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply("not json") })).rejects.toMatchObject({ code: "bad_json" });
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply({ screenKey: "Bad Key", html: "<p>x</p>" }) })).rejects.toMatchObject({ code: "invalid_screen" });
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply({ screenKey: "a", html: "plain text" }) })).rejects.toBeInstanceOf(GenerateError);
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: vi.fn(async () => { throw new TypeError("down"); }) })).rejects.toMatchObject({ code: "network" });
  });
});
