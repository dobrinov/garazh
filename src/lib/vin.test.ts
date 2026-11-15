import { describe, expect, it } from "vitest";
import { emptyCar, VinResult } from "../api";
import { applyVin } from "./vin";

const result: VinResult = {
  vin: "WVWZZZAUZGW123456",
  valid: true,
  country: "Германия",
  online: false,
  warnings: [],
  fields: [
    { field: "make", value: "Volkswagen", source: "VIN" },
    { field: "model", value: "Golf VII", source: "VIN" },
    { field: "year", value: "2016", source: "VIN" },
  ],
};

describe("applyVin", () => {
  it("fills empty fields and remembers they came from the VIN", () => {
    const { car, filled } = applyVin(emptyCar("c1"), result);
    expect(car.make).toBe("Volkswagen");
    expect(car.year).toBe(2016);
    expect(filled).toEqual(["make", "model", "year"]);
    expect(car.vinFields).toEqual(["make", "model", "year"]);
  });
  it("leaves manual and hand-typed fields alone", () => {
    const start = { ...emptyCar("c1"), model: "Golf VII Variant", manualFields: ["model"], make: "VW" };
    const { car, filled } = applyVin(start, result);
    expect(car.model).toBe("Golf VII Variant");
    expect(car.make).toBe("VW");
    expect(filled).toEqual(["year"]);
  });
  it("refreshes fields that came from the VIN before", () => {
    const start = { ...emptyCar("c1"), model: "Golf", vinFields: ["model"] };
    expect(applyVin(start, result).car.model).toBe("Golf VII");
  });
  it("does nothing for an invalid VIN", () => {
    expect(applyVin(emptyCar("c1"), { ...result, valid: false }).filled).toEqual([]);
  });
});
