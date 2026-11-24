import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

// Match the native Orion dialog without changing the rest of the application's accent.
export const pasteTheme = defineTheme({
  name: "orion-paste",
  extends: neutralTheme,
  tokens: {
    "--color-accent": ["#00e1f3", "#00e1f3"],
    "--color-on-accent": ["#04222b", "#04222b"],
  },
});
