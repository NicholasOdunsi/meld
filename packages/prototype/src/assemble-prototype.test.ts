import { describe, expect, it } from "vitest";
import {
  assembleValidatedPrototype,
  PrototypeSafetyError,
} from "./assemble-prototype";

const SCREEN_A = "11111111-1111-4111-8111-111111111111";
const SCREEN_B = "22222222-2222-4222-8222-222222222222";

const clean = {
  startScreenId: SCREEN_A,
  tokenCss: "",
  screens: [
    {
      id: SCREEN_A,
      name: "A",
      markup: '<button data-meld-action="go">Go</button>',
      styles: "",
      script: null,
      actions: [{ id: "go", label: "Go", targetScreenId: null }],
    },
  ],
};

describe("assembleValidatedPrototype", () => {
  it("returns the assembled document for clean screens", () => {
    expect(assembleValidatedPrototype(clean)).toContain("data-meld-screen");
  });

  it("strips a CDATA wrapper the model added around markup and styles", () => {
    const wrapped = {
      ...clean,
      screens: [
        {
          ...clean.screens[0],
          markup: '<![CDATA[<div class="app">hi</div>]]>',
          styles: "<![CDATA[.app{color:red}]]>",
        },
      ],
    };

    const doc = assembleValidatedPrototype(wrapped);
    expect(doc).toContain('<div class="app">hi</div>');
    expect(doc).toContain(".app{color:red}");
    expect(doc).not.toContain("CDATA");
  });

  it("throws PrototypeSafetyError naming the offending screen and rule", () => {
    const bad = {
      ...clean,
      screens: [{ ...clean.screens[0], markup: "<iframe></iframe>" }],
    };

    try {
      assembleValidatedPrototype(bad);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrototypeSafetyError);
      const safetyError = error as PrototypeSafetyError;
      expect(safetyError.violations[0]?.screenId).toBe(SCREEN_A);
      expect(
        safetyError.violations[0]?.findings.map((finding) => finding.rule),
      ).toContain("forbidden-element");
    }
  });

  it("rejects a screen whose markup navigates to a remote origin", () => {
    const bad = {
      ...clean,
      screens: [
        {
          ...clean.screens[0],
          markup: '<a href="https://evil.test">go</a>',
        },
      ],
    };

    expect(() => assembleValidatedPrototype(bad)).toThrow(
      PrototypeSafetyError,
    );
  });

  it("rejects entity-encoded navigation and computed screen scripts", () => {
    const encodedLink = {
      ...clean,
      screens: [
        {
          ...clean.screens[0],
          markup: '<a href="http:&#47;&#47;evil.test/leak">leave</a>',
        },
      ],
    };
    const computedScript = {
      ...clean,
      screens: [
        {
          ...clean.screens[0],
          script:
            'window["loc" + "ation"]["hr" + "ef"] = atob("aHR0cHM6Ly9ldmlsLnRlc3Q=")',
        },
      ],
    };

    expect(() => assembleValidatedPrototype(encodedLink)).toThrow(
      PrototypeSafetyError,
    );
    expect(() => assembleValidatedPrototype(computedScript)).toThrow(
      PrototypeSafetyError,
    );
  });

  it("reports every unsafe screen in one error", () => {
    const bad = {
      ...clean,
      screens: [
        { ...clean.screens[0], markup: "<iframe></iframe>" },
        {
          ...clean.screens[0],
          id: SCREEN_B,
          name: "B",
          script: "top.location = 'https://evil.test'",
        },
      ],
    };

    try {
      assembleValidatedPrototype(bad);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrototypeSafetyError);
      expect((error as PrototypeSafetyError).violations).toHaveLength(2);
      expect(
        (error as PrototypeSafetyError).violations.map(
          (violation) => violation.screenId,
        ),
      ).toEqual([SCREEN_A, SCREEN_B]);
    }
  });
});
