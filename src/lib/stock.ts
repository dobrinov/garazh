/** 2 → "2", 4.5 → "4,5" (Bulgarian decimal comma). */
export function formatQty(q: number): string {
  const r = Math.round(q * 1000) / 1000;
  return String(r).replace(".", ",");
}

/** "4,5", "4.5", " 10 " → number; null when unreadable. */
export function parseQty(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t || !/^[+-]?\d*\.?\d+$/.test(t)) return null;
  return Number(t);
}
