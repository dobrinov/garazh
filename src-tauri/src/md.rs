//! Plain-text file format: Markdown files with a YAML front-matter header,
//! Markdown tables for growing lists, and crash-safe writes.
//!
//! In memory and over IPC every record uses English camelCase field names.
//! On disk the header uses Bulgarian keys so the owner can read the files
//! in Notepad. `KEYS` maps between the two; unknown keys pass through
//! untouched, so fields added by hand survive a save.

use serde::{de::DeserializeOwned, Serialize};
use serde_json::{Map, Value};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::Path;

const BOM: &str = "\u{feff}";

/// English (IPC) name → Bulgarian (file) name.
const KEYS: &[(&str, &str)] = &[
    ("schema", "схема"),
    ("name", "име"),
    ("phone", "телефон"),
    ("email", "имейл"),
    ("address", "адрес"),
    ("eik", "еик"),
    ("laborRate", "ставка_труд"),
    ("vatPercent", "ддс_процент"),
    ("vatRegistered", "регистриран_по_ддс"),
    ("counters", "броячи"),
    ("client", "клиент"),
    ("workOrder", "работна_карта"),
    ("features", "функции"),
    ("number", "номер"),
    ("kind", "вид"),
    ("gdprConsent", "gdpr_съгласие"),
    ("discountPercent", "отстъпка_процент"),
    ("created", "създаден"),
    ("clientId", "клиент_id"),
    ("plate", "рег_номер"),
    ("make", "марка"),
    ("model", "модел"),
    ("year", "година"),
    ("engine", "двигател"),
    ("engineCode", "код_двигател"),
    ("gearbox", "кутия"),
    ("gearboxCode", "код_кутия"),
    ("fuel", "гориво"),
    ("color", "цвят"),
    ("paintCode", "код_боя"),
    ("tyres", "гуми"),
    ("inspectionUntil", "гтп_до"),
    ("insuranceUntil", "го_до"),
    ("vignetteUntil", "винетка_до"),
    ("manualFields", "ръчно"),
    ("pastOwners", "предишни_собственици"),
    ("carId", "кола_id"),
    ("date", "дата"),
    ("title", "заглавие"),
    ("status", "статус"),
    ("mileage", "пробег"),
    ("fuelLevel", "ниво_гориво"),
    ("complaint", "оплакване"),
    ("mechanic", "механик"),
    ("labor", "труд"),
    ("parts", "части"),
    ("description", "дейност"),
    ("hours", "часове"),
    ("rate", "ставка"),
    ("part", "част"),
    ("partNumber", "кат_номер"),
    ("quantity", "количество"),
    ("unit", "мярка"),
    ("price", "цена"),
    ("payment", "плащане"),
    ("paid", "платено"),
    ("closedOn", "приключена"),
    ("historyWritten", "записана_в_историята"),
    ("stockCode", "склад_код"),
    ("stockTaken", "изписано_от_склада"),
    ("vinFields", "от_vin"),
    ("schedules", "графици"),
    ("makes", "марки"),
    ("engines", "двигатели"),
    ("gearboxes", "кутии"),
    ("source", "източник"),
    ("verified", "проверено"),
    ("quote", "оферта"),
    ("report", "доклад"),
    ("orderId", "рк_id"),
    ("validUntil", "валидна_до"),
    ("findings", "констатации"),
    ("recommendations", "препоръки"),
    ("faultCodes", "кодове_грешки"),
    ("code", "код"),
    ("text", "текст"),
    ("logo", "лого"),
];

fn to_file_key(k: &str) -> Option<&'static str> {
    KEYS.iter().find(|(en, _)| *en == k).map(|(_, bg)| *bg)
}
fn to_ipc_key(k: &str) -> Option<&'static str> {
    KEYS.iter().find(|(_, bg)| *bg == k).map(|(en, _)| *en)
}

