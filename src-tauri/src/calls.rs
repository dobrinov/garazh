//! Phone calls: clients who called and are expected to bring the car in,
//! and reminder calls the shop made about deadlines and maintenance.
//!
//! Both are plain tables, added in 0.4. Older data folders simply do not
//! have them (nothing is expected, nobody was called), and older versions
//! of the program never read them, so a folder stays usable either way:
//!
//! `очаквани.md` in the data folder – one row per expected car:
//! | №  | Обадил се  | Идва на    | Час   | Рег. номер | Кола         | Клиент      | Телефон      | Оплакване        |
//! | 3  | 2026-11-16 | 2026-11-17 | 09:00 | СА 7302 ХВ | VW Touran    | Иван Петров | 0888 123 456 | Скърца отпред    |
//!
//! `обаждания.md` in a car's folder – reminder calls about that car:
//! | Дата       | Повод | Срок       | Бележка |
//! | 2026-11-16 | ГТП   | 2026-11-28 |         |
//!
//! A reminder counts as done while a row with the same reason and due date
//! exists; when the deadline moves (new ГТП date) the reminder shows again.
#![allow(non_snake_case)]

use crate::md::{parse_table, read_text, render_table, write_atomic};
use crate::store::{Result, StoreError};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const EXPECTED_FILE: &str = "очаквани.md";
pub const CALLS_FILE: &str = "обаждания.md";
const EXPECTED_HEADER: [&str; 9] = ["№", "Обадил се", "Идва на", "Час", "Рег. номер", "Кола", "Клиент", "Телефон", "Оплакване"];
const CALLS_HEADER: [&str; 4] = ["Дата", "Повод", "Срок", "Бележка"];

/// A car announced by phone that has not arrived yet.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Expected {
    /// The № column; filled in by the program when a row has none.
    pub id: String,
    pub calledOn: String,
    /// ГГГГ-ММ-ДД, or empty when no day was agreed.
    pub date: String,
    /// ЧЧ:ММ, or empty.
    pub time: String,
    pub plate: String,
    pub car: String,
    pub client: String,
    pub phone: String,
    pub complaint: String,
}

/// One reminder call about a car (a row of обаждания.md).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Call {
    pub date: String,
    pub reason: String,
    pub due: String,
    pub note: String,
}

fn cell(r: &[String], i: usize) -> String {
    r.get(i).map(|s| s.trim().to_string()).unwrap_or_default()
}

fn valid_date(s: &str) -> bool {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

/// Accepts "9", "9:5", "09:00", "9.30"; returns "09:00" or None.
fn normal_time(s: &str) -> Option<String> {
    let t = s.trim().replace('.', ":");
    if t.is_empty() {
        return Some(String::new());
    }
    let mut it = t.splitn(2, ':');
    let h: u32 = it.next()?.trim().parse().ok()?;
    let m: u32 = match it.next() {
        Some(m) if !m.trim().is_empty() => m.trim().parse().ok()?,
        _ => 0,
    };
    (h < 24 && m < 60).then(|| format!("{h:02}:{m:02}"))
}

// ---------- expected ----------

/// Rows as written; a hand-added row without a № gets "ред-N" until the
/// next save numbers it.
pub fn expected(root: &Path) -> Vec<Expected> {
    let Ok(body) = read_text(&root.join(EXPECTED_FILE)) else { return vec![] };
    let mut v: Vec<Expected> = parse_table(&body)
        .rows
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let id = cell(r, 0);
            Expected {
                id: if id.is_empty() { format!("ред-{}", i + 1) } else { id },
                calledOn: cell(r, 1),
                date: cell(r, 2),
                time: cell(r, 3),
                plate: cell(r, 4),
                car: cell(r, 5),
                client: cell(r, 6),
                phone: cell(r, 7),
                complaint: cell(r, 8),
            }
        })
        .filter(|e| !(e.plate.is_empty() && e.client.is_empty() && e.phone.is_empty() && e.complaint.is_empty()))
        .collect();
    sort_expected(&mut v);
    v
}

/// Agreed day and time first; rows without a day at the end, newest call first.
fn sort_expected(v: &mut [Expected]) {
    v.sort_by(|a, b| {
        let ka = (a.date.is_empty(), a.date.clone(), a.time.is_empty(), a.time.clone());
        let kb = (b.date.is_empty(), b.date.clone(), b.time.is_empty(), b.time.clone());
        ka.cmp(&kb).then(b.calledOn.cmp(&a.calledOn))
    });
}

