// @vitest-environment jsdom

import { act, screen, waitFor } from "@testing-library/react";
import { MAX_COMPOSER_ATTACHMENTS } from "./composer-model";
import {
  getFileInput,
  imageFile,
  pdfFile,
  renderComposer,
  setupComposerTestEnvironment,
} from "./composer-test-harness";
import { describe, expect, it, vi } from "vitest";
import type { ReadyDiscoveryComposerAttachment } from "./composer-model";

setupComposerTestEnvironment();

describe("DiscoveryComposer submission", () => {

  it("submits structured mentions and keeps queued files when submission fails", async () => {
    const onSubmit = vi.fn(async () => false);
    const { user } = renderComposer({
      value: "Ask @Maya Chen and @Product Agent",
      onSubmit,
    });
    await user.upload(
      getFileInput(),
      pdfFile(),
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        body: "Ask @Maya Chen and @Product Agent",
        attachments: [
          expect.objectContaining({
            file: expect.objectContaining({ name: "research.pdf" }),
          }),
        ],
        mentionedUserIds: ["user-2"],
        mentionedAgentKinds: ["product"],
      });
    });
    expect(screen.getByText("research.pdf")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Message" }),
    ).toHaveTextContent("Ask @Maya Chen and @Product Agent");
  });

  it("keeps a newer draft when an earlier submission fails", async () => {
    let resolveSubmission: ((didSubmit: boolean) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    const { user } = renderComposer({
      value: "Original draft",
      onSubmit,
    });

    await user.click(screen.getByRole("button", { name: "Send" }));
    const editor = screen.getByRole("combobox", { name: "Message" });
    await user.type(editor, "Newer draft");

    await act(async () => {
      resolveSubmission?.(false);
    });

    expect(editor).toHaveTextContent("Newer draft");
  });

  it("excludes attachments reserved by an in-flight send from a newer submission", async () => {
    let resolveFirstSubmission: ((didSubmit: boolean) => void) | undefined;
    const onSubmit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveFirstSubmission = resolve;
          }),
      )
      .mockResolvedValueOnce(true);
    const { user } = renderComposer({
      value: "Original evidence",
      onSubmit,
    });
    await user.upload(getFileInput(), pdfFile("original.pdf"));

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());

    const editor = screen.getByRole("combobox", { name: "Message" });
    await user.type(editor, "Clean follow-up");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(
      onSubmit.mock.calls[0][0].attachments.map(
        (attachment: ReadyDiscoveryComposerAttachment) =>
          attachment.file.name,
      ),
    ).toEqual(["original.pdf"]);
    expect(onSubmit.mock.calls[1][0].attachments).toEqual([]);

    await act(async () => {
      resolveFirstSubmission?.(true);
    });
  });

  it("enforces the attachment limit across queued and reserved files", async () => {
    let rejectSubmission: ((reason: Error) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          rejectSubmission = reject;
        }),
    );
    const { user } = renderComposer({
      value: "Ten interview transcripts",
      onSubmit,
    });
    const originalFiles = Array.from(
      { length: MAX_COMPOSER_ATTACHMENTS },
      (_, index) => pdfFile(`original-${index}.pdf`),
    );
    await user.upload(getFileInput(), originalFiles);

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    await user.upload(
      getFileInput(),
      Array.from(
        { length: MAX_COMPOSER_ATTACHMENTS },
        (_, index) => pdfFile(`newer-${index}.pdf`),
      ),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You can attach up to 10 files.",
    );
    expect(screen.queryByText("newer-0.pdf")).not.toBeInTheDocument();

    await act(async () => {
      rejectSubmission?.(new Error("Message persistence failed"));
    });

    for (const file of originalFiles) {
      expect(screen.getByText(file.name)).toBeVisible();
    }
    expect(screen.queryByText("newer-0.pdf")).not.toBeInTheDocument();
  });

  it("rejects a duplicate of an attachment reserved by an in-flight send", async () => {
    let resolveSubmission: ((didSubmit: boolean) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    const { user } = renderComposer({
      value: "Original evidence",
      onSubmit,
    });
    await user.upload(getFileInput(), pdfFile("original.pdf"));

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    await user.upload(getFileInput(), pdfFile("original.pdf"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "original.pdf is already queued.",
    );
    expect(screen.queryByText("original.pdf")).not.toBeInTheDocument();

    await act(async () => {
      resolveSubmission?.(true);
    });
  });

  it("clears stale attachment validation errors after a successful send", async () => {
    const onSubmit = vi.fn(async () => true);
    const { user } = renderComposer({
      value: "Original evidence",
      onSubmit,
    });
    await user.upload(getFileInput(), pdfFile("original.pdf"));
    await user.upload(getFileInput(), pdfFile("original.pdf"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "original.pdf is already queued.",
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  it("restores only a rejected send's attachments alongside a newer draft queue", async () => {
    let rejectFirstSubmission: ((reason: Error) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          rejectFirstSubmission = reject;
        }),
    );
    const { user } = renderComposer({
      value: "Original evidence",
      onSubmit,
    });
    await user.upload(getFileInput(), pdfFile("original.pdf"));

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.queryByText("original.pdf")).not.toBeInTheDocument();

    const editor = screen.getByRole("combobox", { name: "Message" });
    await user.type(editor, "Newer draft");
    await user.upload(getFileInput(), pdfFile("newer.pdf"));

    await act(async () => {
      rejectFirstSubmission?.(new Error("Message persistence failed"));
    });

    expect(editor).toHaveTextContent("Newer draft");
    expect(screen.getByText("original.pdf")).toBeVisible();
    expect(screen.getByText("newer.pdf")).toBeVisible();
  });

  it("clears sent files and revokes their object URLs after successful submission", async () => {
    const onSubmit = vi.fn(async () => true);
    const { user } = renderComposer({
      value: "Interview context",
      onSubmit,
    });
    await user.upload(
      getFileInput(),
      imageFile(),
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("img", { name: "interview.png" }),
      ).not.toBeInTheDocument();
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:interview.png",
    );
  });

});
