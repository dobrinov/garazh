import { describe, expect, it } from "vitest";
import { bmwPartNumbers, formatBmwPart, isRealOemMake, realOemPartUrl } from "./realoem";

describe("realoem", () => {
  it("knows which makes RealOEM covers", () => {
    expect(isRealOemMake("BMW")).toBe(true);
    expect(isRealOemMake("BMW M")).toBe(true);
    expect(isRealOemMake("Mini")).toBe(true);
    expect(isRealOemMake("Rolls-Royce")).toBe(true);
    expect(isRealOemMake("Skoda")).toBe(false);
    expect(isRealOemMake("")).toBe(false);
  });

  it("finds BMW part numbers however they are written", () => {
    expect(bmwPartNumbers("BMW 11427953129")).toEqual(["11427953129"]);
    expect(bmwPartNumbers("оригинал 11 42 7 953 129")).toEqual(["11427953129"]);
    expect(bmwPartNumbers("11-42-7-953-129 / 11.42.7.953.129")).toEqual(["11427953129"]);
    expect(bmwPartNumbers("Mann HU 816 x, 34 11 6 860 016 и 34116860016")).toEqual(["34116860016"]);
  });

  it("ignores numbers that are not part numbers", () => {
    expect(bmwPartNumbers("MANN HU 816 x")).toEqual([]);
    expect(bmwPartNumbers("114279531290")).toEqual([]);
    expect(bmwPartNumbers("1142795312")).toEqual([]);
    expect(bmwPartNumbers("")).toEqual([]);
  });

  it("formats and links", () => {
    expect(formatBmwPart("11427953129")).toBe("11 42 7 953 129");
    expect(realOemPartUrl("11427953129")).toBe("https://www.realoem.com/bmw/enUS/partxref?q=11427953129");
  });
});