fn write_expected(root: &Path, rows: &mut [Expected]) -> Result<()> {
    // Number rows that have none (added by hand in Notepad).
    let mut next = rows.iter().filter_map(|e| e.id.parse::<u32>().ok()).max().unwrap_or(0);
    for e in rows.iter_mut() {
        if e.id.parse::<u32>().is_err() {
            next += 1;
            e.id = next.to_string();
        }
    }
    sort_expected(rows);
    let file = root.join(EXPECTED_FILE);
    let table = parse_table(&if file.exists() { read_text(&file)? } else { String::new() });
    let out: Vec<Vec<String>> = rows
        .iter()
        .map(|e| vec![e.id.clone(), e.calledOn.clone(), e.date.clone(), e.time.clone(), e.plate.clone(), e.car.clone(), e.client.clone(), e.phone.clone(), e.complaint.clone()])
        .collect();
    let prefix = if table.prefix.trim().is_empty() {
        "# Очаквани коли\n\nКлиенти, които са се обадили и ще докарат колата. Редът се маха, когато колата бъде приета.".to_string()
    } else {
        table.prefix
    };
    write_atomic(&file, &render_table(&prefix, &EXPECTED_HEADER, &out, &table.suffix))?;
    Ok(())
}

/// Add (empty id) or change a row. Returns the saved row.
pub fn save_expected(root: &Path, mut e: Expected, today: &str) -> Result<Expected> {
    e.plate = e.plate.trim().to_uppercase();
    for s in [&mut e.car, &mut e.client, &mut e.phone, &mut e.complaint] {
        *s = s.trim().to_string();
    }
    if e.plate.is_empty() && e.client.is_empty() && e.phone.is_empty() {
        return Err(StoreError::Invalid("Въведете рег. номер, име или телефон.".into()));
    }
    if !e.date.is_empty() && !valid_date(&e.date) {
        return Err(StoreError::Invalid("Датата трябва да е във формат ГГГГ-ММ-ДД".into()));
    }
    e.time = normal_time(&e.time).ok_or_else(|| StoreError::Invalid("Часът трябва да е като 09:30".into()))?;
    if e.calledOn.is_empty() {
        e.calledOn = today.to_string();
    }
    let mut rows = expected(root);
    if e.id.is_empty() {
        let next = rows.iter().filter_map(|x| x.id.parse::<u32>().ok()).max().unwrap_or(0) + 1;
        e.id = next.to_string();
        rows.push(e.clone());
    } else {
        let Some(slot) = rows.iter_mut().find(|x| x.id == e.id) else {
            return Err(StoreError::NotFound(format!("очакван № {}", e.id)));
        };
        *slot = e.clone();
    }
    // A row that had only "ред-N" gets its real number on write.
    let key = (e.calledOn.clone(), e.plate.clone(), e.client.clone(), e.complaint.clone());
    write_expected(root, &mut rows)?;
    Ok(expected(root)
        .into_iter()
        .find(|x| (x.calledOn.clone(), x.plate.clone(), x.client.clone(), x.complaint.clone()) == key)
        .unwrap_or(e))
}

/// Remove a row (the car arrived, or the client cancelled). Missing rows are fine.
pub fn remove_expected(root: &Path, id: &str) -> Result<()> {
    let mut rows = expected(root);
    let before = rows.len();
    rows.retain(|e| e.id != id);
    if rows.len() != before {
        write_expected(root, &mut rows)?;
    }
    Ok(())
}

// ---------- reminder calls ----------

pub fn calls(car_dir: &Path) -> Vec<Call> {
    let Ok(body) = read_text(&car_dir.join(CALLS_FILE)) else { return vec![] };
    parse_table(&body)
        .rows
        .iter()
        .map(|r| Call { date: cell(r, 0), reason: cell(r, 1), due: cell(r, 2), note: cell(r, 3) })
        .filter(|c| !c.reason.is_empty())
        .collect()
}

/// When the client was called about this reason and due date, if ever.
pub fn called_on(calls: &[Call], reason: &str, due: &str) -> Option<String> {
    calls
        .iter()
        .filter(|c| c.reason.eq_ignore_ascii_case(reason) && c.due == due)
        .map(|c| c.date.clone())
        .max()
}

/// Record a call (`on`) or take it back (`!on`).
pub fn set_called(car_dir: &Path, reason: &str, due: &str, on: bool, today: &str) -> Result<()> {
    let reason = reason.trim();
    if reason.is_empty() {
        return Err(StoreError::Invalid("Липсва повод за обаждането.".into()));
    }
    let file = car_dir.join(CALLS_FILE);
    let table = parse_table(&if file.exists() { read_text(&file)? } else { String::new() });
    let mut rows = calls(car_dir);
    let same = |c: &Call| c.reason.eq_ignore_ascii_case(reason) && c.due == due;
    if on {
        if rows.iter().any(same) {
            return Ok(());
        }
        rows.push(Call { date: today.into(), reason: reason.into(), due: due.into(), note: String::new() });
    } else {
        let before = rows.len();
        rows.retain(|c| !same(c));
        if rows.len() == before {
            return Ok(());
        }
    }
    rows.sort_by(|a, b| b.date.cmp(&a.date));
    let out: Vec<Vec<String>> = rows.iter().map(|c| vec![c.date.clone(), c.reason.clone(), c.due.clone(), c.note.clone()]).collect();
    let prefix = if table.prefix.trim().is_empty() { "# Обаждания за напомняне".to_string() } else { table.prefix };
    write_atomic(&file, &render_table(&prefix, &CALLS_HEADER, &out, &table.suffix))?;
    Ok(())
}

