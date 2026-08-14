// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { DesignReferenceView } from "@meld/contracts";
import { FigmaReferenceCard } from "./figma-reference-card";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const REFERENCE_ID = "80000000-0000-4000-8000-000000000008";

const NOW = new Date("2026-08-14T12:00:00.000Z");

function pendingReference(
  overrides: Partial<DesignReferenceView> = {},
): DesignReferenceView {
  return {
    id: REFERENCE_ID,
    roomId: "40000000-0000-4000-8000-000000000004",
    normalizedUrl: "https://www.figma.com/design/abc/Sample",
    title: null,
    oembedStatus: "pending",
    fetchedAt: null,
    createdAt: "2026-08-14T10:00:00.000Z",
    thumbnailUrl: null,
    ...overrides,
  };
}

function okReference(overrides: Partial<DesignReferenceView> = {}): DesignReferenceView {
  return pendingReference({
    oembedStatus: "ok",
    title: "<b>Sample</b> File",
    fetchedAt: NOW.toISOString(),
    thumbnailUrl: "https://signed.example/thumb.png",
    ...overrides,
  });
}

function failedReference(
  overrides: Partial<DesignReferenceView> = {},
): DesignReferenceView {
  return pendingReference({ oembedStatus: "failed", ...overrides });
}

function upgraded(): DesignReferenceView {
  return okReference({ id: REFERENCE_ID });
}

describe("FigmaReferenceCard", () => {
  it("pending: renders a link card with the host and an Open in Figma affordance", () => {
    render(
      <FigmaReferenceCard
        reference={pendingReference()}
        canEdit={false}
        refresh={vi.fn()}
        remove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("figma-card-pending")).toBeInTheDocument();
    expect(screen.getByText("www.figma.com")).toBeInTheDocument();
    expect(screen.getByText("Open in Figma")).toBeInTheDocument();
  });

  it("pending + canEdit: calls the injected refresh exactly once", async () => {
    const refresh = vi.fn().mockResolvedValue(upgraded());
    const onRefreshed = vi.fn();

    render(
      <FigmaReferenceCard
        reference={pendingReference()}
        canEdit
        refresh={refresh}
        remove={vi.fn()}
        onRefreshed={onRefreshed}
      />,
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledWith(REFERENCE_ID);
    await waitFor(() => expect(onRefreshed).toHaveBeenCalledWith(upgraded()));
  });

  it("viewer (canEdit=false) never calls refresh, even when pending", async () => {
    const refresh = vi.fn();

    render(
      <FigmaReferenceCard
        reference={pendingReference()}
        canEdit={false}
        refresh={refresh}
        remove={vi.fn()}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ok: renders the cached thumbnail and the sanitized (escaped) title", () => {
    render(
      <FigmaReferenceCard
        reference={okReference({
          fetchedAt: NOW.toISOString(), // fresh -- not stale
        })}
        canEdit={false}
        refresh={vi.fn()}
        remove={vi.fn()}
      />,
    );

    const card = screen.getByTestId("figma-card-ok");
    expect(card).toBeInTheDocument();
    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("src", "https://signed.example/thumb.png");
    // The title is untrusted -- rendered as escaped text, not injected HTML.
    expect(screen.getByText("<b>Sample</b> File")).toBeInTheDocument();
    expect(card.querySelector("b")).toBeNull();
  });

  it("ok + fresh + canEdit: does not call refresh", async () => {
    const refresh = vi.fn();

    render(
      <FigmaReferenceCard
        reference={okReference({ fetchedAt: NOW.toISOString() })}
        canEdit
        refresh={refresh}
        remove={vi.fn()}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ok + stale (fetchedAt older than 7 days) + canEdit: calls refresh once", async () => {
    const refresh = vi.fn().mockResolvedValue(upgraded());
    const eightDaysAgo = new Date(
      NOW.getTime() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();

    render(
      <FigmaReferenceCard
        reference={okReference({ fetchedAt: eightDaysAgo })}
        canEdit
        refresh={refresh}
        remove={vi.fn()}
      />,
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledWith(REFERENCE_ID);
  });

  it("failed: renders the plain link card and never calls refresh", async () => {
    const refresh = vi.fn();

    render(
      <FigmaReferenceCard
        reference={failedReference()}
        canEdit
        refresh={refresh}
        remove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("figma-card-failed")).toBeInTheDocument();
    expect(screen.getByText("Open in Figma")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not re-fire the refresh effect on an unrelated parent re-render", async () => {
    const refresh = vi.fn().mockResolvedValue(upgraded());

    const { rerender } = render(
      <FigmaReferenceCard
        reference={pendingReference()}
        canEdit
        refresh={refresh}
        remove={vi.fn()}
      />,
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    rerender(
      <FigmaReferenceCard
        reference={pendingReference()}
        canEdit
        refresh={refresh}
        remove={vi.fn()}
      />,
    );
    rerender(
      <FigmaReferenceCard
        reference={pendingReference()}
        canEdit
        refresh={refresh}
        remove={vi.fn()}
      />,
    );

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("editor remove: calls the injected remove, then reports onRemoved", async () => {
    const remove = vi.fn().mockResolvedValue({ status: "removed" });
    const onRemoved = vi.fn();

    render(
      <FigmaReferenceCard
        reference={failedReference()}
        canEdit
        refresh={vi.fn()}
        remove={remove}
        onRemoved={onRemoved}
      />,
    );

    const removeButton = screen.getByTestId("figma-card-remove");
    await act(async () => {
      removeButton.click();
    });

    expect(remove).toHaveBeenCalledWith(REFERENCE_ID);
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(REFERENCE_ID));
  });

  it("a viewer sees no remove affordance", () => {
    render(
      <FigmaReferenceCard
        reference={failedReference()}
        canEdit={false}
        refresh={vi.fn()}
        remove={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("figma-card-remove")).not.toBeInTheDocument();
  });
});
