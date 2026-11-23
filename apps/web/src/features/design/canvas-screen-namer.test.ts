import { describe, expect, it, vi } from "vitest";
import { createDeepSeekScreenNamer, parseScreenName, screenExcerpt } from "./canvas-screen-namer";

const html = (code: string) => ({ kind: "html" as const, files: { "index.html": code }, entry: "index.html" });
const reply = (content: string, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

describe("screenExcerpt", () => {
  it("keeps the words and drops styles, scripts, svg and inline data", () => {
    const code = '<style>body{color:red}</style><svg><path d="M0"/></svg><h1>VeloX</h1><img src="data:image/png;base64,AAAA"><script>alert(1)</script>';
    expect(screenExcerpt(html(code))).toBe('<h1>VeloX</h1><img src="data:">');
  });
  it("caps the length", () => {
    expect(screenExcerpt(html(`<p>${"x".repeat(9000)}</p>`)).length).toBe(4000);
  });
});

describe("parseScreenName", () => {
  it("reads a clean name", () => expect(parseScreenName('{"name":"VeloX Bike Shop"}')).toBe("VeloX Bike Shop"));
  it("tidies quotes, line breaks and trailing punctuation", () => expect(parseScreenName('{"name":"  \\"Login\\"\\n Page. "}')).toBe("Login Page"));
  it("shortens an overlong name", () => expect(parseScreenName(JSON.stringify({ name: "a".repeat(80) }))?.length).toBe(40));
  it.each(["not json", "{}", '{"name":3}', '{"name":"  "}'])("gives nothing for %s", (content) => expect(parseScreenName(content)).toBeNull());
});

describe("createDeepSeekScreenNamer", () => {
  it("asks for a JSON name and returns it", async () => {
    const fetch = vi.fn(async () => reply('{"name":"VeloX Bike Shop"}'));
    const namer = createDeepSeekScreenNamer({ apiKey: "sk-test", fetch });
    await expect(namer.name(html("<h1>VeloX</h1>"))).resolves.toBe("VeloX Bike Shop");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "deepseek-flash", response_format: { type: "json_object" } });
  });
  it("gives nothing when the model fails, errors or has no code to read", async () => {
    expect(await createDeepSeekScreenNamer({ apiKey: "k", fetch: vi.fn(async () => reply("{}", 500)) }).name(html("<p>x</p>"))).toBeNull();
    expect(await createDeepSeekScreenNamer({ apiKey: "k", fetch: vi.fn(async () => { throw new Error("offline"); }) }).name(html("<p>x</p>"))).toBeNull();
    const fetch = vi.fn();
    expect(await createDeepSeekScreenNamer({ apiKey: "k", fetch }).name(html("<style>a{}</style>"))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
