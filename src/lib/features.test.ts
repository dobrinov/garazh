import { describe, expect, it } from "vitest";
import { resolveFeatures, toggle } from "./features";

describe("features", () => {
  it("uses defaults for switches not written down", () => {
    const f = resolveFeatures({});
    expect(f.schedule).toBe(true);
    expect(f.vin).toBe(true);
    expect(f.vinOnline).toBe(true);
    expect(f.stock).toBe(false);
  });
  it("keeps dependencies consistent", () => {
    expect(resolveFeatures({ vin: false }).vinOnline).toBe(false);
    expect(toggle({ vin: false }, "vinOnline", true)).toMatchObject({ vin: true, vinOnline: true });
    expect(toggle({ vinOnline: true }, "vin", false)).toMatchObject({ vin: false, vinOnline: false });
  });
  it("never switches on features that are not ready", () => {
    expect(resolveFeatures({ stock: true }).stock).toBe(false);
  });
});
