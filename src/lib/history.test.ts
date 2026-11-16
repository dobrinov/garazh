import { describe, expect, it } from "vitest";
import { emptyOrder, OrderSummary, PartRow } from "../api";
import { buildHistory } from "./history";

const totals = { labor: "0.00", parts: "0.00", discount: "0.00", net: "0.00", vat: "0.00", total: "312.40" };

function order(number: string, d: string, closed: boolean): OrderSummary {
  const o = emptyOrder("k-1");
  Object.assign(o, { id: `r-${number}`, number, date: d, title: "Обслужване", mileage: 176900, historyWritten: closed, status: closed ? "предадена" : "в_ремонт" });
  o.parts = [{ part: "Филтър", partNumber: "MANN", quantity: 1, unit: "бр.", price: "10.00", stockCode: "" }];
  return { order: o, totals, plate: "СА 1", carName: "Golf", clientName: "Иван", clientPhone: "" };
}

const part = (p: Partial<PartRow>): PartRow => ({ date: "2026-03-14", km: 176900, part: "Масло", brand: "Castrol", quantity: "4.7 л", price: "", order: "", ...p });

describe("buildHistory", () => {
  it("puts closed-order parts on the order and hand-typed parts on their own", () => {
    const h = buildHistory({
      orders: [order("РК-2026-0031", "2026-03-14", true), order("РК-2026-0112", "2026-11-16", false)],
      parts: [part({ order: "РК-2026-0031" }), part({ date: "2025-06-01", part: "Чистачки", order: "ръчно" }), part({ date: "2024-01-01", part: "Акумулатор", order: "РК-2023-0009" })],
      readings: [
        { date: "2026-03-14", km: 176900, source: "РК-2026-0031" },
        { date: "2026-11-02", km: 186800, source: "ръчно" },
      ],
      quotes: [],
      documents: [
        { name: "талон.pdf", path: "D:\\Данни\\клиенти\\0001 Иван\\СА1 Golf\\документи\\талон.pdf", size: 1, modified: "2026-01-05T10:00:00" },
        { name: "Diagnostika.pdf", path: "D:\\Данни\\клиенти\\0001 Иван\\СА1 Golf\\ремонти\\x\\Diagnostika.pdf", size: 1, modified: "2026-11-16T10:00:00" },
      ],
    });
    expect(h.map((e) => e.kind)).toEqual(["order", "km", "order", "doc", "parts", "parts"]);
    const closed = h.find((e) => e.number === "РК-2026-0031")!;
    expect(closed.parts).toEqual(["Масло · Castrol · 4.7 л"]);
    const open = h.find((e) => e.number === "РК-2026-0112")!;
    expect(open.parts).toEqual(["Филтър · MANN"]);
    // A part from a work order that is not in the program (an older folder) is still shown.
    expect(h.some((e) => e.title === "Акумулатор" && e.sub === "РК-2023-0009")).toBe(true);
    expect(h.filter((e) => e.kind === "km")).toHaveLength(1);
  });
});
