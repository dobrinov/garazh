import { describe, expect, it } from "vitest";
import { entryMinutes, formatMinutes, isRunning, parseDuration, toLaborHours } from "./time";

describe("time", () => {
  it("formats and parses durations", () => {
    expect(formatMinutes(85)).toBe("1:25");
    expect(formatMinutes(5)).toBe("0:05");
    expect(parseDuration("1:25")).toBe(85);
    expect(parseDuration("85")).toBe(85);
    expect(parseDuration("1ч 25м")).toBe(85);
    expect(parseDuration("2ч")).toBe(120);
    expect(parseDuration("40м")).toBe(40);
    expect(parseDuration("1,5")).toBe(90);
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });

  it("counts a running timer up to now", () => {
    const e = { date: "2026-11-16", start: "09:05", end: "", minutes: null, mechanic: "", note: "" };
    expect(isRunning(e)).toBe(true);
    expect(entryMinutes(e, new Date("2026-11-16T10:30:30"))).toBe(85);
    expect(entryMinutes({ ...e, end: "10:00", minutes: 55 })).toBe(55);
  });

  it("rounds to quarter hours for labour", () => {
    expect(toLaborHours(85)).toBe(1.5);
    expect(toLaborHours(7)).toBe(0);
    expect(toLaborHours(8)).toBe(0.25);
  });
});
