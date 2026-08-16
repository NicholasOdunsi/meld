// @vitest-environment jsdom

import {
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import {
  renderComposer,
  setupComposerTestEnvironment,
} from "./composer-test-harness";
import { describe, expect, it, vi } from "vitest";

setupComposerTestEnvironment();

const READY_AGENT: AgentReadiness = {
  ready: true,
  defaultProvider: "codex",
  defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
  providers: [
    {
      provider: "codex",
      deviceId: "d0000000-0000-4000-8000-000000000000",
      deviceName: "Ada's MacBook",
    },
  ],
};

describe("RoomComposer mentions", () => {

  it("removes a sole mention token with one Backspace from trailing text", async () => {
    const { user } = renderComposer();
    await user.click(
      screen.getByRole("button", { name: "Mention someone" }),
    );
    await user.click(screen.getByText("Research Agent"));

    const editor = screen.getByRole("combobox", { name: "Message" });
    editor.focus();
    const trailingText = editor.lastChild;
    expect(trailingText?.nodeType).toBe(Node.TEXT_NODE);
    expect(trailingText?.textContent).toBe("");
    expect(trailingText?.previousSibling?.textContent).toBe("\u00a0");
    expect(trailingText?.previousSibling?.previousSibling).toHaveAttribute(
      "data-astryx-token",
    );
    const range = document.createRange();
    range.setStart(trailingText!, trailingText?.textContent?.length ?? 0);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.anchorNode).toBe(trailingText);

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(editor.textContent).toBe("");
    expect(screen.queryByText("@Research Agent")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("composer-agent-peek"),
    ).not.toBeInTheDocument();
  });

  it("removes a sole mention token with one Backspace from a root caret", async () => {
    const { user } = renderComposer();
    await user.click(
      screen.getByRole("button", { name: "Mention someone" }),
    );
    await user.click(screen.getByText("Research Agent"));

    const editor = screen.getByRole("combobox", { name: "Message" });
    editor.focus();
    const range = document.createRange();
    range.setStart(editor, editor.childNodes.length);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.anchorNode).toBe(editor);

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(editor.textContent).toBe("");
    expect(screen.queryByText("@Research Agent")).not.toBeInTheDocument();
  });

  describe.each([
    ["Maya Chen", "blue"],
    ["Product Agent", "purple"],
    ["Research Agent", "teal"],
  ] as const)("mention token %s", (label, variant) => {
    it(`inserts the ${variant} Astryx token from the shared mention picker`, async () => {
      const { user } = renderComposer();

      await user.click(
        screen.getByRole("button", { name: "Mention someone" }),
      );
      expect(
        screen.getByRole("listbox", {
          name: "Mention a teammate or agent",
        }),
      ).toBeVisible();
      expect(
        screen.getByRole("img", { name: "Maya Chen" }),
      ).toBeVisible();
      const productAvatar = screen.getByTestId("product-agent-avatar");
      const researchAvatar = screen.getByTestId("research-agent-avatar");
      expect(productAvatar).toBeVisible();
      expect(researchAvatar).toBeVisible();
      expect(productAvatar).toHaveAttribute("data-housing", "none");
      expect(researchAvatar).toHaveAttribute("data-housing", "none");
      expect(
        within(productAvatar).getByTestId("product-agent-bot"),
      ).toHaveAttribute("data-variant", "product");
      expect(
        within(productAvatar).getByTestId("product-agent-bot"),
      ).toHaveAttribute("data-appearance", "head");
      expect(
        within(researchAvatar).getByTestId("research-agent-bot"),
      ).toHaveAttribute("data-variant", "research");
      expect(
        within(researchAvatar).getByTestId("research-agent-bot"),
      ).toHaveAttribute("data-appearance", "head");

      await user.click(screen.getByText(label));

      expect(screen.getByText(`@${label}`)).toHaveAttribute(
        "data-variant",
        variant,
      );
    });
  });

  it("typing @ opens the same teammate and agent option source", async () => {
    const { user } = renderComposer();
    const editor = screen.getByRole("combobox", { name: "Message" });

    await user.click(editor);
    await user.type(editor, "@");

    const picker = screen.getByRole("listbox", {
      name: "Mention a teammate or agent",
    });
    expect(picker).toBeVisible();
    expect(screen.getByText("Maya Chen")).toBeVisible();
    expect(screen.getByText("Product Agent")).toBeVisible();
    expect(screen.getByText("Research Agent")).toBeVisible();
  });

  it.each([
    ["Product Agent", "product"],
    ["Research Agent", "research"],
  ] as const)("shows the %s head while it is mentioned", async (label, kind) => {
    const { user } = renderComposer();

    await user.click(
      screen.getByRole("button", { name: "Mention someone" }),
    );
    await user.click(screen.getByText(label));

    const peek = screen.getByTestId("composer-agent-peek");
    expect(peek).toHaveAttribute("data-agent-kind", kind);
    expect(within(peek).getByTestId("composer-agent-peek-bot"))
      .toHaveAttribute("data-appearance", "head");
    expect(within(peek).queryByTestId("meld-bot-torso"))
      .not.toBeInTheDocument();
  });

  it("tracks the pointer horizontally and recenters when it leaves", async () => {
    const { user } = renderComposer();
    await user.click(
      screen.getByRole("button", { name: "Mention someone" }),
    );
    await user.click(screen.getByText("Product Agent"));

    const peek = screen.getByTestId("composer-agent-peek");
    vi.spyOn(peek, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      top: 0,
      right: 140,
      bottom: 40,
      left: 100,
      width: 40,
      height: 40,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(window, { clientX: 105 });
    expect(screen.getByTestId("meld-bot-eyes")).toHaveAttribute(
      "transform",
      "translate(-1 0)",
    );

    fireEvent.pointerMove(window, { clientX: 135 });
    expect(screen.getByTestId("meld-bot-eyes")).toHaveAttribute(
      "transform",
      "translate(1 0)",
    );

    fireEvent.pointerMove(window, { clientX: 10, clientY: 100 });
    expect(screen.getByTestId("meld-bot-eyes")).toHaveAttribute(
      "transform",
      "translate(0 0)",
    );
  });

  it("shows no head when more than one agent is mentioned", () => {
    renderComposer({
      value: "Ask @Product Agent and @Research Agent",
    });

    expect(
      screen.queryByTestId("composer-agent-peek"),
    ).not.toBeInTheDocument();
  });

  it("hides the agent head when the mentioned draft is sent", async () => {
    const { onSubmit, user } = renderComposer({
      agentReadiness: READY_AGENT,
    });
    await user.click(
      screen.getByRole("button", { name: "Mention someone" }),
    );
    await user.click(screen.getByText("Product Agent"));
    expect(screen.getByTestId("composer-agent-peek")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(
      screen.queryByTestId("composer-agent-peek"),
    ).not.toBeInTheDocument();
  });

});
