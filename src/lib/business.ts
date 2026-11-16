// What the shop does, chosen at first start or later in Настройки. A
// business sets the board's stage names, which features are on and the
// usual jobs it starts with. Changing it is a plan the owner reviews: it
// only renames, switches and adds; the owner's own settings stay unless
// ticked; nothing in the work orders, clients or cars changes.
import type { Job, LaborLine, NewJob, PartLine, Shop } from "../api";
import { FeatureKey, FEATURES, resolveFeatures, toggle } from "./features";
import { DEFAULT_STATUS_LABEL, OPTIONAL_STAGES, STATUS_ORDER } from "./format";

export const CAR = "автосервиз";

export interface Business {
  id: string;
  name: string;
  /** One line under the name. */
  sub: string;
  /** Stage names that differ from the defaults. */
  stageNames: Record<string, string>;
  /** Optional stages it does not use. */
  hidden: string[];
  /** Feature switches that differ from the defaults. */
  features: Partial<Record<FeatureKey, boolean>>;
  jobs: NewJob[];
}

const labor = (description: string, hours: number): LaborLine => ({ description, mechanic: "", hours, rate: "0.00" });
const part = (name: string, quantity: number, unit = "бр."): PartLine => ({ part: name, partNumber: "", quantity, unit, price: "0.00" });
const job = (name: string, stage: string, l: LaborLine[], p: PartLine[] = []): NewJob => ({ name, stage, labor: l, parts: p });

/** The examples every folder from before 0.5 got (the same as the files shipped then). */
const OIL = job("Обслужване – масло и филтри", "В ремонт", [labor("Смяна на масло и филтри", 1)], [part("Двигателно масло", 5, "л"), part("Маслен филтър", 1), part("Уплътнение пробка картер", 1), part("Въздушен филтър", 1), part("Филтър купе", 1)]);
const AC = job("Обслужване на климатик", "В ремонт", [labor("Обслужване на климатик: вакуум, проверка за течове, зареждане", 1)], [part("Хладилен агент", 500, "г"), part("Компресорно масло", 1), part("UV добавка", 1), part("Филтър купе", 1)]);
const TYRES = job("Сезонна смяна на гуми", "В ремонт", [labor("Демонтаж и монтаж на 4 гуми", 1), labor("Баланс на 4 гуми", 0.5)], [part("Тежести за баланс", 1, "к-т")]);
export const CAR_EXAMPLES: NewJob[] = [OIL, AC, TYRES];

const NO_CAR_TOOLS = { schedule: false, faultCodes: false, links: false } as const;

