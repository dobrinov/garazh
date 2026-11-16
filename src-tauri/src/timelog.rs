//! Time spent on a work order, in `време.md` in the order's folder:
//!
//! | Дата       | Начало | Край  | Време | Механик | Бележка          |
//! |------------|--------|-------|-------|---------|------------------|
//! | 2026-11-16 | 09:05  | 10:30 | 1:25  | Иван    | смяна на ремък   |
//! | 2026-11-16 | 14:00  |       |       | Иван    |                  |   ← running
//! | 2026-11-17 |        |       | 0:45  | Петър   | добавено ръчно   |
//!
//! A row with a start and no end and no time is a running timer. Kept apart
//! from работна-карта.md so a running timer never conflicts with editing
//! the order. Optional: switched on in Settings ("timeTracking").
#![allow(non_snake_case)]

use crate::md::{parse_table, read_text, render_table, write_atomic};
use crate::store::{Result, StoreError};
use chrono::{Local, NaiveDate, NaiveDateTime, NaiveTime};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const TIME_FILE: &str = "време.md";
const HEADER: [&str; 6] = ["Дата", "Начало", "Край", "Време", "Механик", "Бележка"];

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct TimeEntry {
    pub date: String,
    pub start: String,
    pub end: String,
    /// None while the timer runs.
    pub minutes: Option<u32>,
    pub mechanic: String,
    pub note: String,
}

impl TimeEntry {
    pub fn running(&self) -> bool {
        self.minutes.is_none() && !self.start.is_empty() && self.end.is_empty()
    }
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimeLog {
    pub entries: Vec<TimeEntry>,
    /// Finished entries only; the UI adds running timers live.
    pub totalMinutes: u32,
}

/// "1:25", "85", "1ч 25м", "1,5" (hours) → minutes.
pub fn parse_minutes(s: &str) -> Option<u32> {
    let t = s.trim().to_lowercase();
    if t.is_empty() {
        return None;
    }
    if let Some((h, m)) = t.split_once(':') {
        let (h, m) = (h.trim().parse::<u32>().ok()?, m.trim().parse::<u32>().ok()?);
        return (m < 60).then_some(h * 60 + m);
    }
    if t.contains('ч') || t.contains('м') {
        let mut total = 0;
        let mut num = String::new();
        for c in t.chars() {
            if c.is_ascii_digit() {
                num.push(c);
            } else if c == 'ч' {
                total += num.parse::<u32>().ok()? * 60;
                num.clear();
            } else if c == 'м' {
                total += num.parse::<u32>().ok()?;
                num.clear();
            }
        }
        return num.is_empty().then_some(total);
    }
    if t.contains(',') || t.contains('.') {
        let h: f64 = t.replace(',', ".").parse().ok()?;
        return (h >= 0.0).then(|| (h * 60.0).round() as u32);
    }
    t.parse().ok()
}

pub fn format_minutes(m: u32) -> String {
    format!("{}:{:02}", m / 60, m % 60)
}

pub fn read(dir: &Path) -> Vec<TimeEntry> {
    let Ok(body) = read_text(&dir.join(TIME_FILE)) else { return vec![] };
    parse_table(&body)
        .rows
        .into_iter()
        .map(|r| {
            let g = |i: usize| r.get(i).map(|s| s.trim().to_string()).unwrap_or_default();
            TimeEntry { date: g(0), start: g(1), end: g(2), minutes: parse_minutes(&g(3)), mechanic: g(4), note: g(5) }
        })
        .filter(|e| !e.date.is_empty())
        .collect()
}

pub fn log(dir: &Path) -> TimeLog {
    let entries = read(dir);
    let totalMinutes = entries.iter().filter_map(|e| e.minutes).sum();
    TimeLog { entries, totalMinutes }
}

fn write(dir: &Path, entries: &[TimeEntry]) -> Result<()> {
    let file = dir.join(TIME_FILE);
    let body = if file.exists() { read_text(&file)? } else { String::new() };
    let table = parse_table(&body);
    let rows: Vec<Vec<String>> = entries
        .iter()
        .map(|e| vec![e.date.clone(), e.start.clone(), e.end.clone(), e.minutes.map(format_minutes).unwrap_or_default(), e.mechanic.clone(), e.note.clone()])
        .collect();
    let prefix = if table.prefix.trim().is_empty() { "# Отработено време".to_string() } else { table.prefix };
    write_atomic(&file, &render_table(&prefix, &HEADER, &rows, &table.suffix))?;
    Ok(())
}

fn sorted(mut entries: Vec<TimeEntry>) -> Vec<TimeEntry> {
    entries.sort_by(|a, b| a.date.cmp(&b.date).then(a.start.cmp(&b.start)));
    entries
}

pub fn start(dir: &Path, mechanic: &str, now: NaiveDateTime) -> Result<TimeLog> {
    let mut entries = read(dir);
    let mechanic = mechanic.trim();
    if entries.iter().any(|e| e.running() && e.mechanic == mechanic) {
        return Err(StoreError::Invalid(if mechanic.is_empty() {
            "Таймерът вече тече".into()
        } else {
            format!("Таймерът на {mechanic} вече тече")
        }));
    }
    entries.push(TimeEntry {
        date: now.format("%Y-%m-%d").to_string(),
        start: now.format("%H:%M").to_string(),
        mechanic: mechanic.to_string(),
        ..Default::default()
    });
    write(dir, &sorted(entries))?;
    Ok(log(dir))
}

/// Stop the running timer that matches `which` (by date, start and mechanic).
pub fn stop(dir: &Path, which: &TimeEntry, now: NaiveDateTime) -> Result<TimeLog> {
    let mut entries = read(dir);
    let e = entries
        .iter_mut()
        .find(|e| e.running() && e.date == which.date && e.start == which.start && e.mechanic == which.mechanic)
        .ok_or_else(|| StoreError::Invalid("Таймерът вече е спрян или файлът време.md е променен".into()))?;
    let started = NaiveDate::parse_from_str(&e.date, "%Y-%m-%d")
        .ok()
        .zip(NaiveTime::parse_from_str(&e.start, "%H:%M").ok())
        .map(|(d, t)| d.and_time(t))
        .ok_or_else(|| StoreError::Invalid(format!("Невалидна дата или час в време.md: {} {}", e.date, e.start)))?;
    let mins = (now - started).num_minutes().max(0) as u32;
    // Same day: just the time. Later day: the date too, so the row reads right.
    e.end = if now.date() == started.date() { now.format("%H:%M").to_string() } else { now.format("%Y-%m-%d %H:%M").to_string() };
    e.minutes = Some(mins);
    if !which.note.trim().is_empty() {
        e.note = which.note.trim().to_string();
    }
    write(dir, &entries)?;
    Ok(log(dir))
}

/// Time added by hand: a date and how long.
pub fn add(dir: &Path, entry: TimeEntry) -> Result<TimeLog> {
    if NaiveDate::parse_from_str(&entry.date, "%Y-%m-%d").is_err() {
        return Err(StoreError::Invalid("Датата трябва да е във формат ГГГГ-ММ-ДД".into()));
    }
    let Some(m) = entry.minutes.filter(|m| *m > 0) else {
        return Err(StoreError::Invalid("Въведете време, напр. 1:30".into()));
    };
    let mut entries = read(dir);
    entries.push(TimeEntry { minutes: Some(m), start: String::new(), end: String::new(), mechanic: entry.mechanic.trim().into(), note: entry.note.trim().into(), date: entry.date });
    write(dir, &sorted(entries))?;
    Ok(log(dir))
}

pub fn remove(dir: &Path, which: &TimeEntry) -> Result<TimeLog> {
    let mut entries = read(dir);
    let i = entries.iter().position(|e| e == which).ok_or_else(|| StoreError::Invalid("Редът вече е изтрит или файлът време.md е променен".into()))?;
    entries.remove(i);
    write(dir, &entries)?;
    Ok(log(dir))
}

pub fn now() -> NaiveDateTime {
    Local::now().naive_local()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()
    }

