// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WaveText } from "./wave-text";

afterEach(cleanup);

function characters(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-wave-character]"),
  );
}

describe("WaveText", () => {
  it("renders one animated element per character, including spaces", () => {
    const { container } = render(<WaveText text="Ok go" />);

    // "Ok go" is five characters -- the space is animated too, otherwise the
    // wave would visibly skip between words.
    expect(characters(container)).toHaveLength(5);
  });

  it("renders spaces as non-breaking so word gaps survive", () => {
    // Each character sits in its own inline-block element, and a plain
    // U+0020 inside one collapses to zero width -- which would run every
    // multi-word label together.
    const { container } = render(<WaveText text="Ok go" />);

    expect(characters(container)[2]?.textContent).toBe("\u00A0");
  });

  it("staggers each character and caps the total lag", () => {
    // 45ms per character would put the 20th character 855ms behind the
    // first, which reads as lag rather than a wave. The cap holds every
    // character at or below 600ms.
    const { container } = render(
      <WaveText text="Waiting for your device" />,
    );
    const delays = characters(container).map(
      (element) => element.style.animationDelay,
    );

    expect(delays[0]).toBe("0ms");
    expect(delays[1]).toBe("45ms");
    expect(delays[2]).toBe("90ms");
    expect(delays.at(-1)).toBe("600ms");
    expect(delays).not.toContain("645ms");
  });

  it("announces the whole label rather than each letter", () => {
    render(<WaveText text="Responding" />);

    // The decorative characters are hidden from assistive technology, and a
    // single visually-hidden copy carries the announcement -- otherwise a
    // screen reader spells the word out letter by letter.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Responding");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("hides the decorative characters from assistive technology", () => {
    const { container } = render(<WaveText text="Queued" />);

    for (const character of characters(container)) {
      expect(character.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("keeps the same character elements when an unrelated prop changes", () => {
    // The character list is memoised on `text`. If it rebuilt on every
    // render, each animationDelay would reset and the wave would restart --
    // visibly stuttering whenever a sibling counter ticks.
    const { container, rerender } = render(
      <WaveText text="Responding" type="label" />,
    );
    const before = characters(container)[0];

    rerender(<WaveText text="Responding" type="large" />);

    expect(characters(container)[0]).toBe(before);
  });
});