export const BUSINESSES: Business[] = [
  { id: CAR, name: "Автосервиз", sub: "механика, обслужване, ремонт", stageNames: {}, hidden: [], features: {}, jobs: [OIL, AC] },
  {
    id: "бояджийски",
    name: "Тенекеджийски и бояджийски",
    sub: "щети, боядисване, оферти за застраховател",
    stageNames: { диагностика: "Оглед", в_ремонт: "Боядисване" },
    hidden: [],
    features: { schedule: false, faultCodes: false },
    jobs: [
      job("Боядисване на елемент", "Боядисване", [labor("Подготовка и боядисване на елемент", 4)], [part("Боя по код на цвета", 0.5, "л"), part("Лак", 0.5, "л"), part("Грунд", 0.3, "л"), part("Шкурки и консумативи", 1, "к-т")]),
      job("Изправяне без боядисване", "Боядисване", [labor("Изправяне на вдлъбнатина без боядисване", 1.5)]),
      job("Полиране на фарове", "Боядисване", [labor("Полиране на фарове", 1)], [part("Лак за фарове", 1)]),
    ],
  },
  {
    id: "гуми",
    name: "Гуми",
    sub: "смяна, баланс, ремонт на гуми",
    stageNames: { в_ремонт: "В работа" },
    hidden: ["диагностика", "чака_части"],
    features: { ...NO_CAR_TOOLS },
    jobs: [TYRES, job("Баланс на 4 гуми", "В работа", [labor("Баланс на 4 гуми", 0.5)], [part("Тежести за баланс", 1, "к-т")]), job("Ремонт на спукана гума", "В работа", [labor("Ремонт на спукана гума", 0.5)], [part("Лепенка", 1)])],
  },
  {
    id: "автоелектрика",
    name: "Автоелектрика и диагностика",
    sub: "грешки, електроника, ключове",
    stageNames: {},
    hidden: [],
    features: { schedule: false },
    jobs: [
      job("Компютърна диагностика", "Диагностика", [labor("Компютърна диагностика", 1)]),
      job("Смяна на акумулатор", "В ремонт", [labor("Смяна на акумулатор и регистриране", 0.5)], [part("Акумулатор", 1)]),
      job("Програмиране на ключ", "В ремонт", [labor("Програмиране на ключ", 1)], [part("Ключ или дистанционно", 1)]),
    ],
  },
  {
    id: "детайлинг",
    name: "Детайлинг и почистване",
    sub: "почистване, полиране, покрития",
    stageNames: { в_ремонт: "В работа" },
    hidden: ["диагностика", "чака_части"],
    features: { ...NO_CAR_TOOLS, vin: false },
    jobs: [
      job("Пълно почистване", "В работа", [labor("Пълно почистване – вътре и вън", 3)]),
      job("Полиране на купе", "В работа", [labor("Полиране на купе", 5)], [part("Пасти и консумативи", 1, "к-т")]),
      job("Керамично покритие", "В работа", [labor("Нанасяне на керамично покритие", 6)], [part("Керамично покритие", 1)]),
    ],
  },
  { id: "друго", name: "Друго", sub: "празно – настройвам сам", stageNames: { в_ремонт: "В работа" }, hidden: ["диагностика", "чака_части"], features: { ...NO_CAR_TOOLS }, jobs: [] },
];

/** The shop's business; folders from before 0.5 are a car service. */
export function businessOf(id: string | null | undefined): Business {
  return BUSINESSES.find((b) => b.id === id) ?? BUSINESSES[0];
}

/** The jobs of the business plus those of the other work it also does. */
export function jobsFor(id: string, extras: string[]): NewJob[] {
  const out: NewJob[] = [];
  for (const b of [businessOf(id), ...extras.filter((x) => x !== id).map(businessOf)]) {
    for (const j of b.jobs) if (!out.some((o) => o.name.toLowerCase() === j.name.toLowerCase())) out.push(j);
  }
  return out;
}

/** "Оглед", or "скрит" for a stage the business does not use. */
export function stageTarget(b: Business, k: string): string {
  if (OPTIONAL_STAGES.includes(k) && b.hidden.includes(k)) return HIDDEN;
  return b.stageNames[k] ?? DEFAULT_STATUS_LABEL[k];
}
export const HIDDEN = "скрит";

function stageNow(shop: Shop, k: string): string {
  if (OPTIONAL_STAGES.includes(k) && (shop.hiddenStages ?? []).includes(k)) return HIDDEN;
  return shop.stageNames?.[k]?.trim() || DEFAULT_STATUS_LABEL[k];
}

function featureIn(b: Business, k: FeatureKey): boolean {
  return resolveFeatures(b.features as Record<string, boolean>)[k];
}

export interface PlanRow {
  key: string;
  label: string;
  from: string;
  to: string;
  /** The owner set this by hand; kept unless ticked. */
  own: boolean;
}

export interface Plan {
  to: Business;
  extras: string[];
  stages: PlanRow[];
  features: PlanRow[];
  /** Jobs that are not in the folder yet. */
  addJobs: NewJob[];
  /** Car examples left unchanged that the new business does not use. */
  removable: Job[];
}

const sameLines = (a: Pick<Job, "labor" | "parts">, b: Pick<Job, "labor" | "parts">) =>
  JSON.stringify(a.labor.map((l) => [l.description, l.hours])) === JSON.stringify(b.labor.map((l) => [l.description, l.hours])) &&
  JSON.stringify(a.parts.map((p) => [p.part, p.quantity, p.unit])) === JSON.stringify(b.parts.map((p) => [p.part, p.quantity, p.unit]));

