//! Per-computer settings: where the data folder is. Kept outside the data
//! folder (in the user's app-config folder) because it points at it.
#![allow(non_snake_case)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub dataDir: Option<String>,
    pub backupDir: Option<String>,
    pub backupDaily: bool,
    pub backupKeep: u32,
    pub lastBackup: Option<String>,
    /// Automatic update checks are on unless this is set.
    pub noAutoUpdate: bool,
}

impl AppConfig {
    pub fn load(config_dir: &Path) -> AppConfig {
        let mut c: AppConfig = fs::read_to_string(config_dir.join("config.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        if c.backupKeep == 0 {
            c.backupKeep = 30;
        }
        c
    }

    pub fn save(&self, config_dir: &Path) -> std::io::Result<()> {
        fs::create_dir_all(config_dir)?;
        let tmp = config_dir.join("config.json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(self).unwrap_or_default())?;
        fs::rename(tmp, config_dir.join("config.json"))
    }

    pub fn data_path(&self) -> Option<PathBuf> {
        self.dataDir.as_ref().map(PathBuf::from)
    }
}
