import { describe, expect, it } from "vitest";
import { centsToString, date, euro, matches, plateKey, toCents } from "./format";

describe("money", () => {
  it("parses and prints", () => {
    expect(toCents("52,50")).toBe(5250);
    expect(toCents("€ 1 180")).toBe(118000);
    expect(toCents("")).toBe(0);
    expect(centsToString(118050)).toBe("1180.50");
    expect(centsToString(-5)).toBe("-0.05");
    expect(euro(118050)).toBe("€ 1 180,50");
    expect(euro("52.00")).toBe("€ 52,00");
  });
});

describe("search", () => {
  it("matches plates typed in Latin, without spaces", () => {
    expect(plateKey("ca 4821 kh")).toBe("СА4821КН");
    expect(matches("ca4821", ["СА 4821 КН"], [])).toBe(true);
    expect(matches("4821 КН", ["СА 4821 КН"], [])).toBe(true);
    expect(matches("ca4822", ["СА 4821 КН"], [])).toBe(false);
  });

  it("matches VIN fragments and make + model", () => {
    const texts = ["WVWZZZAUZGW123456", "Volkswagen Golf VII"];
    expect(matches("123456", [], texts)).toBe(true);
    expect(matches("golf vii", [], texts)).toBe(true);
    expect(matches("passat", [], texts)).toBe(false);
  });
});

describe("dates", () => {
  it("prints Bulgarian day.month.year", () => {
    expect(date("2026-11-28")).toBe("28.11.2026");
    expect(date(null)).toBe("—");
  });
});
