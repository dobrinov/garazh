// Print the release notes for GitHub: every released version from
// CHANGELOG.md, newest first, without the intro and "Предстоящо".
// The app reads these notes (through latest.json) to show what changed
// between the installed version and the new one, even across skipped versions.
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = text.search(/^## v?\d+\.\d+\.\d+/m);
if (start < 0) {
  console.error("CHANGELOG.md has no released version.");
  process.exit(1);
}
process.stdout.write(text.slice(start).trim() + "\n");
