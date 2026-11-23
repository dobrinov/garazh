//! Past events on a car: repairs and services done before the car came here
//! or in another shop, accidents, anything worth knowing. One row each in the
//! car's `събития.md`. Their mileage counts as a reading and their text counts
//! for the maintenance schedule, the same as a work order's labour line.

use crate::md::{parse_table, read_text, render_table, write_atomic};
use crate::model::Reading;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const EVENTS_FILE: &str = "събития.md";
/// `source` of the readings that come from events.
pub const EVENT_SOURCE: &str = "събитие";
const HEADER: [&str; 6] = ["Дата", "Км", "Какво", "Къде", "Сума", "Бележка"];

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CarEvent {
    pub date: String,
    pub km: Option<u64>,
    pub what: String,
    pub place: String,
    pub amount: String,
    pub note: String,
}

fn num(s: &str) -> Option<u64> {
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// Newest first, as in the file.
pub fn read(car_dir: &Path) -> Vec<CarEvent> {
    let Ok(body) = read_text(&car_dir.join(EVENTS_FILE)) else { return vec![] };
    parse_table(&body)
        .rows
        .into_iter()
        .map(|r| {
            let g = |i: usize| r.get(i).map(|s| s.trim().to_string()).unwrap_or_default();
            CarEvent { date: g(0), km: num(&g(1)), what: g(2), place: g(3), amount: g(4), note: g(5) }
        })
        .filter(|e| !e.what.is_empty())
        .collect()
}

/// The events' mileage, as readings.
pub fn readings(events: &[CarEvent]) -> Vec<Reading> {
    events
        .iter()
        .filter_map(|e| Some(Reading { date: e.date.clone(), km: e.km?, source: EVENT_SOURCE.into() }))
        .collect()
}

fn write(car_dir: &Path, mut all: Vec<CarEvent>) -> std::io::Result<()> {
    let file = car_dir.join(EVENTS_FILE);
    let body = if file.exists() { read_text(&file)? } else { String::new() };
    let table = parse_table(&body);
    all.sort_by(|a, b| b.date.cmp(&a.date));
    // A "|" would split the Markdown cell.
    let cell = |s: &str| s.replace('|', "/").replace(['\r', '\n'], " ");
    let rows: Vec<Vec<String>> = all
        .iter()
        .map(|e| vec![e.date.clone(), e.km.map(|k| k.to_string()).unwrap_or_default(), cell(&e.what), cell(&e.place), cell(&e.amount), cell(&e.note)])
        .collect();
    let prefix = if table.prefix.trim().is_empty() {
        "# Минали събития\n\nРемонти и обслужвания извън сервиза или преди колата да дойде при нас, катастрофи и всичко друго за колата.".to_string()
    } else {
        table.prefix
    };
    write_atomic(&file, &render_table(&prefix, &HEADER, &rows, &table.suffix))
}

/// Adds `event`, or puts it in place of `original` when editing. Returns
/// false if `original` was not found (the file was changed meanwhile).
pub fn save(car_dir: &Path, event: CarEvent, original: Option<&CarEvent>) -> std::io::Result<bool> {
    let mut all = read(car_dir);
    if let Some(o) = original {
        let Some(i) = all.iter().position(|e| e == o) else { return Ok(false) };
        all.remove(i);
    }
    all.push(event);
    write(car_dir, all)?;
    Ok(true)
}

/// Removes the first row equal to `event`. Returns false if none was found
/// (the file was changed meanwhile).
pub fn remove(car_dir: &Path, event: &CarEvent) -> std::io::Result<bool> {
    let mut all = read(car_dir);
    let Some(i) = all.iter().position(|e| e == event) else { return Ok(false) };
    all.remove(i);
    write(car_dir, all)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(date: &str, km: Option<u64>, what: &str) -> CarEvent {
        CarEvent { date: date.into(), km, what: what.into(), place: "друг сервиз".into(), amount: "120".into(), note: String::new() }
    }

    #[test]
    fn events_round_trip_newest_first_and_remove() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), ev("2024-05-02", Some(150000), "Смяна на масло | филтри"), None).unwrap();
        save(dir.path(), ev("2025-01-10", None, "Ангренаж"), None).unwrap();
        let all = read(dir.path());
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].what, "Ангренаж");
        assert_eq!(all[1].what, "Смяна на масло / филтри");
        assert_eq!(all[1].km, Some(150000));
        assert_eq!(readings(&all), vec![Reading { date: "2024-05-02".into(), km: 150000, source: EVENT_SOURCE.into() }]);
        let edited = CarEvent { km: Some(161000), ..all[0].clone() };
        assert!(save(dir.path(), edited.clone(), Some(&all[0])).unwrap());
        assert!(!save(dir.path(), edited.clone(), Some(&all[0])).unwrap(), "the original is gone");
        let all = read(dir.path());
        assert_eq!(all.len(), 2);
        assert_eq!(all[0], edited);
        assert!(remove(dir.path(), &all[0]).unwrap());
        assert!(!remove(dir.path(), &all[0]).unwrap());
        assert_eq!(read(dir.path()).len(), 1);
    }

    #[test]
    fn rows_typed_in_notepad_are_read() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(EVENTS_FILE), "\u{feff}# Събития\r\n\r\n| Дата | Км | Какво |\r\n|---|---|---|\r\n| 2023-09-01 | 98 500 | Катастрофа, предна броня |\r\n").unwrap();
        let all = read(dir.path());
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].km, Some(98500));
        assert_eq!(all[0].place, "");
    }
}
