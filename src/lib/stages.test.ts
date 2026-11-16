import { afterEach, describe, expect, it } from "vitest";
import { setStageConfig, STATUS_LABEL } from "./format";
import { BOARD_STAGES, formatDuration, isStaleReady, monthAgo, nextStep, stageOf, shopStages, stageReport, stageTimes, timeInStage } from "./stages";

describe("stageOf", () => {
  it("keeps known stages", () => {
    expect(stageOf("чака_части")).toBe("чака_части");
    expect(stageOf("предадена")).toBe("предадена");
  });
  it("treats missing or hand-written stages from older files as приета", () => {
    expect(stageOf("")).toBe("приета");
    expect(stageOf(undefined)).toBe("приета");
    expect(stageOf("нещо друго")).toBe("приета");
    expect(stageOf("Чака части")).toBe("чака_части");
  });
});

describe("nextStep", () => {
  it("moves through the stages", () => {
    expect(nextStep("приета", false)?.to).toBe("диагностика");
    expect(nextStep("чака_части", false)?.to).toBe("в_ремонт");
    expect(nextStep("в_ремонт", false)?.to).toBe("готова");
  });
  it("closes when handing over, unless closed before (the old Приключи)", () => {
    expect(nextStep("готова", false)).toMatchObject({ to: "предадена", close: true });
    expect(nextStep("готова", true)).toMatchObject({ to: "предадена", close: false });
    expect(nextStep("предадена", true)).toBeNull();
  });
});

describe("ready cards for a month", () => {
  it("counts back one calendar month", () => {
    expect(monthAgo("2026-11-16")).toBe("2026-10-16");
    expect(monthAgo("2026-03-31")).toBe("2026-02-28");
    expect(monthAgo("2026-01-10")).toBe("2025-12-10");
  });
  it("keeps recent ready cards and drops older ones, other stages always stay", () => {
    const today = "2026-11-16";
    expect(isStaleReady({ status: "готова", date: "2026-11-01", closedOn: null }, today)).toBe(false);
    expect(isStaleReady({ status: "готова", date: "2026-10-16", closedOn: null }, today)).toBe(false);
    expect(isStaleReady({ status: "готова", date: "2026-03-14", closedOn: "2026-03-14" }, today)).toBe(true);
    expect(isStaleReady({ status: "готова", date: "2026-09-01", closedOn: "2026-11-10" }, today)).toBe(false);
    expect(isStaleReady({ status: "в_ремонт", date: "2025-01-01", closedOn: null }, today)).toBe(false);
  });
});

describe("time in each stage", () => {
  const now = new Date(2026, 10, 16, 12, 0);
  it("adds up the time between stage changes, the last one until now", () => {
    const t = stageTimes(
      {
        status: "в_ремонт",
        stages: [
          { status: "приета", at: "2026-11-16 08:30" },
          { status: "диагностика", at: "2026-11-16 09:00" },
          { status: "в_ремонт", at: "2026-11-16 10:15" },
        ],
      },
      now,
    );
    expect(t.map((x) => [x.status, x.minutes, x.current])).toEqual([
      ["приета", 30, false],
      ["диагностика", 75, false],
      ["в_ремонт", 105, true],
    ]);
    expect(timeInStage({ status: "в_ремонт", stages: [{ status: "в_ремонт", at: "2026-11-16 10:15" }] }, now)?.minutes).toBe(105);
  });
  it("sums a stage visited twice and stops at handover", () => {
    const t = stageTimes(
      {
        status: "предадена",
        stages: [
          { status: "в_ремонт", at: "2026-11-16 08:00" },
          { status: "чака_части", at: "2026-11-16 09:00" },
          { status: "в_ремонт", at: "2026-11-16 10:00" },
          { status: "предадена", at: "2026-11-16 11:00" },
        ],
      },
      now,
    );
    expect(t.find((x) => x.status === "в_ремонт")?.minutes).toBe(120);
    expect(t.some((x) => x.status === "предадена")).toBe(false);
    expect(t.some((x) => x.current)).toBe(false);
  });
  it("knows nothing for orders from older versions", () => {
    expect(stageTimes({ status: "в_ремонт" }, now)).toEqual([]);
    expect(timeInStage({ status: "в_ремонт", stages: [] }, now)).toBeNull();
  });
  it("marks a day-only intake (from before 0.4) as rough", () => {
    expect(stageTimes({ status: "диагностика", stages: [{ status: "приета", at: "2026-11-02" }, { status: "диагностика", at: "2026-11-16 10:00" }] }, now)[0].approx).toBe(true);
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 мин");
    expect(formatDuration(200)).toBe("3 ч 20 мин");
    expect(formatDuration(60 * 52)).toBe("2 д 4 ч");
  });
});

