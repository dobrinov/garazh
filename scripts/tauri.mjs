// Runs the Tauri CLI. For `tauri dev` it switches off the `embed-frontend`
// cargo feature, so the window loads the screens from the Vite dev server
// with live reload instead of the embedded copy that `cargo run` uses.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args[0] === "dev") {
  const sep = args.indexOf("--");
  if (sep === -1) args.push("--", "--no-default-features");
  else args.splice(sep + 1, 0, "--no-default-features");
}
const bin = process.platform === "win32" ? "tauri.cmd" : "tauri";
const r = spawnSync(bin, args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
