import { describe, expect, it } from "vitest";
import { initials, LOGO_PRESETS } from "./logos";

describe("logos", () => {
  it("makes initials from the shop name", () => {
    expect(initials("Автосервиз Петров")).toBe("АП");
    expect(initials("Мото-Хаус")).toBe("МХ");
    expect(initials("Гараж")).toBe("ГА");
    expect(initials("  ")).toBe("А");
  });
  it("every preset is a standalone SVG without scripts", () => {
    for (const p of LOGO_PRESETS) {
      const svg = p.svg("Тест <&>");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toContain("<script");
      expect(svg).not.toContain("<&>");
    }
  });
});
