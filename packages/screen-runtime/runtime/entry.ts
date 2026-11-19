import * as React from "react";
import * as JSXRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as Lucide from "lucide-react";
import * as Clsx from "clsx";
import { SUPPORTED_MODULES } from "../src/constants";

// Babel's CommonJS interop expects both the marker and a default export.
function moduleExports<T extends object>(namespace: T) {
  return {
    ...namespace,
    __esModule: true,
    default: "default" in namespace ? namespace.default : namespace,
  };
}

const modules = {
  react: moduleExports(React),
  "react/jsx-runtime": moduleExports(JSXRuntime),
  "react-dom": moduleExports(ReactDOM),
  "react-dom/client": moduleExports(ReactDOMClient),
  "lucide-react": moduleExports(Lucide),
  clsx: moduleExports(Clsx),
} satisfies Record<(typeof SUPPORTED_MODULES)[number], object>;

(window as Window & { __orionModules?: typeof modules }).__orionModules = modules;
