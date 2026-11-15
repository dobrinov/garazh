import type { Car, VinResult } from "../api";

export const VIN_FIELDS = ["make", "model", "year", "engine", "engineCode", "gearbox", "gearboxCode", "fuel"] as const;
export type VinField = (typeof VIN_FIELDS)[number];

/**
 * Fill a car from a VIN lookup. A field is filled when it is empty or was
 * filled from the VIN before; fields typed by hand (in manualFields, or
 * filled by hand and never from the VIN) are left alone.
 */
export function applyVin(car: Car, r: VinResult): { car: Car; filled: VinField[] } {
  const next: Car = { ...car, vinFields: [...car.vinFields] };
  const filled: VinField[] = [];
  if (!r.valid) return { car: next, filled };
  for (const f of r.fields) {
    const k = f.field as VinField;
    if (!(VIN_FIELDS as readonly string[]).includes(k)) continue;
    if (car.manualFields.includes(k)) continue;
    const current = car[k];
    const empty = current === null || current === undefined || String(current).trim() === "";
    if (!empty && !car.vinFields.includes(k)) continue;
    const value = k === "year" ? Number(f.value) || null : f.value;
    if (String(current ?? "") === String(value ?? "")) {
      if (!next.vinFields.includes(k)) next.vinFields.push(k);
      continue;
    }
    (next as Record<string, unknown>)[k] = value;
    if (!next.vinFields.includes(k)) next.vinFields.push(k);
    filled.push(k);
  }
  return { car: next, filled };
}
