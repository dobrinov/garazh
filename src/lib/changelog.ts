/**
 * CHANGELOG.md: "## 0.2.1 — 2026-11-16" headings followed by "- " items.
 * The "Предстоящо" (unreleased) section and anything without a version
 * number is ignored.
 */
export interface Release {
  version: string;
  date: string;
  items: string[];
}

const HEADING = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(\S.*))?$/;

export function parseChangelog(text: string | null | undefined): Release[] {
  const out: Release[] = [];
  let cur: Release | null = null;
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      const m = HEADING.exec(line);
      cur = m ? { version: m[1], date: (m[2] ?? "").trim(), items: [] } : null;
      if (cur) out.push(cur);
    } else if (cur && /^\s*[-*]\s+/.test(line)) {
      cur.items.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (cur && /^\s{2,}\S/.test(line) && cur.items.length) {
      // Continuation of the previous item.
      cur.items[cur.items.length - 1] += " " + line.trim();
    }
  }
  return out;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/** Releases newer than `from` up to and including `to`, newest first. */
export function changesBetween(releases: Release[], from: string, to: string): Release[] {
  return releases
    .filter((r) => r.items.length > 0 && compareVersions(r.version, from) > 0 && compareVersions(r.version, to) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}
