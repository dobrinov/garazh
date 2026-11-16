// Usual jobs (справочници/работи): work that needs no diagnosis. Picking one
// when a car comes in starts the work order in the job's stage with its lines,
// taken from the last time the car had the same job when there was one.
import type { Job, Money, OrderStatus, WorkOrder } from "../api";
import { stageOf } from "./stages";

/** The stage a job starts in; a job file without one starts in "В ремонт". */
export function jobStage(job: Pick<Job, "stage">): OrderStatus {
  return job.stage.trim() ? stageOf(job.stage) : "в_ремонт";
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** A job whose name the client said on the phone ("смяна на гуми"), if exactly one fits. */
export function jobFromText(jobs: Job[], text: string): Job | null {
  const t = norm(text);
  if (!t) return null;
  const hits = jobs.filter((j) => t.includes(norm(j.name)) || norm(j.name).includes(t));
  return hits.length === 1 ? hits[0] : null;
}

type Past = Pick<WorkOrder, "date" | "title" | "labor" | "parts">;

/** The car's latest work order for this job: same title, with lines. */
export function lastDone(job: Pick<Job, "name">, orders: Past[]): Past | null {
  const n = norm(job.name);
  return (
    orders
      .filter((o) => norm(o.title) === n && (o.parts.length > 0 || o.labor.some((l) => l.description.trim())))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

/** Starts a work order for the job. Returns where the lines came from. */
export function startJob(o: WorkOrder, job: Job, orders: Past[], rate: Money): { order: WorkOrder; from: Past | null } {
  const last = lastDone(job, orders);
  const src = last ?? job;
  const isZero = (m: Money) => !m || Number(m.replace(",", ".")) === 0;
  const labor = src.labor.filter((l) => l.description.trim()).map((l) => ({ ...l, mechanic: "", rate: isZero(l.rate) ? rate : l.rate }));
  return {
    order: { ...o, status: jobStage(job), title: job.name, labor: labor.length ? labor : o.labor, parts: src.parts.map((p) => ({ ...p })) },
    from: last,
  };
}
