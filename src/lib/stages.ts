// Work order stages: the board columns, the stage buttons and the one
// "next step" button of a work order.
import type { OrderStatus } from "../api";
import { STATUS_ORDER } from "./format";

/** Columns of the board. "Предадена" is not a column: the card leaves the board. */
export const BOARD_STAGES: OrderStatus[] = ["приета", "диагностика", "чака_части", "в_ремонт", "готова"];

/**
 * The stage as the screens use it. Work orders written by hand or by early
 * versions may have no stage or a misspelt one; they count as "приета"
 * (that is also what the program writes when it saves them).
 */
export function stageOf(status: string | null | undefined): OrderStatus {
  const s = (status ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return (STATUS_ORDER as string[]).includes(s) ? (s as OrderStatus) : "приета";
}

export interface NextStep {
  /** Button text. */
  label: string;
  /** Stage to move to. */
  to: OrderStatus;
  /** Also close the work order (write parts and mileage into the car's history). */
  close?: boolean;
}

/** The one main action for a work order at its current stage; null when it is handed over. */
export function nextStep(status: string, closed: boolean): NextStep | null {
  switch (stageOf(status)) {
    case "приета":
      return { label: "Започни диагностика", to: "диагностика" };
    case "диагностика":
      return { label: "Започни ремонт", to: "в_ремонт" };
    case "чака_части":
      return { label: "Частите дойдоха", to: "в_ремонт" };
    case "в_ремонт":
      return { label: "Готова е", to: "готова" };
    case "готова":
      return { label: closed ? "Предай на клиента" : "Предай и приключи", to: "предадена", close: !closed };
    default:
      return null;
  }
}

/** One line under the stage buttons: what happens next. */
export function stageHint(status: string, closed: boolean): string {
  switch (stageOf(status)) {
    case "приета":
      return "Следва диагностика или направо ремонт (бутоните за етап отгоре).";
    case "диагностика":
      return "Ако трябват части, изберете „Чака части“ отгоре.";
    case "чака_части":
      return "Колата чака доставка.";
    case "в_ремонт":
      return "„Готова е“ слага колата в „Днес → Готови за предаване“ с телефона на клиента.";
    case "готова":
      return closed
        ? "Картата е приключена. Остава да предадете колата."
        : "„Предай и приключи“ записва частите и пробега в историята на колата.";
    default:
      return closed ? "Колата е предадена и картата е приключена." : "Колата е предадена.";
  }
}

/** The same day one month earlier (31 March → 28/29 February). */
export function monthAgo(todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const last = new Date(y, m - 1, 0).getDate(); // days in the previous month
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * A ready car is kept on the board (and on Днес) for a month after its
 * last date – closed on, or received on when it was never closed. Older
 * ones were most likely collected without the stage being moved on; this
 * happens a lot with work orders closed in earlier versions, which left
 * them at "готова". They stay under "Всички".
 */
export function isStaleReady(order: { status: string; date: string; closedOn: string | null }, todayIso: string): boolean {
  if (stageOf(order.status) !== "готова") return false;
  const last = [order.date, order.closedOn ?? ""].sort().reverse()[0];
  return !!last && last < monthAgo(todayIso);
}

export interface StageTime {
  status: OrderStatus;
  minutes: number;
  /** The car is in this stage now. */
  current: boolean;
  /** Counted from a day only (orders from before 0.4): roughly. */
  approx: boolean;
}

function parseAt(at: string): { t: number; dayOnly: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(at.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), h ? Number(h) : 8, mi ? Number(mi) : 0);
  return { t: dt.getTime(), dayOnly: !h };
}

/**
 * How long the work order has been in each stage, from the marks the
 * program writes on every stage change. Clock time, nights included.
 * Orders from before 0.4 have no marks: the result is empty.
 */
export function stageTimes(order: { status: string; stages?: { status: string; at: string }[] }, now: Date): StageTime[] {
  const marks = (order.stages ?? []).map((m) => ({ status: stageOf(m.status), at: parseAt(m.at) })).filter((m) => m.at) as { status: OrderStatus; at: { t: number; dayOnly: boolean } }[];
  const out: StageTime[] = [];
  marks.forEach((m, i) => {
    const next = marks[i + 1];
    const last = !next;
    if (last && m.status === "предадена") return;
    const end = next ? next.at.t : now.getTime();
    const minutes = Math.max(0, Math.round((end - m.at.t) / 60000));
    const hit = out.find((x) => x.status === m.status);
    if (hit) {
      hit.minutes += minutes;
      hit.current = hit.current || last;
      hit.approx = hit.approx || m.at.dayOnly;
    } else {
      out.push({ status: m.status, minutes, current: last, approx: m.at.dayOnly });
    }
  });
  // Only when the last mark is the stage the order is in now does "current" hold.
  const cur = stageOf(order.status);
  out.forEach((x) => (x.current = x.current && x.status === cur));
  return out.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
}

/** Time in the current stage, or null when it is not known (older orders). */
export function timeInStage(order: { status: string; stages?: { status: string; at: string }[] }, now: Date): StageTime | null {
  return stageTimes(order, now).find((x) => x.current) ?? null;
}

/** 45 мин · 3 ч 20 мин · 2 д 4 ч */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return h ? `${d} д ${h} ч` : `${d} д`;
}

export interface StageStat {
  status: OrderStatus;
  /** Work orders with a known time in this stage. */
  count: number;
  total: number;
  average: number;
  median: number;
  /** The longest ones, most first. */
  slowest: { id: string; minutes: number; current: boolean }[];
}

export interface StageReport {
  stages: StageStat[];
  /** Work orders counted. */
  orders: number;
  /** Work orders left out: no times (from before 0.4) or a day-only intake. */
  unknown: number;
}

/**
 * Time spent in each board stage over many work orders. Day-only times
 * (orders taken in before 0.4) are left out rather than guessed. A stage a
 * car is in now counts until `now`.
 */
export function stageReport(orders: { id: string; status: string; stages?: { status: string; at: string }[] }[], now: Date, slowest = 3): StageReport {
  const by = new Map<OrderStatus, { id: string; minutes: number; current: boolean }[]>();
  let counted = 0;
  let unknown = 0;
  for (const o of orders) {
    const times = stageTimes(o, now).filter((t) => !t.approx && BOARD_STAGES.includes(t.status));
    if (times.length === 0) {
      unknown += 1;
      continue;
    }
    counted += 1;
    for (const t of times) {
      const list = by.get(t.status) ?? [];
      list.push({ id: o.id, minutes: t.minutes, current: t.current });
      by.set(t.status, list);
    }
  }
  const stages = BOARD_STAGES.map((status) => {
    const list = (by.get(status) ?? []).sort((a, b) => b.minutes - a.minutes);
    const total = list.reduce((s, x) => s + x.minutes, 0);
    const mid = list.length >> 1;
    const median = list.length === 0 ? 0 : list.length % 2 ? list[mid].minutes : Math.round((list[mid - 1].minutes + list[mid].minutes) / 2);
    return { status, count: list.length, total, average: list.length ? Math.round(total / list.length) : 0, median, slowest: list.filter((x) => x.minutes > 0).slice(0, slowest) };
  });
  return { stages, orders: counted, unknown };
}
