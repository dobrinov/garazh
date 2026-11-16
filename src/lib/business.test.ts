import { describe, expect, it } from "vitest";
import type { Job, NewJob, Shop } from "../api";
import { applyPlan, CAR_EXAMPLES, countChanges, defaultChoices, HIDDEN, jobsFor, planChange } from "./business";

const shop = (over: Partial<Shop> = {}): Shop => ({
  schema: 1,
  name: "Сервиз",
  phone: "",
  address: "",
  eik: "",
  laborRate: "50.00",
  vatPercent: 20,
  vatRegistered: true,
  logo: "",
  counters: { client: 0, workOrder: 0, quote: 0, report: 0 },
  features: {},
  ...over,
});
const asFile = (j: NewJob, file = `${j.name}.md`): Job => ({ ...j, file });
const legacyJobs = () => CAR_EXAMPLES.map((j) => asFile(j));

describe("business type", () => {
  it("leaves a car service from before 0.5 as it is", () => {
    const p = planChange(shop(), legacyJobs(), "автосервиз", []);
    expect(p.stages).toEqual([]);
    expect(p.features).toEqual([]);
    expect(p.addJobs).toEqual([]);
    expect(p.removable).toEqual([]);
  });

  it("plans a paint shop: renamed columns, two features off, its jobs, car examples removable", () => {
    const p = planChange(shop(), legacyJobs(), "бояджийски", []);
    expect(p.stages.map((r) => [r.key, r.from, r.to, r.own])).toEqual([
      ["диагностика", "Диагностика", "Оглед", false],
      ["в_ремонт", "В ремонт", "Боядисване", false],
    ]);
    expect(p.features.map((r) => [r.key, r.to])).toEqual([
      ["schedule", "изкл."],
      ["faultCodes", "изкл."],
    ]);
    expect(p.addJobs.map((j) => j.name)).toEqual(["Боядисване на елемент", "Изправяне без боядисване", "Полиране на фарове"]);
    expect(p.removable.map((j) => j.name)).toEqual(CAR_EXAMPLES.map((j) => j.name));
  });

  it("keeps the owner's own settings unless ticked", () => {
    const s = shop({ stageNames: { в_ремонт: "В работа" }, features: { schedule: false, faultCodes: true } });
    const p = planChange(s, [], "бояджийски", []);
    expect(p.stages.find((r) => r.key === "в_ремонт")).toMatchObject({ from: "В работа", to: "Боядисване", own: true });
    // Switched off by hand already: no row. Switched on by hand (the default): not own.
    expect(p.features.map((r) => [r.key, r.own])).toEqual([["faultCodes", false]]);
    const c = defaultChoices(p);
    expect(c.stages).toEqual({ диагностика: true, в_ремонт: false });
    const out = applyPlan(s, p, c);
    expect(out.shop.stageNames).toEqual({ в_ремонт: "В работа", диагностика: "Оглед" });
    expect(out.shop.businessType).toBe("бояджийски");
    expect(out.removeFiles).toEqual([]);
  });

  it("does not offer to remove examples the owner changed, or ones the new business uses", () => {
    const edited = asFile({ ...CAR_EXAMPLES[0], parts: [{ part: "Масло 5W30", partNumber: "X", quantity: 4, unit: "л", price: "60.00" }] });
    const p = planChange(shop(), [edited, asFile(CAR_EXAMPLES[1]), asFile(CAR_EXAMPLES[2], "гуми.md")], "гуми", []);
    expect(p.removable.map((j) => j.name)).toEqual(["Обслужване на климатик"]);
    expect(p.addJobs.map((j) => j.name)).toEqual(["Баланс на 4 гуми", "Ремонт на спукана гума"]);
  });

  it("hides stages and shows them again when going back", () => {
    const tyres = applyPlan(shop(), planChange(shop(), [], "гуми", []), defaultChoices(planChange(shop(), [], "гуми", []))).shop;
    expect(tyres.hiddenStages).toEqual(["диагностика", "чака_части"]);
    expect(tyres.stageNames).toEqual({ в_ремонт: "В работа" });
    expect(tyres.features).toMatchObject({ schedule: false, faultCodes: false, links: false });
    const back = planChange(tyres, [], "автосервиз", []);
    expect(back.stages.map((r) => [r.key, r.from, r.to, r.own])).toEqual([
      ["диагностика", HIDDEN, "Диагностика", false],
      ["чака_части", HIDDEN, "Чака части", false],
      ["в_ремонт", "В работа", "В ремонт", false],
    ]);
    const car = applyPlan(tyres, back, defaultChoices(back)).shop;
    expect(car.hiddenStages).toEqual([]);
    expect(car.stageNames).toEqual({});
    expect(car.features).toMatchObject({ schedule: true, faultCodes: true, links: true });
  });

  it("adds the jobs of the other work too, once", () => {
    expect(jobsFor("автосервиз", ["гуми", "автосервиз"]).map((j) => j.name)).toEqual([
      "Обслужване – масло и филтри",
      "Обслужване на климатик",
      "Сезонна смяна на гуми",
      "Баланс на 4 гуми",
      "Ремонт на спукана гума",
    ]);
    const p = planChange(shop(), [], "друго", []);
    expect(p.addJobs).toEqual([]);
    expect(countChanges(p, defaultChoices(p))).toBe(p.stages.length + p.features.length);
  });
});
