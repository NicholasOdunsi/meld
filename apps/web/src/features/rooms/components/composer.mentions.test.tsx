// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import {
  renderComposer,
  setupComposerTestEnvironment,
} from "./composer-test-harness";
import { describe, expect, it } from "vitest";

setupComposerTestEnvironment();

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
      expect(
        screen.getByTestId("product-agent-avatar"),
      ).toBeVisible();
      expect(
        screen.getByTestId("research-agent-avatar"),
      ).toBeVisible();

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

});
