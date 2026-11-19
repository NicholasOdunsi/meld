import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { moduleGraphPlugin, resolveScreenImport, type ModuleReport } from "./module-graph";

const files = {
  "App.tsx": "",
  "ui/Page.tsx": "",
  "ui/Button.tsx": "",
  "ui/index.ts": "",
  "styles.css": "",
};

function compile(source: string, file = "App.tsx", sources = files) {
  const report: ModuleReport = {
    unsupported: new Set(), missing: new Set(), styles: new Set(), dynamicImport: false,
  };
  const code = transform(source, {
    filename: file,
    plugins: [moduleGraphPlugin(file, sources, report)],
  }).code!;
  return { code, report };
}

describe("resolveScreenImport", () => {
  it("resolves extensions and directory indexes from the importing directory", () => {
    expect(resolveScreenImport("App.tsx", "./ui/Button", files)).toBe("ui/Button.tsx");
    expect(resolveScreenImport("App.tsx", "./ui", files)).toBe("ui/index.ts");
    expect(resolveScreenImport("ui/Page.tsx", "./Button", files)).toBe("ui/Button.tsx");
    expect(resolveScreenImport("ui/Page.tsx", "../styles.css", files)).toBe("styles.css");
  });

  it.each(["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"])(
    "resolves the %s candidate", (extension) => {
      expect(resolveScreenImport("App.tsx", "./target", { [`target${extension}`]: "" }))
        .toBe(`target${extension}`);
    },
  );

  it("resolves directory imports at the virtual root", () => {
    const sources = { "index.tsx": "" };
    expect(resolveScreenImport("App.tsx", "./", sources)).toBe("index.tsx");
    expect(resolveScreenImport("App.tsx", ".", sources)).toBe("index.tsx");
    expect(resolveScreenImport("ui/Page.tsx", "..", sources)).toBe("index.tsx");
  });

  it("uses the specified extension and index precedence", () => {
    expect(resolveScreenImport("App.tsx", "./ui", {
      ui: "", "ui.tsx": "", "ui.ts": "", "ui/index.tsx": "",
    })).toBe("ui");
    expect(resolveScreenImport("App.tsx", "./ui", { "ui.ts": "", "ui.tsx": "" })).toBe("ui.tsx");
  });

  it("normalizes dot segments without escaping the virtual root", () => {
    expect(resolveScreenImport("ui/Page.tsx", "./../ui/./Button", files)).toBe("ui/Button.tsx");
    expect(resolveScreenImport("App.tsx", "../ui/Button", files)).toBeNull();
    expect(resolveScreenImport("ui/Page.tsx", "../../ui/Button", files)).toBeNull();
    expect(resolveScreenImport("../App.tsx", "./ui/Button", files)).toBeNull();
  });

  it("rejects missing files, bare names, absolute paths, and inherited keys", () => {
    expect(resolveScreenImport("App.tsx", "./missing", files)).toBeNull();
    expect(resolveScreenImport("App.tsx", "react", files)).toBeNull();
    expect(resolveScreenImport("App.tsx", "/ui/Button.tsx", files)).toBeNull();
    expect(resolveScreenImport("App.tsx", "./inherited", Object.create({ "inherited.ts": "" }))).toBeNull();
    expect(resolveScreenImport("App.tsx", "./toString", {})).toBeNull();
  });
});

describe("moduleGraphPlugin", () => {
  it("rewrites relative imports and re-exports to resolved filenames", () => {
    const { code, report } = compile(`
      import Button from './ui/Button';
      export { default as Button } from './ui/Button';
      export * from './ui';
      export const name = 'screen';
    `);
    expect(code).toContain('import Button from "ui/Button.tsx"');
    expect(code).toContain('export { default as Button } from "ui/Button.tsx"');
    expect(code).toContain('export * from "ui/index.ts"');
    expect(report.missing.size).toBe(0);
  });

  it("reports unsupported bare imports and exports while leaving supported imports unchanged", () => {
    const { code, report } = compile(`
      import React from 'react';
      import { motion } from 'framer-motion';
      export * from 'other-package';
      export { value } from 'another-package';
    `);
    expect(code).toContain("from 'react'");
    expect(report.unsupported).toEqual(new Set(["framer-motion", "other-package", "another-package"]));
  });

  it("records missing relative imports and exports with the original specifier", () => {
    const { code, report } = compile("import './missing'; export * from '../outside';");
    expect(report.missing).toEqual(new Set(["./missing", "../outside"]));
    expect(code).toContain("'./missing'");
  });

  it("collects and removes relative CSS imports resolved inside the virtual root", () => {
    const { code, report } = compile("import '../styles.css'; import './Button';", "ui/Page.tsx");
    expect(code).not.toContain("styles.css");
    expect(code).toContain('import "ui/Button.tsx"');
    expect(report.styles).toEqual(new Set(["styles.css"]));
    expect(report.missing.size).toBe(0);
  });

  it("reports missing CSS without collecting or removing it", () => {
    const { code, report } = compile("import './absent.css'; import '../styles.css';");
    expect(report.missing).toEqual(new Set(["./absent.css", "../styles.css"]));
    expect(report.styles.size).toBe(0);
    expect(code).toContain("'./absent.css'");
  });

  it("flags dynamic imports, including nonliteral specifiers", () => {
    expect(compile("const load = () => import('./ui/Button');").report.dynamicImport).toBe(true);
    expect(compile("const load = (name) => import(name);").report.dynamicImport).toBe(true);
    expect(compile("const value = 1;").report.dynamicImport).toBe(false);
  });
});
