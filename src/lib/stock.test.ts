import { describe, expect, it } from "vitest";
import { formatQty, parseQty } from "./stock";

describe("stock quantities", () => {
  it("formats with a decimal comma", () => {
    expect(formatQty(2)).toBe("2");
    expect(formatQty(4.5)).toBe("4,5");
    expect(formatQty(-7)).toBe("-7");
  });
  it("parses what people type", () => {
    expect(parseQty("4,5")).toBe(4.5);
    expect(parseQty(" 10 ")).toBe(10);
    expect(parseQty("-2")).toBe(-2);
    expect(parseQty("+3")).toBe(3);
    expect(parseQty("")).toBeNull();
    expect(parseQty("abc")).toBeNull();
  });
});
