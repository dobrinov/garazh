//! With the `embed-frontend` feature (the default, used by `cargo run`), the
//! screens are compiled into the app from `../dist`. Rebuild them first when
//! they are missing or older than the source, so `cargo run` always shows
//! the current UI. `pnpm tauri dev` turns the feature off and skips this.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

const FRONTEND_INPUTS: &[&str] = &["../src", "../index.html", "../package.json", "../vite.config.ts", "../tsconfig.json"];

fn newest(p: &Path) -> Option<SystemTime> {
    let meta = std::fs::metadata(p).ok()?;
    if meta.is_file() {
        return meta.modified().ok();
    }
    std::fs::read_dir(p).ok()?.flatten().filter_map(|e| newest(&e.path())).max()
}

fn build_frontend() {
    let dist = PathBuf::from("../dist/index.html");
    let built = std::fs::metadata(&dist).and_then(|m| m.modified()).ok();
    let source = FRONTEND_INPUTS.iter().filter_map(|p| newest(Path::new(p))).max();
    for p in FRONTEND_INPUTS {
        println!("cargo:rerun-if-changed={p}");
    }
    let stale = match (built, source) {
        (Some(b), Some(s)) => s > b,
        (None, _) => true,
        _ => false,
    };
    if !stale {
        return;
    }
    let pnpm = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
    let status = Command::new(pnpm)
        .args(["run", "build"])
        .current_dir("..")
        .status()
        .unwrap_or_else(|e| panic!("could not run `{pnpm} run build` to build the screens ({e}); install Node and pnpm, then run `pnpm install`"));
    assert!(status.success(), "`pnpm run build` failed; see the output above");
}

fn main() {
    if std::env::var_os("CARGO_FEATURE_EMBED_FRONTEND").is_some() {
        build_frontend();
    }
    tauri_build::build()
}
