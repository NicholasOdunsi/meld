// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useFieldText } from "./field-text";

afterEach(cleanup);

describe("useFieldText", () => {
  it("follows a new incoming value and clears a stale invalid flag", () => {
    const { result, rerender } = renderHook(({ value }) => useFieldText(value), { initialProps: { value: "2" } });
    act(() => { result.current.setText("abc"); result.current.setInvalid(true); });
    rerender({ value: "5" });
    expect(result.current.text).toBe("5");
    expect(result.current.invalid).toBe(false);
  });

  it("keeps typed, unapplied text while the incoming value is unchanged", () => {
    const { result, rerender } = renderHook(({ value }) => useFieldText(value), { initialProps: { value: "2" } });
    act(() => { result.current.setText("abc"); result.current.setInvalid(true); });
    rerender({ value: "2" });
    expect(result.current.text).toBe("abc");
    expect(result.current.invalid).toBe(true);
  });

  it("keeps text typed after a commit when the committed value arrives", () => {
    const { result, rerender } = renderHook(({ value }) => useFieldText(value), { initialProps: { value: "2" } });
    act(() => { result.current.setText("9"); result.current.setSubmitted("9"); });
    act(() => { result.current.setText("91"); });
    rerender({ value: "9" });
    expect(result.current.text).toBe("91");
  });

  it("resets text and the invalid flag when the selection changes, even for the same value", () => {
    const { result, rerender } = renderHook(({ key }) => useFieldText("2", key), { initialProps: { key: "a" } });
    act(() => { result.current.setText("abc"); result.current.setInvalid(true); });
    rerender({ key: "a" });
    expect(result.current.text).toBe("abc");
    rerender({ key: "b" });
    expect(result.current.text).toBe("2");
    expect(result.current.invalid).toBe(false);
  });
});