describe("stage report", () => {
  const now = new Date(2026, 10, 16, 12, 0);
  const orders = [
    { id: "a", status: "предадена", stages: [{ status: "приета", at: "2026-11-16 08:00" }, { status: "диагностика", at: "2026-11-16 08:30" }, { status: "в_ремонт", at: "2026-11-16 09:30" }, { status: "предадена", at: "2026-11-16 11:30" }] },
    { id: "b", status: "в_ремонт", stages: [{ status: "приета", at: "2026-11-16 09:00" }, { status: "в_ремонт", at: "2026-11-16 10:00" }] },
    { id: "c", status: "диагностика", stages: [{ status: "приета", at: "2026-11-02" }, { status: "диагностика", at: "2026-11-16 11:00" }] },
    { id: "old", status: "в_ремонт" },
  ];
  it("adds up each stage over the work orders, the current one until now", () => {
    const r = stageReport(orders, now);
    const get = (s: string) => r.stages.find((x) => x.status === s)!;
    expect(get("приета")).toMatchObject({ count: 2, total: 90, average: 45, median: 45 });
    expect(get("в_ремонт")).toMatchObject({ count: 2, total: 240, average: 120 });
    expect(get("в_ремонт").slowest[0]).toEqual({ id: "a", minutes: 120, current: false });
    expect(get("в_ремонт").slowest.map((x) => x.current)).toEqual([false, true]);
    expect(get("чака_части").count).toBe(0);
  });
  it("leaves out day-only intakes and orders from before stage times", () => {
    const r = stageReport(orders, now);
    expect(r.stages.find((x) => x.status === "приета")!.slowest.map((x) => x.id)).not.toContain("c");
    expect(r.stages.find((x) => x.status === "диагностика")!.count).toBe(2);
    expect(r.orders).toBe(3);
    expect(r.unknown).toBe(1);
  });
});

describe("the shop's own stages", () => {
  afterEach(() => setStageConfig(undefined, undefined));
  it("renames stages on the buttons and keeps the stage values", () => {
    setStageConfig({ диагностика: "Оглед", в_ремонт: " Боядисване " }, []);
    expect(STATUS_LABEL.диагностика).toBe("Оглед");
    expect(STATUS_LABEL.в_ремонт).toBe("Боядисване");
    expect(nextStep("приета", false)).toEqual({ label: "Започни: Оглед", to: "диагностика" });
    expect(nextStep("диагностика", false)).toEqual({ label: "Започни: Боядисване", to: "в_ремонт" });
    expect(nextStep("в_ремонт", false)?.label).toBe("Готова е");
  });
  it("skips a stage the shop does not use, unless a card is in it", () => {
    setStageConfig({}, ["диагностика", "чака_части", "готова"]);
    expect(shopStages()).toEqual(["приета", "в_ремонт", "готова"]);
    expect(shopStages(BOARD_STAGES, (s) => s === "чака_части")).toEqual(["приета", "чака_части", "в_ремонт", "готова"]);
    expect(nextStep("приета", false)).toEqual({ label: "Започни ремонт", to: "в_ремонт" });
  });
  it("goes back to the defaults", () => {
    setStageConfig({ диагностика: "Оглед" }, ["диагностика"]);
    setStageConfig(undefined, undefined);
    expect(STATUS_LABEL.диагностика).toBe("Диагностика");
    expect(shopStages()).toEqual(BOARD_STAGES);
  });
});
