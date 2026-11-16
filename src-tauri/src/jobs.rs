#![allow(non_snake_case)]
//! Usual jobs of the shop ("обичайни работи"), one editable file each under
//! `справочници\работи\`: the stage a work order starts in and its usual
//! lines. A car service ships oil change and air conditioning; a paint shop
//! deletes them and writes its own.

use crate::md::{parse_record, parse_table, read_text};
use crate::model::{LaborLine, Money, PartLine};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::Path;

pub const JOBS_DIR: &str = "работи";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
struct JobMeta {
    name: String,
    stage: String,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    /// Also the title of the work order, which is how the program finds the
    /// last time this job was done on the car.
    pub name: String,
    /// As written in the file ("В ремонт"); the screens normalise it.
    pub stage: String,
    pub labor: Vec<LaborLine>,
    pub parts: Vec<PartLine>,
    pub file: String,
}

fn number(s: &str) -> Option<f64> {
    let t = s.trim().replace(',', ".");
    if t.is_empty() {
        None
    } else {
        t.parse().ok()
    }
}

fn parse(text: &str, file: &str) -> Option<Job> {
    let (meta, body) = parse_record::<JobMeta>(text).ok()?;
    let name = if meta.name.trim().is_empty() { file.trim_end_matches(".md").to_string() } else { meta.name.trim().to_string() };
    let mut labor = Vec::new();
    let mut parts = Vec::new();
    for r in parse_table(&body).rows {
        let cell = |i: usize| r.get(i).map(|s| s.trim()).unwrap_or("");
        let (kind, what) = (cell(0).to_lowercase(), cell(1));
        if what.is_empty() {
            continue;
        }
        let qty = number(cell(2));
        let price = Money::parse(cell(4)).unwrap_or_default();
        if kind.starts_with("труд") || kind.starts_with("работ") {
            labor.push(LaborLine { description: what.into(), mechanic: String::new(), hours: qty.unwrap_or(1.0), rate: price });
        } else {
            parts.push(PartLine { part: what.into(), partNumber: String::new(), quantity: qty.unwrap_or(1.0), unit: if cell(3).is_empty() { "бр.".into() } else { cell(3).into() }, price, stockCode: String::new() });
        }
    }
    Some(Job { name, stage: meta.stage.trim().to_string(), labor, parts, file: file.to_string() })
}

/// All jobs in the folder, by name. A missing folder means no jobs.
pub fn list(dir: &Path) -> Vec<Job> {
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut out: Vec<Job> = rd
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("md")))
        .filter_map(|e| {
            let file = e.file_name().to_string_lossy().to_string();
            read_text(&e.path()).ok().and_then(|t| parse(&t, &file))
        })
        .collect();
    out.sort_by_key(|a| a.name.to_lowercase());
    out
}

pub const STARTER: &[(&str, &str)] = &[
    ("обслужване-масло-и-филтри.md", include_str!("../resources/jobs/oil.md")),
    ("обслужване-на-климатик.md", include_str!("../resources/jobs/ac.md")),
    ("сезонна-смяна-на-гуми.md", include_str!("../resources/jobs/tyres.md")),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starter_jobs_read_back() {
        let dir = tempfile::tempdir().unwrap();
        for (name, text) in STARTER {
            fs::write(dir.path().join(name), text).unwrap();
        }
        let jobs = list(dir.path());
        assert_eq!(jobs.iter().map(|j| j.name.as_str()).collect::<Vec<_>>(), ["Обслужване на климатик", "Обслужване – масло и филтри", "Сезонна смяна на гуми"]);
        let oil = &jobs[1];
        assert_eq!(oil.stage, "В ремонт");
        assert_eq!(oil.labor.len(), 1);
        assert_eq!((oil.parts[0].part.as_str(), oil.parts[0].quantity, oil.parts[0].unit.as_str()), ("Двигателно масло", 5.0, "л"));
        assert_eq!(jobs[2].labor[1].hours, 0.5);
    }

    #[test]
    fn a_hand_written_job_without_front_matter_works() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("Боядисване на елемент.md"),
            "| Вид | Описание | Кол. | Мярка | Цена |\n|---|---|---|---|---|\n| Труд | Боядисване | 3,5 | ч | 45 |\n| Част | Боя | 0,5 | л |  |\n| | | | | |\n",
        )
        .unwrap();
        fs::write(dir.path().join("бележка.txt"), "не е работа").unwrap();
        let jobs = list(dir.path());
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].name, "Боядисване на елемент");
        assert_eq!(jobs[0].stage, "");
        assert_eq!(jobs[0].labor[0].hours, 3.5);
        assert_eq!(jobs[0].labor[0].rate, Money::parse("45").unwrap());
        assert_eq!(jobs[0].parts[0].quantity, 0.5);
        assert!(list(&dir.path().join("няма")).is_empty());
    }
}
