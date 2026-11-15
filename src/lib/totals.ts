// Mirrors WorkOrder::totals in src-tauri/src/model.rs so the screen shows
// exactly what will be stored.
import type { LaborLine, PartLine } from "../api";
import { toCents } from "./format";

export interface CentTotals {
  labor: number;
  parts: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
}

export function lineCents(price: string, qty: number): number {
  return Math.round(toCents(price) * (Number.isFinite(qty) ? qty : 0));
}

export function computeTotals(labor: LaborLine[], parts: PartLine[], discountPercent: number, vatPercent: number): CentTotals {
  const l = labor.reduce((s, x) => s + lineCents(x.rate, x.hours), 0);
  const p = parts.reduce((s, x) => s + lineCents(x.price, x.quantity), 0);
  const gross = l + p;
  const discount = Math.round((gross * discountPercent) / 100);
  const net = gross - discount;
  const vat = Math.round((net * vatPercent) / 100);
  return { labor: l, parts: p, discount, net, vat, total: net + vat };
}
