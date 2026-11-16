// Put the latest released versions from CHANGELOG.md on the download page
// (site/index.html, between the changelog:start/end markers). Run by the
// Website workflow before publishing; safe to run locally too.
import { readFileSync, writeFileSync } from "node:fs";

const SHOW = 5;
const root = new URL("..", import.meta.url);
const log = readFileSync(new URL("CHANGELOG.md", root), "utf8").replace(/\r\n/g, "\n");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const releases = [];
let cur = null;
for (const line of log.split("\n")) {
  const h = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+))?$/.exec(line);
  if (line.startsWith("## ")) {
    cur = h ? { version: h[1], date: (h[2] ?? "").trim(), items: [] } : null;
    if (cur) releases.push(cur);
  } else if (cur && /^\s*[-*]\s+/.test(line)) cur.items.push(line.replace(/^\s*[-*]\s+/, ""));
  else if (cur && /^\s{2,}\S/.test(line) && cur.items.length) cur.items[cur.items.length - 1] += " " + line.trim();
}

const bgDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[3])}.${m[2]}.${m[1]}` : d;
};

const blocks = releases
  .filter((r) => r.items.length)
  .slice(0, SHOW)
  .map(
    (r) => `        <article style="display: flex; flex-direction: column; gap: 8px; padding: 22px 24px; border-radius: 16px; background: #fff; border: 1px solid #e2e2dc">
          <h3 style="margin: 0; font-size: 19px; font-weight: 700">Версия ${esc(r.version)}${r.date ? ` <span style="font-weight: 400; color: #5a6070; font-size: 15px">· ${esc(bgDate(r.date))}</span>` : ""}</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 15px; line-height: 1.6; color: #3b404c">
${r.items.map((i) => `            <li>${esc(i)}</li>`).join("\n")}
          </ul>
        </article>`,
  )
  .join("\n");

const section = `<!-- changelog:start (generated from CHANGELOG.md by scripts/site-changelog.mjs) -->
  <section id="novo" style="max-width: 1200px; margin: 0 auto; padding: 80px 24px">
    <div style="display: flex; flex-direction: column; gap: 24px">
      <h2 style="margin: 0; font-family: Manrope, Inter, sans-serif; font-weight: 800; font-size: 40px; letter-spacing: -0.01em">Какво ново</h2>
      <p style="margin: 0; font-size: 17px; line-height: 1.6; color: #3b404c">Инсталираната програма предлага новите версии сама и показва какво се променя.</p>
      <div style="display: flex; flex-direction: column; gap: 16px">
${blocks}
      </div>
      <a href="https://github.com/dobrinov/garazh/releases" style="color: #c2410c; font-weight: 600">Всички версии</a>
    </div>
  </section>
  <!-- changelog:end -->`;

const file = new URL("site/index.html", root);
const html = readFileSync(file, "utf8");
const re = /<!-- changelog:start[\s\S]*?<!-- changelog:end -->/;
const out = re.test(html) ? html.replace(re, section) : html.replace(/(\n\s*<footer)/, `\n\n  ${section}\n$1`);
if (out === html && !re.test(html)) {
  console.error("site/index.html: no place for the changelog (no <footer>).");
  process.exit(1);
}
writeFileSync(file, out);
console.log(`Changelog on the download page: ${Math.min(SHOW, releases.length)} versions.`);
