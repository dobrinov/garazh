import { describe, expect, it } from "vitest";
import { computeTotals } from "./totals";

describe("work order totals", () => {
  it("matches the Rust calculation (see model.rs test)", () => {
    const t = computeTotals(
      [{ description: "", mechanic: "", hours: 1.5, rate: "50.00" }],
      [{ part: "", partNumber: "", quantity: 4.6, unit: "л", price: "11.30" }],
      5,
      20,
    );
    expect(t).toEqual({ labor: 7500, parts: 5198, discount: 635, net: 12063, vat: 2413, total: 14476 });
  });
});
