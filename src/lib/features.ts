// Feature switches, kept in сервиз.md under "функции".
// Defaults must match feature_on() in src-tauri/src/commands.rs.

export type FeatureKey = "schedule" | "vin" | "vinOnline" | "quotes" | "links" | "faultCodes" | "stock";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  default: boolean;
  /** Needs these switched on. */
  requires?: FeatureKey[];
  /** Shown but cannot be switched on yet. */
  later?: boolean;
  /** Sends data outside the computer. */
  online?: boolean;
}

export const FEATURES: FeatureDef[] = [
  { key: "schedule", label: "График за поддръжка", description: "Интервали по двигател и кутия, кога е правено и кога предстои, според пробега на колата.", default: true },
  { key: "vin", label: "Разчитане на VIN", description: "Попълва марка, модел и година от VIN, без интернет. Всяко поле може да се промени ръчно.", default: true },
  { key: "vinOnline", label: "Онлайн проверка на VIN", description: "Допълва данни от безплатната услуга NHTSA vPIC (САЩ). За европейски коли дава малко данни. Изпраща се само VIN.", default: false, requires: ["vin"], online: true },
  { key: "quotes", label: "Оферти и доклади", description: "Оферти за ремонт, доклади за извършен ремонт и за диагностика – печат и PDF.", default: true },
  { key: "links", label: "Полезни връзки", description: "Връзки към каталози и техническа информация според марката, с данните на колата.", default: true },
  { key: "faultCodes", label: "Кодове за грешки от PDF", description: "Чете кодовете (P0401, U0100…) от PDF отчетите на диагностичния уред.", default: true },
  { key: "stock", label: "Склад", description: "Наличности на части и консумативи. Предстои в следваща версия.", default: false, later: true },
];

export type Features = Record<FeatureKey, boolean>;

export function resolveFeatures(stored: Record<string, boolean> | undefined): Features {
  const out = {} as Features;
  for (const f of FEATURES) {
    const v = stored?.[f.key];
    out[f.key] = f.later ? false : typeof v === "boolean" ? v : f.default;
  }
  // A feature whose dependency is off is off too.
  for (const f of FEATURES) {
    if (f.requires?.some((r) => !out[r])) out[f.key] = false;
  }
  return out;
}

/** Turn one switch and keep dependencies consistent. */
export function toggle(stored: Record<string, boolean>, key: FeatureKey, on: boolean): Record<string, boolean> {
  const next = { ...stored, [key]: on };
  if (on) {
    for (const r of FEATURES.find((f) => f.key === key)?.requires ?? []) next[r] = true;
  } else {
    for (const f of FEATURES) if (f.requires?.includes(key)) next[f.key] = false;
  }
  return next;
}
