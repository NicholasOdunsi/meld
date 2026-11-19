import type { NodePath, PluginObj, types as BabelTypes } from "@babel/core";
import { SUPPORTED_MODULES } from "./constants";

export type ModuleReport = {
  unsupported: Set<string>;
  missing: Set<string>;
  styles: Set<string>;
  dynamicImport: boolean;
};

const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
const supportedModules = new Set<string>(SUPPORTED_MODULES);

function isRelative(specifier: string): boolean {
  return specifier === "." || specifier === ".."
    || specifier.startsWith("./") || specifier.startsWith("../");
}

export function resolveScreenImport(
  from: string,
  specifier: string,
  files: Record<string, string>,
): string | null {
  if (!isRelative(specifier) || from.startsWith("/")) return null;
  const segments: string[] = [];
  const directory = from.split("/").slice(0, -1);
  for (const segment of [...directory, ...specifier.split("/")]) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  const target = segments.join("/");
  for (const extension of EXTENSIONS) {
    if (!target && !extension.startsWith("/")) continue;
    const candidate = target ? target + extension : extension.slice(1);
    if (Object.prototype.hasOwnProperty.call(files, candidate)) return candidate;
  }
  return null;
}

export function moduleGraphPlugin(file: string, files: Record<string, string>, report: ModuleReport) {
  return (): PluginObj => {
    function rewrite(path: NodePath<
      BabelTypes.ImportDeclaration | BabelTypes.ExportNamedDeclaration | BabelTypes.ExportAllDeclaration
    >) {
      const { source } = path.node;
      if (!source) return;
      const specifier = source.value;
      if (!isRelative(specifier)) {
        if (!supportedModules.has(specifier)) report.unsupported.add(specifier);
        return;
      }
      const resolved = resolveScreenImport(file, specifier, files);
      if (resolved === null) {
        report.missing.add(specifier);
        return;
      }
      if (path.isImportDeclaration() && specifier.endsWith(".css")) {
        report.styles.add(resolved);
        path.remove();
        return;
      }
      source.value = resolved;
    }

    return {
      name: "orion-module-graph",
      visitor: {
        ImportDeclaration: rewrite,
        ExportNamedDeclaration: rewrite,
        ExportAllDeclaration: rewrite,
        Import() {
          report.dynamicImport = true;
        },
      },
    };
  };
}
