// Prepare a release: move "Предстоящо" in CHANGELOG.md under the new
// version, set the version everywhere, commit and tag.
//
//   pnpm release 0.2.0
//
// Then push with `git push && git push --tags`; the "Windows installer"
// workflow builds a signed update and a draft GitHub release. Publish the
// draft to make installed apps offer the update.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: pnpm release <major.minor.patch>, e.g. pnpm release 0.2.0");
  process.exit(1);
}
const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
if (sh("git status --porcelain")) {
  console.error("Commit or stash your changes first.");
  process.exit(1);
}
if (sh(`git tag -l v${version}`)) {
  console.error(`Tag v${version} already exists.`);
  process.exit(1);
}

// CHANGELOG.md: the unreleased section becomes this version's section.
const UNRELEASED = "## Предстоящо";
const log = readFileSync("CHANGELOG.md", "utf8").replace(/\r\n/g, "\n");
const at = log.indexOf(UNRELEASED + "\n");
if (at < 0) {
  console.error(`CHANGELOG.md has no "${UNRELEASED}" section.`);
  process.exit(1);
}
const after = at + UNRELEASED.length + 1;
const next = log.slice(after).search(/^## /m);
const section = next < 0 ? log.slice(after) : log.slice(after, after + next);
if (!/^\s*[-*]\s+\S/m.test(section)) {
  console.error(`Write what changed under "${UNRELEASED}" in CHANGELOG.md first.`);
  process.exit(1);
}
const date = new Date().toISOString().slice(0, 10);
writeFileSync("CHANGELOG.md", log.slice(0, at) + `${UNRELEASED}\n\n## ${version} — ${date}\n` + log.slice(after));

const json = (path, set) => {
  const d = JSON.parse(readFileSync(path, "utf8"));
  set(d);
  writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
};
json("package.json", (d) => (d.version = version));
json("src-tauri/tauri.conf.json", (d) => (d.version = version));
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync("src-tauri/Cargo.toml", cargo);
// Refresh Cargo.lock for the new version without touching dependencies.
execSync("cargo update --workspace --offline", { cwd: "src-tauri", stdio: "inherit" });

sh("git add CHANGELOG.md package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
sh(`git commit -m "Version ${version}"`);
sh(`git tag v${version}`);
console.log(`\nVersion ${version} committed and tagged v${version}.\nPush with:  git push && git push --tags`);