/// Plate for matching: upper case, Latin look-alikes as Cyrillic, no spaces
/// or dashes. The same rule as plateKey in src/lib/format.ts.
pub fn plate_key(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .flat_map(|c| c.to_uppercase())
        .map(|c| match c {
            'A' => 'А',
            'B' => 'В',
            'C' => 'С',
            'E' => 'Е',
            'H' => 'Н',
            'K' => 'К',
            'M' => 'М',
            'O' => 'О',
            'P' => 'Р',
            'T' => 'Т',
            'X' => 'Х',
            'Y' => 'У',
            c => c,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_files_mean_nothing_expected_and_nobody_called() {
        let dir = tempfile::tempdir().unwrap();
        assert!(expected(dir.path()).is_empty());
        assert!(calls(dir.path()).is_empty());
        remove_expected(dir.path(), "1").unwrap();
        assert!(!dir.path().join(EXPECTED_FILE).exists(), "removing from nothing writes nothing");
    }

    #[test]
    fn expected_rows_are_numbered_sorted_and_removed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let a = save_expected(root, Expected { plate: "ca 7302 xb".into(), complaint: "Скърца".into(), date: "2026-11-18".into(), time: "9".into(), ..Default::default() }, "2026-11-16").unwrap();
        assert_eq!(a.id, "1");
        assert_eq!(a.time, "09:00");
        assert_eq!(a.calledOn, "2026-11-16");
        let b = save_expected(root, Expected { client: "Стефан".into(), phone: "0878".into(), date: "2026-11-17".into(), ..Default::default() }, "2026-11-16").unwrap();
        assert_eq!(b.id, "2");
        let c = save_expected(root, Expected { client: "Без ден".into(), ..Default::default() }, "2026-11-16").unwrap();
        let ids: Vec<String> = expected(root).into_iter().map(|e| e.id).collect();
        assert_eq!(ids, vec!["2", "1", &c.id]);
        let text = read_text(&root.join(EXPECTED_FILE)).unwrap();
        assert!(text.starts_with("# Очаквани коли"));
        assert!(text.contains("| Рег. номер"));
        remove_expected(root, "1").unwrap();
        assert_eq!(expected(root).len(), 2);
        assert!(save_expected(root, Expected { complaint: "само текст".into(), ..Default::default() }, "2026-11-16").is_err());
        assert!(save_expected(root, Expected { client: "x".into(), date: "18.11".into(), ..Default::default() }, "2026-11-16").is_err());
    }

    #[test]
    fn hand_written_rows_without_number_survive_and_get_numbered() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(
            root.join(EXPECTED_FILE),
            "\u{feff}# Мои бележки\r\n\r\n| № | Обадил се | Идва на | Час | Рег. номер | Кола | Клиент | Телефон | Оплакване |\r\n|---|---|---|---|---|---|---|---|---|\r\n|  | 2026-11-10 |  |  | СВ 1111 АА | Golf | Петър |  | Масло |\r\n\r\nкрай\r\n",
        )
        .unwrap();
        let rows = expected(root);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "ред-1");
        save_expected(root, Expected { client: "Нов".into(), ..Default::default() }, "2026-11-16").unwrap();
        let rows = expected(root);
        assert!(rows.iter().all(|e| e.id.parse::<u32>().is_ok()), "{rows:?}");
        let text = read_text(&root.join(EXPECTED_FILE)).unwrap();
        assert!(text.starts_with("# Мои бележки"), "the owner's text is kept");
        assert!(text.trim_end().ends_with("край"));
    }

    #[test]
    fn calls_are_keyed_by_reason_and_due_date() {
        let dir = tempfile::tempdir().unwrap();
        let car = dir.path();
        set_called(car, "ГТП", "2026-11-28", true, "2026-11-16").unwrap();
        set_called(car, "ГТП", "2026-11-28", true, "2026-11-17").unwrap();
        let cs = calls(car);
        assert_eq!(cs.len(), 1, "a second click does not add a second row");
        assert_eq!(called_on(&cs, "ГТП", "2026-11-28").as_deref(), Some("2026-11-16"));
        assert_eq!(called_on(&cs, "ГТП", "2027-11-28"), None, "a new deadline needs a new call");
        set_called(car, "ГТП", "2026-11-28", false, "2026-11-16").unwrap();
        assert!(calls(car).is_empty());
    }

    #[test]
    fn plates_match_in_latin_and_cyrillic() {
        assert_eq!(plate_key("ca 4821 kh"), plate_key("СА4821КН"));
        assert_eq!(plate_key("РВ-2045-ТМ"), "РВ2045ТМ");
    }
}
