import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrionTalkingHat } from "../../apps/web/src/ui/orion-talking-hat";

for (const expression of ["neutral", "curious", "speaking"] as const) {
  const svg = renderToStaticMarkup(
    <OrionTalkingHat appearance="illustration" expression={expression} decorative width={200} height={200} />,
  );
  process.stdout.write(`${expression}\t${svg.replace(/\n/g, " ")}\n`);
}
