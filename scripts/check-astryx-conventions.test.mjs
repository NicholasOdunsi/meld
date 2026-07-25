import assert from "node:assert/strict";
import { checkSource } from "./check-astryx-conventions.mjs";

assert.deepEqual(checkSource(`export const Good = () => <VStack gap={4} />`), []);
assert.match(checkSource(`export const Bad = () => <div />`)[0], /raw <div>/);
assert.match(
  checkSource(`export const Bad = () => <Stack className="p-4 bg-white" />`)[0],
  /utility class/,
);
assert.match(
  checkSource(`export const Bad = () => <Stack style={{color: "#fff"}} />`)[0],
  /hardcoded color/,
);
assert.match(
  checkSource(`export const Bad = () => <Stack style={{width: "16px"}} />`)[0],
  /hardcoded pixel/,
);
