// One dated history for a car, built from what is already in its folder:
// work orders, части.md, пробег.md, събития.md, quotes and documents. Nothing is
// stored for it, so folders from every version show their full history.
import type { CarEvent, FileInfo, OrderSummary, PartRow, QuoteSummary, Reading } from "../api";

export type HistoryKind = "order" | "event" | "parts" | "km" | "quote" | "doc";

/** `source` of the readings that come from събития.md (see events.rs). */
export const EVENT_SOURCE = "събитие";

export interface HistoryEntry {
  key: string;
  kind: HistoryKind;
  date: string;
  km: number | null;
  /** Work order or quote number. */
  number: string;
  title: string;
  sub: string;
  total: string | null;
  /** Work order stage, or quote status. */
  status: string;
  id: string;
  /** Parts fitted on this visit (from части.md). */
  parts: string[];
  path: string;
  /** The row of събития.md, for a past event. */
  event?: CarEvent;
}

function partText(p: PartRow): string {
  return [p.part, p.brand, p.quantity].filter((x) => x && x.trim()).join(" · ");
}

/** True for files in the car's own "документи" folder (not a repair's folder). */
function isCarDocument(f: FileInfo): boolean {
  return /[\\/]документи[\\/][^\\/]+$/.test(f.path);
}

export function buildHistory(input: {
  orders: OrderSummary[];
  parts: PartRow[];
  events?: CarEvent[];
  readings: Reading[];
  quotes: QuoteSummary[];
  documents: FileInfo[];
}): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const numbers = new Set(input.orders.map((o) => o.order.number).filter(Boolean));

  for (const o of input.orders) {
    const w = o.order;
    out.push({
      key: `o-${w.id}`,
      kind: "order",
      date: w.date,
      km: w.mileage,
      number: w.number,
      title: w.title || w.complaint || "Работна карта",
      sub: [w.labor.map((l) => l.description).filter(Boolean).join(", "), w.mechanic].filter(Boolean).join(" · "),
      total: o.totals.total,
      status: w.status,
      id: w.id,
      // Parts are written to части.md on closing; before that they are only on the card.
      parts: (w.historyWritten ? input.parts.filter((p) => p.order === w.number).map(partText) : w.parts.filter((p) => p.part.trim()).map((p) => [p.part, p.partNumber].filter(Boolean).join(" · "))),
      path: "",
    });
  }

  // Parts typed by hand (or from a work order that is no longer here), one entry per day.
  const loose = new Map<string, PartRow[]>();
  for (const p of input.parts) {
    if (p.order && numbers.has(p.order)) continue;
    const k = p.date || "—";
    loose.set(k, [...(loose.get(k) ?? []), p]);
  }
  for (const [d, rows] of loose) {
    out.push({
      key: `p-${d}`,
      kind: "parts",
      date: d === "—" ? "" : d,
      km: rows.find((r) => r.km !== null)?.km ?? null,
      number: "",
      title: rows.length === 1 ? rows[0].part : `${rows.length} части и консумативи`,
      sub: [...new Set(rows.map((r) => r.order).filter((x) => x && x !== "ръчно"))].join(", ") || "записани ръчно",
      total: null,
      status: "",
      id: "",
      parts: rows.length === 1 ? [] : rows.map(partText),
      path: "",
    });
  }

  input.events?.forEach((ev, i) => {
    out.push({
      key: `e-${i}-${ev.date}`,
      kind: "event",
      date: ev.date,
      km: ev.km,
      number: "",
      title: ev.what,
      sub: [ev.place, ev.note].filter((x) => x.trim()).join(" · "),
      total: ev.amount.trim() || null,
      status: "",
      id: "",
      parts: [],
      path: "",
      event: ev,
    });
  });

  // Readings that a work order or event did not bring in (those are already on it).
  for (const r of input.readings) {
    if (numbers.has(r.source) || r.source === EVENT_SOURCE) continue;
    out.push({
      key: `k-${r.date}-${r.km}`,
      kind: "km",
      date: r.date,
      km: r.km,
      number: "",
      title: "Отчитане на километража",
      sub: r.source || "ръчно",
      total: null,
      status: "",
      id: "",
      parts: [],
      path: "",
    });
  }

  for (const q of input.quotes) {
    out.push({
      key: `q-${q.quote.id}`,
      kind: "quote",
      date: q.quote.date,
      km: q.quote.mileage,
      number: q.quote.number,
      title: q.quote.title || "Документ",
      sub: q.orderNumber ? `към ${q.orderNumber}` : "",
      total: Number(q.totals.total) ? q.totals.total : null,
      status: q.quote.kind === "оферта" ? q.quote.status : "",
      id: q.quote.id,
      parts: [],
      path: "",
    });
  }

  for (const f of input.documents.filter(isCarDocument)) {
    out.push({
      key: `d-${f.path}`,
      kind: "doc",
      date: (f.modified ?? "").slice(0, 10),
      km: null,
      number: "",
      title: f.name,
      sub: "в папка „документи“",
      total: null,
      status: "",
      id: "",
      parts: [],
      path: f.path,
    });
  }

  // Newest first; on the same day a work order before what came with it.
  const rank: Record<HistoryKind, number> = { order: 0, event: 1, quote: 2, parts: 3, km: 4, doc: 5 };
  return out.sort((a, b) => b.date.localeCompare(a.date) || rank[a.kind] - rank[b.kind]);
}
