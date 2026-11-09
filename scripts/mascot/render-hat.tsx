import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrionTalkingHat } from "../../apps/web/src/ui/orion-talking-hat";

for (const expression of ["neutral", "curious"] as const) {
  const svg = renderToStaticMarkup(
    <OrionTalkingHat appearance="avatar" expression={expression} decorative width={96} height={96} />,
  );
  process.stdout.write(`${expression}\t${svg.replace(/\n/g, " ")}\n`);
}