    #[test]
    fn reads_durations_the_way_people_write_them() {
        assert_eq!(parse_minutes("1:25"), Some(85));
        assert_eq!(parse_minutes("85"), Some(85));
        assert_eq!(parse_minutes("1ч 25м"), Some(85));
        assert_eq!(parse_minutes("2ч"), Some(120));
        assert_eq!(parse_minutes("1,5"), Some(90));
        assert_eq!(parse_minutes("1:75"), None);
        assert_eq!(parse_minutes(""), None);
        assert_eq!(format_minutes(85), "1:25");
        assert_eq!(format_minutes(5), "0:05");
    }

    #[test]
    fn timer_start_stop_and_manual_time() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let l = start(d, "Иван", at("2026-11-16 09:05")).unwrap();
        assert!(l.entries[0].running());
        assert_eq!(l.totalMinutes, 0);
        assert!(start(d, "Иван", at("2026-11-16 09:10")).is_err(), "one timer per mechanic");
        start(d, "Петър", at("2026-11-16 09:20")).unwrap();

        let ivan = read(d).into_iter().find(|e| e.mechanic == "Иван").unwrap();
        let l = stop(d, &TimeEntry { note: "ремък".into(), ..ivan }, at("2026-11-16 10:30")).unwrap();
        let e = l.entries.iter().find(|e| e.mechanic == "Иван").unwrap();
        assert_eq!((e.end.as_str(), e.minutes, e.note.as_str()), ("10:30", Some(85), "ремък"));
        assert_eq!(l.totalMinutes, 85);

        // Overnight: the end keeps its date.
        let petar = read(d).into_iter().find(|e| e.running()).unwrap();
        let l = stop(d, &petar, at("2026-11-17 08:20")).unwrap();
        let e = l.entries.iter().find(|e| e.mechanic == "Петър").unwrap();
        assert_eq!((e.end.as_str(), e.minutes), ("2026-11-17 08:20", Some(23 * 60)));

        let l = add(d, TimeEntry { date: "2026-11-15".into(), minutes: Some(45), note: "диагностика".into(), ..Default::default() }).unwrap();
        assert_eq!(l.entries[0].date, "2026-11-15", "sorted by date");
        assert_eq!(l.totalMinutes, 85 + 23 * 60 + 45);
        assert!(add(d, TimeEntry { date: "16.11".into(), minutes: Some(5), ..Default::default() }).is_err());

        let text = read_text(&d.join(TIME_FILE)).unwrap();
        assert!(text.starts_with("# Отработено време"));
        assert!(text.contains("| 1:25 "));

        let first = l.entries[0].clone();
        let l = remove(d, &first).unwrap();
        assert_eq!(l.entries.len(), 2);
        assert!(remove(d, &first).is_err());
    }

    #[test]
    fn a_file_edited_by_hand_still_reads() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(TIME_FILE), "Бележки отгоре\r\n\r\n| Дата | Начало | Край | Време |\r\n|---|---|---|---|\r\n| 2026-11-16 | | | 2ч |\r\n").unwrap();
        let l = log(dir.path());
        assert_eq!(l.totalMinutes, 120);
        add(dir.path(), TimeEntry { date: "2026-11-17".into(), minutes: Some(30), ..Default::default() }).unwrap();
        let text = read_text(&dir.path().join(TIME_FILE)).unwrap();
        assert!(text.starts_with("Бележки отгоре"), "text around the table is kept");
        assert_eq!(log(dir.path()).totalMinutes, 150);
    }
}
