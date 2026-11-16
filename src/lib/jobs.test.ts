import { describe, expect, it } from "vitest";
import { emptyOrder, Job } from "../api";
import { jobFromText, jobStage, lastDone, startJob } from "./jobs";

const job = (name: string, stage = "В ремонт"): Job => ({
  name,
  stage,
  file: `${name}.md`,
  labor: [{ description: name, mechanic: "", hours: 1, rate: "0.00" }],
  parts: [{ part: "Боя", partNumber: "", quantity: 0.5, unit: "л", price: "0.00" }],
});
const past = (date: string, title: string) => ({
  date,
  title,
  labor: [{ description: "Боядисване", mechanic: "Петър", hours: 3, rate: "45.00" }],
  parts: [{ part: "Боя RAL 9016", partNumber: "X1", quantity: 0.4, unit: "л", price: "60.00" }],
});

describe("usual jobs", () => {
  it("start in the stage written in the file, or В ремонт", () => {
    expect(jobStage(job("a", "В ремонт"))).toBe("в_ремонт");
    expect(jobStage(job("a", "Чака части"))).toBe("чака_части");
    expect(jobStage(job("a", ""))).toBe("в_ремонт");
  });

  it("are recognised in what the client said, only when one fits", () => {
    const jobs = [job("Сезонна смяна на гуми"), job("Обслужване на климатик")];
    expect(jobFromText(jobs, "сезонна смяна на гуми")?.name).toBe("Сезонна смяна на гуми");
    expect(jobFromText(jobs, "Свети лампа")).toBeNull();
    expect(jobFromText(jobs, "")).toBeNull();
  });

  it("take the lines from the last time the car had the same job", () => {
    const orders = [past("2025-05-01", "Боядисване на елемент"), past("2026-02-01", "боядисване на  елемент"), past("2026-06-01", "Друго")];
    expect(lastDone(job("Боядисване на елемент"), orders)?.date).toBe("2026-02-01");
    const { order, from } = startJob(emptyOrder("car"), job("Боядисване на елемент"), orders, "50.00");
    expect(from?.date).toBe("2026-02-01");
    expect(order).toMatchObject({ status: "в_ремонт", title: "Боядисване на елемент" });
    expect(order.parts[0]).toMatchObject({ part: "Боя RAL 9016", price: "60.00" });
    expect(order.labor[0]).toMatchObject({ mechanic: "", rate: "45.00" });
  });

  it("use the job's own lines, at the shop's rate, the first time", () => {
    const { order, from } = startJob(emptyOrder("car"), job("Полиране", ""), [], "50.00");
    expect(from).toBeNull();
    expect(order.labor[0]).toMatchObject({ description: "Полиране", rate: "50.00" });
    expect(order.parts[0].part).toBe("Боя");
  });
});
