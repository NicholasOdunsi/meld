import { describe, expect, it } from "vitest";
import {
  changeUtility,
  cssValue,
  utilityBlocked,
  utilityField,
  utilityValue,
} from "./style";
import type { Field } from "./types";

describe("style values and base utilities", () => {
  it("distinguishes colour from size without disturbing variants", () => {
    const css = "flex text-sm text-red-500 hover:text-blue-500";
    expect(changeUtility(css, { field: "color", value: "#abcdef" })).toBe(
      "flex text-sm text-[#abcdef] hover:text-blue-500",
    );
    expect(changeUtility(css, { field: "fontSize", value: "21" })).toBe(
      "flex text-[21px] text-red-500 hover:text-blue-500",
    );
  });
  it.each<[Field, string, string, string]>([
    ["color", "#AaBbCc", "#aabbcc", "text-[#aabbcc]"],
    ["backgroundColor", "#ABCDEF", "#abcdef", "bg-[#abcdef]"],
    ["fontSize", "21", "21px", "text-[21px]"],
    ["fontWeight", "600", "600", "font-semibold"],
    ["padding", "0.5", "0.5px", "p-[0.5px]"],
    ["gap", "2px", "2px", "gap-[2px]"],
    ["borderRadius", "0", "0px", "rounded-[0px]"],
    ["width", ".5", "0.5px", "w-[0.5px]"],
    ["height", "20", "20px", "h-[20px]"],
  ])("normalizes %s", (field, value, css, token) => {
    expect(cssValue({ field, value })).toBe(css);
    const old = {
      color: "text-red-500",
      backgroundColor: "bg-white",
      fontSize: "text-sm",
      fontWeight: "font-bold",
      padding: "p-4",
      gap: "gap-2",
      borderRadius: "rounded-lg",
      width: "w-full",
      height: "h-auto",
    }[field as Exclude<Field, "text">];
    expect(changeUtility(old, { field, value })).toBe(token);
    expect(utilityField(token)).toBe(field);
    expect(utilityValue(token, field)).toBe(
      css.endsWith("px") ? css.slice(0, -2) : css,
    );
  });
  it.each([
    "-1",
    "Infinity",
    "NaN",
    "1e3",
    "1px; color:red",
    "calc(1px)",
    "1%",
    "",
  ])("declines invalid lengths %s", (value) =>
    expect(cssValue({ field: "width", value })).toBeNull(),
  );
  it.each(["#abc", "#abcd", "red", "url(x)", "#gggggg"])(
    "declines invalid colours %s",
    (value) => expect(cssValue({ field: "color", value })).toBeNull(),
  );
  it.each(["50", "950", "450", "bold", "100.0"])(
    "declines invalid weights %s",
    (value) => expect(cssValue({ field: "fontWeight", value })).toBeNull(),
  );
  it.each([
    "thin",
    "extralight",
    "light",
    "normal",
    "medium",
    "semibold",
    "bold",
    "extrabold",
    "black",
  ])("maps weight %s", (name) => {
    const index = [
      "thin",
      "extralight",
      "light",
      "normal",
      "medium",
      "semibold",
      "bold",
      "extrabold",
      "black",
    ].indexOf(name);
    const value = String((index + 1) * 100);
    expect(changeUtility("font-normal", { field: "fontWeight", value })).toBe(
      `font-${name}`,
    );
    expect(utilityValue(`font-${name}`, "fontWeight")).toBe(value);
  });
  it.each(["000.50", ".50", "0.500px"])(
    "normalizes decimal input %s",
    (value) => {
      expect(cssValue({ field: "padding", value })).toBe("0.5px");
    },
  );
  it("rejects finite-looking decimals that overflow", () => {
    expect(cssValue({ field: "gap", value: "9".repeat(400) })).toBeNull();
  });
  it("declines text and missing recognized utilities", () => {
    expect(cssValue({ field: "text", value: "hello" })).toBeNull();
    expect(
      changeUtility("billing-summary", { field: "width", value: "32" }),
    ).toBeNull();
  });
  it("preserves unrelated tokens and whitespace while removing duplicate family tokens", () => {
    expect(
      changeUtility(
        "\ttext-red-500  text-sm\ntext-blue-500 hover:text-white custom ",
        { field: "color", value: "#123456" },
      ),
    ).toBe("\ttext-[#123456]  text-sm\n hover:text-white custom ");
  });
  it.each([
    "hover:text-red-500",
    "text-[color:var(--brand)]",
    "text-[length:var(--size)]",
    "bg-[url(foo)]",
    "text-[expression(x)]",
    "text-[color:12px]",
    "text-[length:#abc]",
    "hover:text-[color:#abc]",
    "[&:hover]:text-[#abc]",
    "!text-red-500",
    "text-center",
    "text-billing",
    "font-heading",
    "p-custom",
    "w-[calc(100%-2px)]",
  ])("preserves ambiguous/custom %s", (token) =>
    expect(utilityField(token)).toBeNull(),
  );
  it.each([
    "text-white/60",
    "text-red-500/50",
    "text-[#AbC]/25",
    "bg-black/100",
  ])("replaces opacity colour %s", (token) => {
    const field = token.startsWith("bg-") ? "backgroundColor" : "color";
    expect(utilityField(token)).toBe(field);
    expect(utilityValue(token, field)).toBe(token);
    expect(changeUtility(token, { field, value: "#123456" })).toBe(
      `${field === "color" ? "text" : "bg"}-[#123456]`,
    );
    expect(utilityField(`hover:${token}`)).toBeNull();
  });
  it.each([
    "!text-red-500",
    "text-red-500!",
    "!text-white/60",
    "bg-[#abc]!",
    "!w-full",
  ])("blocks important %s", (token) => {
    const field = token.includes("bg-")
      ? "backgroundColor"
      : token.includes("w-")
        ? "width"
        : "color";
    expect(utilityBlocked(`flex ${token}`, field)).toBe(true);
    expect(utilityBlocked(`hover:${token}`, field)).toBe(false);
    expect(utilityBlocked(token, "gap")).toBe(false);
  });
  it("leaves variants and unsupported opacity forms alone", () => {
    expect(utilityField("text-red-500/999")).toBeNull();
    expect(utilityField("text-red-500/60/60")).toBeNull();
    expect(utilityBlocked("text-red-500", "color")).toBe(false);
    expect(
      changeUtility("hover:text-white/60 text-black/40", {
        field: "color",
        value: "#123456",
      }),
    ).toBe("hover:text-white/60 text-[#123456]");
  });
  it("recognizes typed arbitrary values and reports the effective last base utility", () => {
    expect(utilityField("text-[color:#AbC]")).toBe("color");
    expect(utilityField("text-[length:12px]")).toBe("fontSize");
    expect(
      utilityValue("text-red-500 hover:text-white text-[#AbC]", "color"),
    ).toBe("#aabbcc");
    expect(utilityValue("w-full", "width")).toBe("w-full");
    expect(utilityValue("hover:w-full", "width")).toBeNull();
  });
});
