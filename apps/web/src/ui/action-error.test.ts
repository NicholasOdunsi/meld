import { expect, it } from "vitest";
import { actionErrorMessage } from "./action-error";

const FALLBACK = "We could not do that.";

it("keeps a message an action deliberately produced", () => {
  expect(
    actionErrorMessage(new Error("That name is already taken."), FALLBACK),
  ).toBe("That name is already taken.");
});

// This is the deployed shape the dialogs' own tests could not see: Next
// replaces the message and stamps a digest on the way out of a Server Action
// in a production build, so the friendly string never arrives.
it("falls back when Next redacted the message", () => {
  const redacted = Object.assign(
    new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
    ),
    { digest: "3081332443" },
  );

  expect(actionErrorMessage(redacted, FALLBACK)).toBe(FALLBACK);
});

it("falls back for an empty message or a non-Error reason", () => {
  expect(actionErrorMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
  expect(actionErrorMessage("a string", FALLBACK)).toBe(FALLBACK);
  expect(actionErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
});
