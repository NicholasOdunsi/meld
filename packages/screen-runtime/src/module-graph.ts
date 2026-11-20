import type { NodePath, PluginObj, types as BabelTypes } from "@babel/core";
import { SUPPORTED_MODULES } from "./constants";

export type ModuleReport = {
  unsupported: Set<string>;
  /** Relative imports that resolve to a file the runtime cannot execute (JSON, SVG, ...). */
  unsupportedFiles: Set<string>;
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

function isTypeOnly(
  node: BabelTypes.ImportDeclaration | BabelTypes.ExportNamedDeclaration | BabelTypes.ExportAllDeclaration,
): boolean {
  if (node.type === "ImportDeclaration") {
    if (node.importKind === "type") return true;
    return node.specifiers.length > 0
      && node.specifiers.every((specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type");
  }
  if (node.type === "ExportAllDeclaration") return node.exportKind === "type";
  return node.exportKind === "type"
    || (node.specifiers.length > 0
      && node.specifiers.every((specifier) => specifier.type === "ExportSpecifier" && specifier.exportKind === "type"));
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
        // Fully type-only imports and re-exports are erased by the TypeScript
        // preset, so they never need a runtime module.
        if (!supportedModules.has(specifier) && !isTypeOnly(path.node)) report.unsupported.add(specifier);
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
      if (!/\.(tsx?|jsx?)$/.test(resolved)) {
        report.unsupportedFiles.add(specifier);
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
