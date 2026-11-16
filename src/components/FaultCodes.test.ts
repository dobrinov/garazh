import { describe, expect, it } from "vitest";
import { faultSearchUrl, isGenericCode } from "./FaultCodes";

describe("fault code links", () => {
  it("knows generic codes", () => {
    expect(isGenericCode("P0401")).toBe(true);
    expect(isGenericCode("p2463")).toBe(true);
    expect(isGenericCode("U0100")).toBe(true);
    expect(isGenericCode("P1234")).toBe(false);
    expect(isGenericCode("B1000")).toBe(false);
  });

  it("searches with the car", () => {
    expect(faultSearchUrl("P0401", "Acura", "TSX")).toBe("https://www.google.com/search?q=P0401%20Acura%20TSX");
    expect(faultSearchUrl("P0401")).toBe("https://www.google.com/search?q=P0401");
  });
});
