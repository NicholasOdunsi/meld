// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasteDialog } from "./paste-dialog";

afterEach(cleanup);

const ok = { ok: true as const, screen: { kind: "react" as const, styles: [], scripts: [], html: "", links: [] } };

function setup(overrides: Partial<Parameters<typeof PasteDialog>[0]> = {}) {
  const props = {
    isOpen: true,
    onOpenChange: vi.fn(),
    compile: vi.fn(async () => ok),
    onCreate: vi.fn(async () => "created" as const),
    ...overrides,
  };
  render(<PasteDialog {...props} />);
  return props;
}

async function paste(code: string) {
  await userEvent.click(screen.getByLabelText("Code"));
  await userEvent.paste(code);
}

describe("PasteDialog", () => {
  it("creates a React screen at the chosen size and closes", async () => {
    const props = setup();
    await paste("export default function App() { return <main>Hi</main>; }");
    await userEvent.click(screen.getByRole("radio", { name: "Tablet" }));
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(props.compile).toHaveBeenCalledWith({ kind: "react", files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" });
    expect(props.onCreate).toHaveBeenCalledWith({
      name: "Pasted screen", formFactor: "tablet",
      source: { kind: "react", files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" },
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("creates an HTML screen with the given name", async () => {
    const props = setup();
    await paste("<main><h1>Hi</h1></main>");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Welcome");
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Welcome", formFactor: "mobile", source: expect.objectContaining({ kind: "html" }) }));
  });

  it("lists unsupported packages and creates nothing", async () => {
    const props = setup({ compile: vi.fn(async () => ({ ok: false as const, errors: [{ file: "App.tsx", message: "Unsupported package: framer-motion" }] })) });
    await paste('import { motion } from "framer-motion";\nexport default function App() { return <motion.div />; }');
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(await screen.findByText("Unsupported package: framer-motion")).toBeInTheDocument();
    expect(screen.getByText("This code can't run yet")).toBeInTheDocument();
    expect(props.onCreate).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("explains a paste that isn't code without compiling", async () => {
    const props = setup();
    await paste("make me a login page");
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(screen.getByText("This doesn't look like React or HTML. Paste a React component or an HTML page.")).toBeInTheDocument();
    expect(props.compile).not.toHaveBeenCalled();
  });

  it("keeps the code when saving fails", async () => {
    const props = setup({ onCreate: vi.fn(async () => "error" as const) });
    await paste("<p>x</p>");
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(await screen.findByText("Could not save this screen. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Code")).toHaveValue("<p>x</p>");
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});
