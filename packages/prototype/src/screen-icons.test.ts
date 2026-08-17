import { describe, expect, it } from "vitest";
import { substituteScreenIcons, substituteBatchIcons, type IconResolver } from "./screen-icons";
import type { DesignScreenBatch } from "./screen-payload";
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

  it("neutralizes an attribute-breakout injection in a single-quoted class value", () => {
    const out = substituteScreenIcons(
      '<svg data-icon="search" class=\'a" onload="alert(1)\'></svg>',
      stub,
    );
    // The literal text "onload=" is harmless once the quote that broke it
    // out is escaped — what matters is that it is no longer a LIVE
    // double-quoted attribute a parser would execute.
    expect(out).not.toContain('onload="alert(1)"');
    expect(out).toContain("&quot;");
    expect(out).toContain('stroke="currentColor"');
  });

  it("does not let data-width leak into the real width attribute", () => {
    const out = substituteScreenIcons(
      '<svg data-icon="search" data-width="999" width="20"></svg>',
      stub,
    );
    expect(out).toContain('width="20"');
    expect(out).not.toContain('width="999"');
  });
});

describe("substituteBatchIcons", () => {
  const batch: DesignScreenBatch = {
    screens: [
      {
        markup: '<nav><svg data-icon="search"></svg></nav>',
        styles: "",
        script: null,
        actions: [],
      },
      {
        markup: "<main><svg data-icon=\"search\"></svg></main>",
        styles: "",
        script: null,
        actions: [],
        layout: {
          reuse: null,
          create: {
            layoutKey: "shell",
            name: "Shell",
            shellMarkup: '<header><svg data-icon="search"></svg><div data-meld-slot></div></header>',
            shellStyles: null,
            actions: [],
          },
        },
      },
    ],
  };

  it("substitutes screen markup and created-layout shellMarkup", () => {
    const out = substituteBatchIcons(batch, stub);
    expect(out.screens[0].markup).toContain('stroke="currentColor"');
    expect(out.screens[1].markup).toContain('stroke="currentColor"');
    const shell = out.screens[1].layout?.create?.shellMarkup ?? "";
    expect(shell).toContain('stroke="currentColor"');
    // the slot invariant is preserved
    expect(shell).toContain("data-meld-slot");
    // no placeholders remain anywhere
    expect(JSON.stringify(out)).not.toContain("data-icon=");
  });

  it("leaves a reuse-only layout screen's layout intact", () => {
    const reuseBatch: DesignScreenBatch = {
      screens: [
        {
          markup: '<svg data-icon="search"></svg>',
          styles: "",
          script: null,
          actions: [],
          layout: { reuse: { layoutKey: "shell" }, create: null },
        },
      ],
    };
    const out = substituteBatchIcons(reuseBatch, stub);
    expect(out.screens[0].layout?.reuse?.layoutKey).toBe("shell");
    expect(out.screens[0].markup).toContain('stroke="currentColor"');
  });
});
