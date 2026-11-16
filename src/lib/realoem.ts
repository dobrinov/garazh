/**
 * RealOEM (BMW, MINI, Rolls-Royce parts catalogue). Gараж only opens its
 * pages in the browser; nothing is fetched from it.
 */

export function isRealOemMake(make: string | null | undefined): boolean {
  const m = (make ?? "").trim().toLowerCase();
  return m.includes("bmw") || m === "mini" || m.startsWith("rolls");
}

// BMW numbers are 11 digits, often written in groups: 11 42 7 953 129.
const PART = /(?<![\d])(\d{2})[ .-]?(\d{2})[ .-]?(\d)[ .-]?(\d{3})[ .-]?(\d{3})(?![\d])/g;

/** BMW part numbers found in free text, as 11 plain digits, without repeats. */
export function bmwPartNumbers(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(PART)) {
    const n = m.slice(1).join("");
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** "11427953129" → "11 42 7 953 129", the way BMW prints it. */
export function formatBmwPart(n: string): string {
  return `${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
}

export function realOemPartUrl(n: string): string {
  return `https://www.realoem.com/bmw/enUS/partxref?q=${n}`;
}
