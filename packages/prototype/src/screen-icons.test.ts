import { describe, expect, it } from "vitest";
import { substituteScreenIcons, type IconResolver } from "./screen-icons";
import { findScreenSafetyViolations } from "./screen-safety";

// A stub resolver so this package needs no icon library to test.
const stub: IconResolver = (name) =>
  name === "search" ? '<circle cx="11" cy="11" r="8"></circle>' : null;

describe("substituteScreenIcons", () => {
  it("replaces a known data-icon placeholder with real inline svg", () => {
    const out = substituteScreenIcons('<span><svg data-icon="search"></svg></span>', stub);
    expect(out).toContain('<circle cx="11" cy="11" r="8">');
    expect(out).toContain('stroke="currentColor"');
    expect(out).not.toContain("data-icon=");
  });

  it("falls back to a neutral glyph for an unknown name", () => {
    const out = substituteScreenIcons('<svg data-icon="not-a-real-icon"></svg>', stub);
    expect(out).toContain('stroke="currentColor"');
    expect(out).not.toContain("data-icon=");
    // fallback is a plain circle, not the resolver's search geometry
    expect(out).not.toContain('r="8"');
    expect(out).toContain("<circle");
  });

  it("preserves width, height, and class from the placeholder", () => {
    const out = substituteScreenIcons(
      '<svg data-icon="search" width="20" height="20" class="nav-ic"></svg>',
      stub,
    );
    expect(out).toContain('width="20"');
    expect(out).toContain('height="20"');
    expect(out).toContain('class="nav-ic"');
  });

  it("defaults to 24x24 when no size is given", () => {
    const out = substituteScreenIcons('<svg data-icon="search"></svg>', stub);
    expect(out).toContain('width="24"');
    expect(out).toContain('height="24"');
  });

  it("substitutes every placeholder and leaves other markup intact", () => {
    const out = substituteScreenIcons(
      '<a><svg data-icon="search"></svg></a><b><svg data-icon="search"/></b><i>hi</i>',
      stub,
    );
    expect(out.match(/<circle cx="11"/g)).toHaveLength(2);
    expect(out).toContain("<i>hi</i>");
  });

  it("leaves a real inline svg with children untouched", () => {
    const markup = '<svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>';
    expect(substituteScreenIcons(markup, stub)).toBe(markup);
  });

  it("produces markup that passes the safety gate", () => {
    const markup = substituteScreenIcons('<svg data-icon="search"></svg>', stub);
    const findings = findScreenSafetyViolations({
      markup,
      styles: "",
      script: null,
      actions: [],
    });
    expect(findings).toEqual([]);
  });
});
