import type { TimeEntry } from "../api";

/** 85 → "1:25" */
export function formatMinutes(m: number): string {
  const v = Math.max(0, Math.round(m));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

/** "1:25", "85", "1ч 25м", "1,5" (hours) → minutes; null when unreadable. Same rules as timelog.rs. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let m = /^(\d+)\s*:\s*(\d{1,2})$/.exec(t);
  if (m) return Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
  m = /^(?:(\d+)\s*ч)?\s*(?:(\d+)\s*м)?$/.exec(t);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  if (/^\d+[.,]\d+$/.test(t)) return Math.round(Number(t.replace(",", ".")) * 60);
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

export function isRunning(e: TimeEntry): boolean {
  return e.minutes === null && !!e.start && !e.end;
}

/** Minutes so far for a running timer, or the recorded minutes. */
export function entryMinutes(e: TimeEntry, now: Date = new Date()): number {
  if (!isRunning(e)) return e.minutes ?? 0;
  const started = new Date(`${e.date}T${e.start}:00`);
  const diff = (now.getTime() - started.getTime()) / 60000;
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff)) : 0;
}

/** Hours for a labour line, rounded to the nearest quarter hour. */
export function toLaborHours(minutes: number): number {
  return Math.round(minutes / 15) / 4;
}
