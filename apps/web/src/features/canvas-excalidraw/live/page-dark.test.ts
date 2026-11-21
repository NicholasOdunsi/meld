// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { pageIsDark } from "./page-dark";

afterEach(() => {
  document.body.style.backgroundColor = "";
  document.documentElement.style.backgroundColor = "";
});
it("reads the body colour, falls through a transparent body to the root, then defaults to dark", () => {
  document.body.style.backgroundColor = "rgb(255, 255, 255)";
  expect(pageIsDark()).toBe(false);
  document.body.style.backgroundColor = "rgba(0, 0, 0, 0)";
  document.documentElement.style.backgroundColor = "rgb(250, 250, 250)";
  expect(pageIsDark()).toBe(false);
  document.documentElement.style.backgroundColor = "";
  expect(pageIsDark()).toBe(true);
});
