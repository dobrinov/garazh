//! ZIP backups of the data folder, without the disposable index.

use crate::store::INDEX_DIR;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

pub const PREFIX: &str = "архив-";

fn add_dir(zipw: &mut zip::ZipWriter<fs::File>, root: &Path, dir: &Path, opts: SimpleFileOptions) -> std::io::Result<()> {
    let mut entries: Vec<_> = fs::read_dir(dir)?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name == INDEX_DIR || name.ends_with(".tmp") {
            continue;
        }
        let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
        if p.is_dir() {
            zipw.add_directory(format!("{rel}/"), opts).map_err(std::io::Error::other)?;
            add_dir(zipw, root, &p, opts)?;
        } else {
            zipw.start_file(rel, opts).map_err(std::io::Error::other)?;
            let mut buf = Vec::new();
            fs::File::open(&p)?.read_to_end(&mut buf)?;
            zipw.write_all(&buf)?;
        }
    }
    Ok(())
}

/// Write `архив-YYYY-MM-DD_HHMM.zip` into `target` and keep the newest `keep`.
pub fn backup(data: &Path, target: &Path, keep: u32) -> std::io::Result<PathBuf> {
    if target.starts_with(data) {
        return Err(std::io::Error::other("Папката за архив не може да е вътре в папката с данни"));
    }
    fs::create_dir_all(target)?;
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H%M%S").to_string();
    let out = target.join(format!("{PREFIX}{stamp}.zip"));
    let tmp = target.join(format!(".{PREFIX}{stamp}.zip.tmp"));
    {
        let f = fs::File::create(&tmp)?;
        let mut zipw = zip::ZipWriter::new(f);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        add_dir(&mut zipw, data, data, opts)?;
        let f = zipw.finish().map_err(std::io::Error::other)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, &out)?;
    prune(target, keep)?;
    Ok(out)
}

fn prune(target: &Path, keep: u32) -> std::io::Result<()> {
    let mut zips: Vec<PathBuf> = fs::read_dir(target)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let n = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            n.starts_with(PREFIX) && n.ends_with(".zip")
        })
        .collect();
    zips.sort();
    let excess = zips.len().saturating_sub(keep.max(1) as usize);
    for p in zips.into_iter().take(excess) {
        fs::remove_file(p)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_skips_index_and_prunes_old_archives() {
        let t = tempfile::tempdir().unwrap();
        let data = t.path().join("Данни");
        fs::create_dir_all(data.join("клиенти/0001 Иван")).unwrap();
        fs::write(data.join("клиенти/0001 Иван/клиент.md"), "---\nиме: Иван\n---\n").unwrap();
        fs::create_dir_all(data.join(INDEX_DIR)).unwrap();
        fs::write(data.join(INDEX_DIR).join("cache.db"), "x").unwrap();
        let target = t.path().join("Архив");
        fs::create_dir_all(&target).unwrap();
        for i in 0..3 {
            fs::write(target.join(format!("{PREFIX}2020-01-0{i}_000000.zip")), b"old").unwrap();
        }
        let out = backup(&data, &target, 2).unwrap();
        let mut archive = zip::ZipArchive::new(fs::File::open(&out).unwrap()).unwrap();
        let names: Vec<String> = (0..archive.len()).map(|i| archive.by_index(i).unwrap().name().to_string()).collect();
        assert!(names.iter().any(|n| n == "клиенти/0001 Иван/клиент.md"));
        assert!(!names.iter().any(|n| n.contains(INDEX_DIR)));
        let left = fs::read_dir(&target).unwrap().count();
        assert_eq!(left, 2);
        assert!(out.exists());
    }

    #[test]
    fn refuses_target_inside_data() {
        let t = tempfile::tempdir().unwrap();
        assert!(backup(t.path(), &t.path().join("архиви"), 5).is_err());
    }
}
