// @vitest-environment jsdom

import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MAX_COMPOSER_ATTACHMENTS } from "./composer-model";
import {
  ControlledComposer,
  deferred,
  getFileInput,
  imageFile,
  mentions,
  pdfFile,
  renderComposer,
  setupComposerTestEnvironment,
  uploadedAttachment,
  uploadedImage,
} from "./composer-test-harness";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveryAttachmentView } from "../attachment-types";
import type { ComposerProps } from "./composer-test-harness";

setupComposerTestEnvironment();

describe("DiscoveryComposer attachments", () => {

  it("queues images as thumbnails and documents as removable tokens", async () => {
    const { user } = renderComposer();

    await user.upload(getFileInput(), [
      imageFile(),
      pdfFile(),
    ]);

    expect(
      screen.getByRole("img", { name: "interview.png" }),
    ).toBeVisible();
    expect(screen.getByText("research.pdf")).toBeVisible();
    const composer = screen.getByTestId("discovery-chat-composer");
    expect(
      composer.contains(
        screen.getByRole("img", { name: "interview.png" }),
      ),
    ).toBe(true);
    expect(composer.contains(screen.getByText("research.pdf"))).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Remove research.pdf" }),
    );
    expect(screen.queryByText("research.pdf")).not.toBeInTheDocument();
  });

  it("blocks send until every staged upload succeeds", async () => {
    const upload = deferred<DiscoveryAttachmentView>();
    const onStageAttachment = vi.fn(() => upload.promise);
    const { user } = renderComposer({
      value: "Review this image",
      onStageAttachment,
    });

    await user.upload(getFileInput(), imageFile());
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(
      screen.getByRole("img", { name: "interview.png" }),
    ).toHaveAttribute("data-loading", "true");

    upload.resolve(uploadedImage);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
    );
  });

  it("keeps send blocked and reports the file when staging fails", async () => {
    const { user } = renderComposer({
      value: "Review this image",
      onStageAttachment: vi
        .fn()
        .mockRejectedValue(new Error("Upload failed")),
    });

    await user.upload(getFileInput(), imageFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "interview.png: Upload failed",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(
      screen.getByRole("img", { name: "interview.png" }),
    ).toBeVisible();
  });

  it("marks files failed when no staging callback is available", async () => {
    const user = userEvent.setup();
    render(
      <ControlledComposer
        roomId="20000000-0000-4000-8000-000000000002"
        initialValue="Review this image"
        onChangeSpy={vi.fn()}
        onSubmit={vi.fn(async () => true)}
        mentions={mentions}
      />,
    );

    await user.upload(getFileInput(), imageFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "interview.png: Upload unavailable",
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("does not stage invalid or oversized input", async () => {
    const onStageAttachment = vi.fn(async (attachment) =>
      uploadedAttachment(attachment.file),
    );
    const { user } = renderComposer({ onStageAttachment });

    fireEvent.drop(screen.getByRole("combobox", { name: "Message" }), {
      dataTransfer: {
        files: [
          new File(["data"], "data.zip", { type: "application/zip" }),
        ],
      },
    });
    await user.upload(
      getFileInput(),
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
        type: "application/pdf",
      }),
    );

    expect(onStageAttachment).not.toHaveBeenCalled();
  });

  it("discards a persisted staged upload before removing it", async () => {
    const onDiscardStagedAttachment = vi.fn(async () => {});
    const { user } = renderComposer({ onDiscardStagedAttachment });

    await user.upload(getFileInput(), pdfFile());
    await waitFor(() =>
      expect(screen.queryByText("Uploading")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove research.pdf" }),
    );

    await waitFor(() =>
      expect(onDiscardStagedAttachment).toHaveBeenCalledWith(
        "attachment-research.pdf",
      ),
    );
    expect(screen.queryByText("research.pdf")).not.toBeInTheDocument();
  });

  it("retains an uploaded item when server discard fails", async () => {
    const onDiscardStagedAttachment = vi
      .fn()
      .mockRejectedValue(new Error("Discard failed"));
    const { user } = renderComposer({ onDiscardStagedAttachment });

    await user.upload(getFileInput(), pdfFile());
    await waitFor(() =>
      expect(screen.queryByText("Uploading")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Remove research.pdf",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "research.pdf: Discard failed",
    );
    expect(screen.getByText("research.pdf")).toBeVisible();
  });

  it("blocks submission and repeated removal while discard is pending", async () => {
    const discard = deferred<void>();
    const onDiscardStagedAttachment = vi.fn(() => discard.promise);
    const onSubmit = vi.fn(async () => true);
    const { user } = renderComposer({
      value: "Review this research",
      onDiscardStagedAttachment,
      onSubmit,
    });

    await user.upload(getFileInput(), pdfFile());
    await waitFor(() =>
      expect(screen.queryByText("Uploading")).not.toBeInTheDocument(),
    );
    const removeButton = screen.getByRole("button", {
      name: "Remove research.pdf",
    });

    await user.click(removeButton);

    expect(screen.getByText("Removing")).toBeVisible();
    expect(removeButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.click(removeButton);
    expect(onDiscardStagedAttachment).toHaveBeenCalledOnce();

    const editor = screen.getByRole("combobox", { name: "Message" });
    await user.click(editor);
    await user.keyboard("{Enter}");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent("Review this research");

    discard.resolve(undefined);
    await waitFor(() =>
      expect(screen.queryByText("research.pdf")).not.toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("continues staging later files after a synchronous staging throw", async () => {
    const onStageAttachment = vi.fn(
      (attachment: Parameters<
        NonNullable<ComposerProps["onStageAttachment"]>
      >[0]) => {
        if (attachment.file.name === "first.pdf") {
          throw new Error("Synchronous upload failed");
        }
        return Promise.resolve(uploadedAttachment(attachment.file));
      },
    );
    const onSubmit = vi.fn(async () => true);
    const { user } = renderComposer({
      value: "Review these files",
      onStageAttachment,
      onSubmit,
    });

    await user.upload(getFileInput(), [
      pdfFile("first.pdf"),
      pdfFile("second.pdf"),
    ]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "first.pdf: Synchronous upload failed",
    );
    expect(onStageAttachment).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByText("Uploading")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove first.pdf" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            file: expect.objectContaining({ name: "second.pdf" }),
            status: "uploaded",
          }),
        ],
      }),
    );
  });

  it("captures Enter without clearing the draft while upload blocks send", async () => {
    const upload = deferred<DiscoveryAttachmentView>();
    const onSubmit = vi.fn(async () => true);
    const { user } = renderComposer({
      value: "Review this image",
      onSubmit,
      onStageAttachment: vi.fn(() => upload.promise),
    });

    await user.upload(getFileInput(), imageFile());
    const editor = screen.getByRole("combobox", { name: "Message" });
    await user.click(editor);
    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent("Review this image");
  });

  it("prevents dragover before queuing pasted and dropped files", () => {
    renderComposer();
    const editor = screen.getByRole("combobox", { name: "Message" });

    fireEvent.paste(editor, {
      clipboardData: {
        files: [pdfFile("pasted.pdf")],
        getData: () => "",
      },
    });
    const dragOver = createEvent.dragOver(editor, {
      dataTransfer: {
        files: [pdfFile("dropped.pdf")],
        types: ["Files"],
      },
    });
    fireEvent(editor, dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
    fireEvent.drop(editor, {
      dataTransfer: {
        files: [pdfFile("dropped.pdf")],
      },
    });

    expect(screen.getByText("pasted.pdf")).toBeVisible();
    expect(screen.getByText("dropped.pdf")).toBeVisible();
  });

  it("reports duplicate and count-limit attachment rejections", async () => {
    const { user } = renderComposer();
    const input = getFileInput();
    const duplicate = new File(["research"], "duplicate.pdf", {
      type: "application/pdf",
      lastModified: 300,
    });

    await user.upload(input, duplicate);
    await user.upload(
      input,
      new File(["research"], "duplicate.pdf", {
        type: "application/pdf",
        lastModified: 300,
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "duplicate.pdf is already queued.",
    );

    const remaining = Array.from(
      { length: MAX_COMPOSER_ATTACHMENTS },
      (_, index) =>
        new File(["notes"], `notes-${index}.txt`, {
          type: "text/plain",
          lastModified: index,
        }),
    );
    await user.upload(input, remaining);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You can attach up to 10 files.",
    );
    expect(screen.getByText("notes-8.txt")).toBeVisible();
    expect(screen.queryByText("notes-9.txt")).not.toBeInTheDocument();
  });

  it("revokes image object URLs on removal and unmount", async () => {
    const { unmount, user } = renderComposer();
    const input = getFileInput();

    await user.upload(input, imageFile("removed.png"));
    await user.click(
      screen.getByRole("button", { name: /Remove removed\.png/ }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:removed.png");

    await user.upload(input, imageFile("unmounted.png"));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:unmounted.png",
    );
  });

});
