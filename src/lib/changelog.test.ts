import { describe, expect, it } from "vitest";
import { changesBetween, compareVersions, parseChangelog } from "./changelog";
import bundled from "../../CHANGELOG.md?raw";

const text = `# Промени

Увод.

## Предстоящо

- още не е излязло

## 0.3.0 — 2026-12-01

- трето
- дълго нещо,
  продължено на втори ред

## 0.2.1 — 2026-11-16
- второ

## 0.2.0
- първо
`;

describe("changelog", () => {
  it("reads versions and items, skipping the unreleased section", () => {
    const r = parseChangelog(text);
    expect(r.map((x) => x.version)).toEqual(["0.3.0", "0.2.1", "0.2.0"]);
    expect(r[0]).toEqual({ version: "0.3.0", date: "2026-12-01", items: ["трето", "дълго нещо, продължено на втори ред"] });
    expect(r[2].date).toBe("");
  });

  it("accepts Windows line endings", () => {
    expect(parseChangelog(text.replace(/\n/g, "\r\n"))[1].items).toEqual(["второ"]);
  });

  it("compares versions by number, not text", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
  });

  it("lists everything between the installed and the new version", () => {
    const r = parseChangelog(text);
    expect(changesBetween(r, "0.2.0", "0.3.0").map((x) => x.version)).toEqual(["0.3.0", "0.2.1"]);
    expect(changesBetween(r, "0.2.1", "0.2.1")).toEqual([]);
  });

  it("the bundled CHANGELOG.md parses", () => {
    const r = parseChangelog(bundled);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.items.length > 0)).toBe(true);
  });
});
