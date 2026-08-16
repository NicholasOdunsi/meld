// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import {
  renderComposer,
  selectEditorSubstring,
  selectEditorText,
  setupComposerTestEnvironment,
} from "./composer-test-harness";
import { describe, expect, it, vi } from "vitest";

setupComposerTestEnvironment();

describe("RoomComposer chrome and formatting", () => {

  it("renders compact attachment, formatting, mention, and plain arrow-up send actions", () => {
    renderComposer();

    expect(
      screen.getByRole("button", { name: "Add files or images" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Formatting" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Mention someone" }),
    ).toBeVisible();
    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeVisible();
    // The send icon is the pixel-art arrow-up glyph (polygons, not a single
    // path) -- assert it renders rather than pinning its exact geometry.
    expect(sendButton.querySelector("svg polygon")).toBeInTheDocument();
  });

  it("morphs into the Markdown toolbar without losing the draft", async () => {
    const { user } = renderComposer({ value: "Customer evidence" });

    await user.click(
      screen.getByRole("button", { name: "Formatting" }),
    );

    expect(
      screen.getByRole("toolbar", { name: "Format message" }),
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Message" }),
    ).toHaveTextContent("Customer evidence");
    expect(
      screen.getByRole("button", { name: "Formatting" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("bolds the active selection and returns focus to the editor", async () => {
    const onChange = vi.fn();
    const { user } = renderComposer({
      value: "Customer evidence",
      onChange,
    });
    await user.click(
      screen.getByRole("button", { name: "Formatting" }),
    );
    const editor = screen.getByRole("combobox", { name: "Message" });
    editor.focus();
    selectEditorText(editor, 0, 8);

    await user.click(screen.getByRole("button", { name: "Bold" }));

    expect(onChange).toHaveBeenCalledWith("**Customer** evidence");
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("formats every selected line as a bulleted list", async () => {
    const onChange = vi.fn();
    const { user } = renderComposer({
      value: "First\nSecond",
      onChange,
    });
    await user.click(
      screen.getByRole("button", { name: "Formatting" }),
    );
    const editor = screen.getByRole("combobox", { name: "Message" });
    editor.focus();
    selectEditorText(editor, 0, "First\nSecond".length);

    await user.click(
      screen.getByRole("button", { name: "Bulleted list" }),
    );

    expect(onChange).toHaveBeenCalledWith("- First\n- Second");
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("preserves mention token DOM when formatting adjacent text", async () => {
    const onChange = vi.fn();
    const { user } = renderComposer({ onChange });

    await user.click(
      screen.getByRole("button", { name: "Mention someone" }),
    );
    await user.click(screen.getByText("Product Agent"));

    const editor = screen.getByRole("combobox", { name: "Message" });
    await user.type(editor, " evidence");
    await user.click(
      screen.getByRole("button", { name: "Formatting" }),
    );
    selectEditorSubstring(editor, "evidence");

    await user.click(screen.getByRole("button", { name: "Bold" }));

    const mentionBadge = screen.getByText("@Product Agent");
    expect(mentionBadge).toHaveAttribute(
      "data-variant",
      "purple",
    );
    expect(
      mentionBadge.closest("[data-astryx-token]"),
    ).toBeInTheDocument();
    expect(editor).toHaveTextContent("@Product Agent **evidence**");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.stringContaining("**evidence**"),
    );
  });

});
