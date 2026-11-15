// Built-in shop logos: simple workshop symbols on a coloured badge, plus a
// monogram from the shop's name. Each is a standalone SVG so it can be saved
// as лого.svg in the data folder and opened anywhere.

const ICONS: Record<string, string> = {
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  car: "M5 17H3v-5l2-5h14l2 5v5h-2M9.5 17h5M3 12h18M7.5 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM16.5 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  wheel: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v6M12 15v6M3.5 9.2l5.7 1.8M14.8 13l5.7 1.8M3.5 14.8l5.7-1.8M14.8 11l5.7-1.8",
  piston: "M6 3h12v8.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 11.5zM6 5.8h12M6 8.2h12M10.5 13L9 19.5M13.5 13l1.5 6.5M7.5 19.5h9V21h-9z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z",
  plug: "M10 2h4v3h-4zM8.5 5h7v4h-7zM10 9h4l-.7 7h-2.6zM12 16v3M9.5 21h5M12 19v2",
  drop: "M12 3c3 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.8 6-11zM9.5 15a2.5 2.5 0 0 0 2.5 2.5",
};

export interface LogoPreset {
  id: string;
  label: string;
  svg: (shopName: string) => string;
}

function badge(icon: string, bg: string, round: boolean): string {
  const shape = round ? `<circle cx="32" cy="32" r="32" fill="${bg}"/>` : `<rect width="64" height="64" rx="14" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${shape}<g transform="translate(12.8 12.8) scale(1.6)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[icon]}"/></g></svg>`;
}

/** Up to two initials: "Автосервиз Петров" → "АП", "Мото-Хаус" → "МХ". */
export function initials(name: string): string {
  const words = name.trim().split(/[\s\-–—]+/).filter((w) => /\p{L}|\d/u.test(w));
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "А";
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const LOGO_PRESETS: LogoPreset[] = [
  {
    id: "monogram",
    label: "Инициали",
    svg: (name) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256"><rect width="64" height="64" rx="14" fill="#c2410c"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${initials(name).length > 1 ? 26 : 32}" fill="#fff">${escapeXml(initials(name))}</text></svg>`,
  },
  { id: "wrench", label: "Гаечен ключ", svg: () => badge("wrench", "#c2410c", false) },
  { id: "car", label: "Автомобил", svg: () => badge("car", "#15171c", true) },
  { id: "wheel", label: "Колело", svg: () => badge("wheel", "#1e40af", false) },
  { id: "piston", label: "Бутало", svg: () => badge("piston", "#3b404c", false) },
  { id: "gear", label: "Зъбно колело", svg: () => badge("gear", "#166534", true) },
  { id: "plug", label: "Запалителна свещ", svg: () => badge("plug", "#c2410c", true) },
  { id: "drop", label: "Масло", svg: () => badge("drop", "#15171c", false) },
];

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