fn rename_keys(v: Value, f: fn(&str) -> Option<&'static str>) -> Value {
    match v {
        Value::Object(m) => {
            let mut out = Map::new();
            for (k, val) in m {
                let key = f(&k).map(str::to_string).unwrap_or(k);
                out.insert(key, rename_keys(val, f));
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.into_iter().map(|x| rename_keys(x, f)).collect()),
        other => other,
    }
}

/// Drop empty values so files stay short: null, "", [] and {}.
fn prune(v: Value) -> Value {
    match v {
        Value::Object(m) => {
            let mut out = Map::new();
            for (k, val) in m {
                let val = prune(val);
                let empty = match &val {
                    Value::Null => true,
                    Value::String(s) => s.is_empty(),
                    Value::Array(a) => a.is_empty(),
                    Value::Object(o) => o.is_empty(),
                    _ => false,
                };
                if !empty {
                    out.insert(k, val);
                }
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.into_iter().map(prune).collect()),
        other => other,
    }
}

pub fn read_text(p: &Path) -> std::io::Result<String> {
    let s = fs::read_to_string(p)?;
    let s = s.strip_prefix(BOM).map(str::to_string).unwrap_or(s);
    Ok(s.replace("\r\n", "\n"))
}

/// Write to a temp file in the same folder, flush, then rename over the
/// original. A crash leaves either the old or the new file, never half.
pub fn write_atomic(p: &Path, content: &str) -> std::io::Result<()> {
    let dir = p.parent().expect("file has a parent folder");
    fs::create_dir_all(dir)?;
    let name = p.file_name().expect("file name").to_string_lossy();
    let tmp = dir.join(format!(".{name}.tmp"));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(BOM.as_bytes())?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, p)
}

pub fn hash(text: &str) -> String {
    let mut h = DefaultHasher::new();
    text.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Split `---\n<yaml>---\n<body>` into its parts. No header → (None, text).
pub fn split_front_matter(text: &str) -> (Option<String>, String) {
    if let Some(rest) = text.strip_prefix("---\n") {
        let mut idx = 0;
        for line in rest.split_inclusive('\n') {
            if line.trim_end() == "---" {
                let yaml = rest[..idx].to_string();
                let body = rest[idx + line.len()..].trim_start_matches('\n').to_string();
                return (Some(yaml), body);
            }
            idx += line.len();
        }
    }
    (None, text.to_string())
}

/// Parse a record file into its typed header and free-text body.
pub fn parse_record<T: DeserializeOwned + Default>(text: &str) -> Result<(T, String), String> {
    // Files saved on Windows (Notepad, a git checkout) use CRLF line endings.
    let text = text.strip_prefix(BOM).unwrap_or(text).replace("\r\n", "\n");
    let (yaml, body) = split_front_matter(&text);
    let Some(yaml) = yaml else {
        return Ok((T::default(), body));
    };
    if yaml.trim().is_empty() {
        return Ok((T::default(), body));
    }
    let y: serde_yaml::Value = serde_yaml::from_str(&yaml).map_err(|e| format!("заглавната част (YAML): {e}"))?;
    let j = serde_json::to_value(y).map_err(|e| e.to_string())?;
    let j = rename_keys(j, to_ipc_key);
    let meta = serde_json::from_value(j).map_err(|e| format!("невалидно поле: {e}"))?;
    Ok((meta, body))
}

pub fn render_record<T: Serialize>(meta: &T, body: &str) -> Result<String, String> {
    let j = serde_json::to_value(meta).map_err(|e| e.to_string())?;
    let j = rename_keys(prune(j), to_file_key);
    let yaml = serde_yaml::to_string(&j).map_err(|e| e.to_string())?;
    let body = body.trim_matches('\n');
    if body.is_empty() {
        Ok(format!("---\n{yaml}---\n"))
    } else {
        Ok(format!("---\n{yaml}---\n\n{body}\n"))
    }
}

/// A Markdown table plus whatever text surrounds it in the file.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Table {
    pub prefix: String,
    pub rows: Vec<Vec<String>>,
    pub suffix: String,
}

fn cells(line: &str) -> Vec<String> {
    let t = line.trim();
    let t = t.strip_prefix('|').unwrap_or(t);
    let t = t.strip_suffix('|').unwrap_or(t);
    t.split('|').map(|c| c.trim().to_string()).collect()
}

fn is_separator(line: &str) -> bool {
    let c = cells(line);
    !c.is_empty() && c.iter().all(|x| !x.is_empty() && x.chars().all(|ch| ch == '-' || ch == ':'))
}

/// Read the first table in `body`. The header row is dropped; data rows are returned.
pub fn parse_table(body: &str) -> Table {
    let lines: Vec<&str> = body.lines().collect();
    let Some(start) = lines.iter().position(|l| l.trim_start().starts_with('|')) else {
        return Table { prefix: body.to_string(), ..Default::default() };
    };
    let mut end = start;
    while end < lines.len() && lines[end].trim_start().starts_with('|') {
        end += 1;
    }
    let mut rows = Vec::new();
    for (i, line) in lines[start..end].iter().enumerate() {
        if i == 0 || is_separator(line) {
            continue;
        }
        rows.push(cells(line));
    }
    Table {
        prefix: lines[..start].join("\n"),
        rows,
        suffix: lines[end..].join("\n"),
    }
}

fn clean_cell(s: &str) -> String {
    s.replace('|', "/").replace('\n', " ").trim().to_string()
}

/// Render a table with padded columns so it lines up in Notepad.
pub fn render_table(prefix: &str, header: &[&str], rows: &[Vec<String>], suffix: &str) -> String {
    let n = header.len();
    let rows: Vec<Vec<String>> = rows
        .iter()
        .map(|r| (0..n).map(|i| clean_cell(r.get(i).map(String::as_str).unwrap_or(""))).collect())
        .collect();
    let mut widths: Vec<usize> = header.iter().map(|h| h.chars().count().max(3)).collect();
    for r in &rows {
        for (i, c) in r.iter().enumerate() {
            widths[i] = widths[i].max(c.chars().count());
        }
    }
    let pad = |s: &str, w: usize| format!("{s}{}", " ".repeat(w.saturating_sub(s.chars().count())));
    let line = |cols: Vec<String>| format!("| {} |", cols.join(" | "));
    let mut out = String::new();
    let prefix = prefix.trim_end_matches('\n');
    if !prefix.is_empty() {
        out.push_str(prefix);
        out.push_str("\n\n");
    }
    out.push_str(&line(header.iter().enumerate().map(|(i, h)| pad(h, widths[i])).collect()));
    out.push('\n');
    out.push_str(&line(widths.iter().map(|w| "-".repeat(*w)).collect()));
    out.push('\n');
    for r in &rows {
        out.push_str(&line(r.iter().enumerate().map(|(i, c)| pad(c, widths[i])).collect()));
        out.push('\n');
    }
    let suffix = suffix.trim_matches('\n');
    if !suffix.is_empty() {
        out.push('\n');
        out.push_str(suffix);
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Serialize, Deserialize, Default, Debug, PartialEq)]
    #[serde(rename_all = "camelCase", default)]
    struct Demo {
        plate: String,
        year: Option<u32>,
        manualFields: Vec<String>,
        #[serde(flatten)]
        extra: Map<String, Value>,
    }

    #[test]
    fn record_round_trip_uses_bulgarian_keys_and_keeps_unknown_fields() {
        let text = "---\nрег_номер: СА 4821 КН\nгодина: 2016\nмоя_бележка: пази се\n---\n\nСвободен текст.\n";
        let (d, body): (Demo, String) = parse_record(text).unwrap();
        assert_eq!(d.plate, "СА 4821 КН");
        assert_eq!(d.year, Some(2016));
        assert_eq!(body, "Свободен текст.\n");
        let out = render_record(&d, &body).unwrap();
        assert!(out.contains("рег_номер: СА 4821 КН"));
        assert!(out.contains("моя_бележка: пази се"));
        assert!(!out.contains("ръчно"), "empty lists are not written");
        let (d2, _): (Demo, String) = parse_record(&out).unwrap();
        assert_eq!(d, d2);
    }

    #[test]
    fn file_without_header_is_body_only() {
        let (d, body): (Demo, String) = parse_record("само текст").unwrap();
        assert_eq!(d, Demo::default());
        assert_eq!(body, "само текст");
    }

    #[test]
    fn table_round_trip_keeps_surrounding_text() {
        let body = "# Части\n\n| Дата | Км |\n|---|---|\n| 2026-03-14 | 189 000 |\n| 2026-11-02 | 203400 |\n\nбележка";
        let t = parse_table(body);
        assert_eq!(t.rows.len(), 2);
        assert_eq!(t.rows[1], vec!["2026-11-02", "203400"]);
        let out = render_table(&t.prefix, &["Дата", "Км"], &t.rows, &t.suffix);
        let t2 = parse_table(&out);
        assert_eq!(t2.rows, t.rows);
        assert!(out.starts_with("# Части"));
        assert!(out.trim_end().ends_with("бележка"));
    }

    #[test]
    fn pipes_in_cells_do_not_break_the_table() {
        let out = render_table("", &["Част"], &[vec!["A|B".into()]], "");
        assert_eq!(parse_table(&out).rows, vec![vec!["A/B".to_string()]]);
    }

    #[test]
    fn atomic_write_adds_bom_and_reads_back_clean() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.md");
        write_atomic(&p, "здравей\r\n").unwrap();
        let raw = fs::read(&p).unwrap();
        assert_eq!(&raw[..3], &[0xEF, 0xBB, 0xBF]);
        assert_eq!(read_text(&p).unwrap(), "здравей\n");
        assert!(!dir.path().join(".a.md.tmp").exists());
    }

    #[test]
    fn windows_line_endings_and_bom_are_accepted() {
        let text = "\u{feff}---\r\nрег_номер: СА 1\r\n---\r\n\r\nБележка\r\n";
        let (d, body): (Demo, String) = parse_record(text).unwrap();
        assert_eq!(d.plate, "СА 1");
        assert_eq!(body, "Бележка\n");
    }
}
