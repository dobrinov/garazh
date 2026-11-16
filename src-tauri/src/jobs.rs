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

/// A usual job to write, as the business presets describe it.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewJob {
    pub name: String,
    /// Stage label as shown, e.g. "В ремонт".
    pub stage: String,
    #[serde(default)]
    pub labor: Vec<LaborLine>,
    #[serde(default)]
    pub parts: Vec<PartLine>,
}

/// File name for a job: its name in lower case, other characters as "-".
pub fn file_name(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().to_lowercase().chars() {
        if c.is_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_string();
    format!("{}.md", if out.is_empty() { "работа".to_string() } else { out })
}

fn num(x: f64) -> String {
    if x.fract() == 0.0 { format!("{}", x as i64) } else { format!("{x}") }
}

fn render(job: &NewJob) -> String {
    let mut rows: Vec<Vec<String>> = Vec::new();
    for l in &job.labor {
        rows.push(vec!["Труд".into(), l.description.clone(), num(l.hours), "ч".into(), if l.rate.0 == 0 { String::new() } else { l.rate.format() }]);
    }
    for p in &job.parts {
        rows.push(vec!["Част".into(), p.part.clone(), num(p.quantity), p.unit.clone(), if p.price.0 == 0 { String::new() } else { p.price.format() }]);
    }
    let name = job.name.replace('\n', " ");
    let stage = job.stage.replace('\n', " ");
    let head = format!(
        "---\nиме: {}\nетап: {}\n---\n\n# {}\n\nОбичайна работа: при „Приеми кола“ се избира с едно натискане и работната карта\nсе отваря на етапа отгоре, с редовете от таблицата. Ако колата вече е имала\nработна карта със същото заглавие, програмата взима редовете от нея.\nВид: „Труд“ (Кол. е часове) или „Част“. Цената може да е празна.",
        yaml_str(&name),
        yaml_str(&stage),
        name
    );
    crate::md::render_table(&head, &["Вид", "Описание", "Кол.", "Мярка", "Цена"], &rows, "")
}

fn yaml_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_default()
}

/// Write the jobs whose names are not there yet. Returns how many.
pub fn add(dir: &Path, jobs: &[NewJob]) -> std::io::Result<usize> {
    fs::create_dir_all(dir)?;
    let have: Vec<String> = list(dir).into_iter().map(|j| j.name.trim().to_lowercase()).collect();
    let mut n = 0;
    for job in jobs {
        if job.name.trim().is_empty() || have.contains(&job.name.trim().to_lowercase()) {
            continue;
        }
        let p = dir.join(file_name(&job.name));
        if p.exists() {
            continue;
        }
        crate::md::write_atomic(&p, &render(job))?;
        n += 1;
    }
    Ok(n)
}

/// Delete job files by name. Anything that is not a plain file name in the
/// folder is ignored. Returns how many were removed.
pub fn remove(dir: &Path, files: &[String]) -> std::io::Result<usize> {
    let mut n = 0;
    for f in files {
        if f.is_empty() || f.contains(['/', '\\']) || f.starts_with('.') || !f.to_lowercase().ends_with(".md") {
            continue;
        }
        let p = dir.join(f);
        if p.is_file() {
            fs::remove_file(&p)?;
            n += 1;
        }
    }
    Ok(n)
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
    fn jobs_from_a_business_are_written_once_and_read_back() {
        let dir = tempfile::tempdir().unwrap();
        for (name, text) in STARTER {
            fs::write(dir.path().join(name), text).unwrap();
        }
        let paint = NewJob {
            name: "Боядисване на елемент".into(),
            stage: "В ремонт".into(),
            labor: vec![LaborLine { description: "Подготовка и боядисване".into(), hours: 4.0, ..Default::default() }],
            parts: vec![PartLine { part: "Боя: \"по код\"".into(), quantity: 0.5, unit: "л".into(), ..Default::default() }],
        };
        // The car example of the same name is not written twice.
        let oil = NewJob { name: "обслужване – масло и филтри".into(), stage: "В ремонт".into(), labor: vec![], parts: vec![] };
        assert_eq!(add(dir.path(), &[paint.clone(), oil]).unwrap(), 1);
        assert_eq!(add(dir.path(), &[paint]).unwrap(), 0);
        assert_eq!(file_name("Боядисване на елемент"), "боядисване-на-елемент.md");
        assert_eq!(file_name("Обслужване – масло и филтри"), "обслужване-масло-и-филтри.md", "same as the shipped example");
        let jobs = list(dir.path());
        let p = jobs.iter().find(|j| j.name == "Боядисване на елемент").unwrap();
        assert_eq!(p.stage, "В ремонт");
        assert_eq!(p.labor[0].hours, 4.0);
        assert_eq!((p.parts[0].part.as_str(), p.parts[0].quantity), ("Боя: \"по код\"", 0.5));

        assert_eq!(remove(dir.path(), &["обслужване-на-климатик.md".into(), "../сервиз.md".into(), "няма.md".into()]).unwrap(), 1);
        assert_eq!(list(dir.path()).len(), 3);
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
