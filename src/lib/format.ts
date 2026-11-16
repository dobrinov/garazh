// Formatting and search helpers shared by every screen.

/** "1180.5" → 118050 cents. Accepts comma decimals and spaces. */
export function toCents(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 100);
  const t = v.replace(/[\s€]/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** 118050 → "1180.50" (the storage format) */
export function centsToString(c: number): string {
  const neg = c < 0;
  const a = Math.abs(Math.round(c));
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** 118050 → "€ 1 180,50" (for display) */
export function euro(c: number | string): string {
  const cents = typeof c === "string" ? toCents(c) : c;
  const neg = cents < 0;
  const a = Math.abs(cents);
  const whole = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "−" : ""}€ ${whole},${String(a % 100).padStart(2, "0")}`;
}

export function int(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function km(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${int(n)} км`;
}

/** "2026-11-28" → "28.11.2026" */
export function date(d: string | null | undefined): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysLabel(days: number): string {
  if (days < 0) return `изтекъл преди ${-days} дни`;
  if (days === 0) return "изтича днес";
  if (days === 1) return "утре";
  return `след ${days} дни`;
}

// Latin letters that look like the Cyrillic ones allowed on Bulgarian plates.
const LAT: Record<string, string> = {
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У",
};

/** Normalise for plate search: upper case, Latin look-alikes → Cyrillic, no spaces or dashes. */
export function plateKey(s: string): string {
  return s
    .toUpperCase()
    .replace(/[ABCEHKMOPTXY]/g, (ch) => LAT[ch])
    .replace(/[\s-]/g, "");
}

/** Normalise free text for search: upper case, no spaces, dashes or dots. */
export function textKey(s: string): string {
  return s.toUpperCase().replace(/[\s\-.()+]/g, "");
}

/** True when `query` matches any of the haystack strings (plates handled both ways). */
export function matches(query: string, plates: string[], texts: string[]): boolean {
  const q = query.trim();
  if (!q) return true;
  const qp = plateKey(q);
  const qt = textKey(q);
  return plates.some((p) => plateKey(p).includes(qp)) || texts.some((t) => textKey(t).includes(qt));
}

export const DEFAULT_STATUS_LABEL: Readonly<Record<string, string>> = {
  приета: "Приета",
  диагностика: "Диагностика",
  чака_части: "Чака части",
  в_ремонт: "В ремонт",
  готова: "Готова",
  предадена: "Предадена",
};

/** Stage names as the screens show them: the shop's own, or the defaults. */
export const STATUS_LABEL: Record<string, string> = { ...DEFAULT_STATUS_LABEL };

/** Stages a shop may switch off. The others are needed by every shop. */
export const OPTIONAL_STAGES = ["диагностика", "чака_части"];
let hiddenStages = new Set<string>();

/**
 * Apply the shop's stage names and hidden stages (from сервиз.md). A paint
 * shop calls "диагностика" "Оглед"; the files keep the stage values.
 */
export function setStageConfig(names: Record<string, string> | undefined, hidden: string[] | undefined) {
  for (const k of Object.keys(DEFAULT_STATUS_LABEL)) STATUS_LABEL[k] = names?.[k]?.trim() || DEFAULT_STATUS_LABEL[k];
  hiddenStages = new Set((hidden ?? []).filter((h) => OPTIONAL_STAGES.includes(h)));
}

export function isHiddenStage(s: string): boolean {
  return hiddenStages.has(s);
}

/** The shop renamed this stage. */
export function isRenamed(s: string): boolean {
  return STATUS_LABEL[s] !== DEFAULT_STATUS_LABEL[s];
}

export const STATUS_ORDER = ["приета", "диагностика", "чака_части", "в_ремонт", "готова", "предадена"];

export function statusTone(s: string): string {
  switch (s) {
    case "готова":
      return "ok";
    case "чака_части":
      return "warn";
    case "диагностика":
      return "violet";
    case "предадена":
      return "muted";
    default:
      return "info";
  }
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