const zero = (j: Job) => j.labor.every((l) => !Number(l.rate)) && j.parts.every((p) => !Number(p.price) && !p.partNumber);

/** What would change, going from the shop as it is to the chosen business. */
export function planChange(shop: Shop, jobsNow: Job[], toId: string, extras: string[]): Plan {
  const from = businessOf(shop.businessType);
  const to = businessOf(toId);
  const stages: PlanRow[] = [];
  for (const k of STATUS_ORDER) {
    const now = stageNow(shop, k);
    const next = stageTarget(to, k);
    if (now !== next) stages.push({ key: k, label: DEFAULT_STATUS_LABEL[k], from: now, to: next, own: now !== stageTarget(from, k) });
  }
  const current = resolveFeatures(shop.features);
  const features: PlanRow[] = [];
  for (const f of FEATURES) {
    if (f.later) continue;
    const next = featureIn(to, f.key);
    if (current[f.key] !== next) features.push({ key: f.key, label: f.label, from: current[f.key] ? "вкл." : "изкл.", to: next ? "вкл." : "изкл.", own: current[f.key] !== featureIn(from, f.key) });
  }
  const wanted = jobsFor(to.id, extras);
  const have = new Set(jobsNow.map((j) => j.name.trim().toLowerCase()));
  const addJobs = wanted.filter((j) => !have.has(j.name.trim().toLowerCase()));
  const keep = new Set(wanted.map((j) => j.name.toLowerCase()));
  // A car service keeps all its examples; another business may drop them.
  const removable = to.id === CAR ? [] : jobsNow.filter((j) => {
    const ex = CAR_EXAMPLES.find((e) => e.name.toLowerCase() === j.name.trim().toLowerCase());
    return ex && !keep.has(ex.name.toLowerCase()) && sameLines(j, ex) && zero(j);
  });
  return { to, extras, stages, features, addJobs, removable };
}

export interface Choices {
  stages: Record<string, boolean>;
  features: Record<string, boolean>;
  addJobs: boolean;
  removeExamples: boolean;
}

/** Ticked by default: everything except the owner's own settings and removing examples. */
export function defaultChoices(plan: Plan): Choices {
  return {
    stages: Object.fromEntries(plan.stages.map((r) => [r.key, !r.own])),
    features: Object.fromEntries(plan.features.map((r) => [r.key, !r.own])),
    addJobs: true,
    removeExamples: false,
  };
}

/** The shop as it will be saved, and the job files to add and remove. */
export function applyPlan(shop: Shop, plan: Plan, c: Choices): { shop: Shop; addJobs: NewJob[]; removeFiles: string[] } {
  const names: Record<string, string> = { ...(shop.stageNames ?? {}) };
  let hidden = [...(shop.hiddenStages ?? [])];
  for (const r of plan.stages) {
    if (!c.stages[r.key]) continue;
    if (r.to === HIDDEN) {
      if (!hidden.includes(r.key)) hidden.push(r.key);
      continue;
    }
    hidden = hidden.filter((h) => h !== r.key);
    if (r.to === DEFAULT_STATUS_LABEL[r.key]) delete names[r.key];
    else names[r.key] = r.to;
  }
  let features = { ...(shop.features ?? {}) };
  for (const r of plan.features) if (c.features[r.key]) features = toggle(features, r.key as FeatureKey, r.to === "вкл.");
  return {
    shop: { ...shop, businessType: plan.to.id, businessExtras: plan.extras.filter((x) => x !== plan.to.id), stageNames: names, hiddenStages: hidden, features },
    addJobs: c.addJobs ? plan.addJobs : [],
    removeFiles: c.removeExamples ? plan.removable.map((j) => j.file) : [],
  };
}

/** Number of ticked changes, for the button. */
export function countChanges(plan: Plan, c: Choices): number {
  return (
    plan.stages.filter((r) => c.stages[r.key]).length +
    plan.features.filter((r) => c.features[r.key]).length +
    (c.addJobs && plan.addJobs.length ? 1 : 0) +
    (c.removeExamples && plan.removable.length ? 1 : 0)
  );
}
