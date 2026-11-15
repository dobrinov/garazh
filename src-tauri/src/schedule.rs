//! Suggested maintenance schedule.
//!
//! Intervals live in editable files under `справочници\графици\`, one per
//! engine family, gearbox family or generic fallback. Each item says how to
//! find the last time it was done in the car's history (`части.md` and the
//! labour lines of its work orders), plus anything marked by hand in the
//! car's `график-поддръжка.md`. Next due is last done + interval, whichever
//! of km or time comes first, with the km limit forecast from the car's
//! actual usage.

use crate::md::{parse_record, parse_table, read_text, render_table, write_atomic};
use crate::model::{Car, PartRow, WorkOrder};
use crate::usage::{self, Usage};
use chrono::{Months, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::Path;

pub const SCHEDULES_DIR: &str = "графици";
pub const CAR_SCHEDULE_FILE: &str = "график-поддръжка.md";
const DONE_HEADER: [&str; 4] = ["Операция", "Дата", "Км", "Бележка"];
const SOON_DAYS: i64 = 30;
const SOON_KM: i64 = 1500;

/// Header of a schedule file.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ScheduleMeta {
    pub name: String,
    pub makes: Vec<String>,
    pub engines: Vec<String>,
    pub gearboxes: Vec<String>,
    pub fuel: String,
    pub source: String,
    pub verified: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Interval {
    pub operation: String,
    pub km: Option<u64>,
    pub months: Option<u32>,
    /// Alternatives separated by `;`. Each alternative is words that must all
    /// appear; a word starting with `-` must not appear.
    pub search: String,
    pub note: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    /// File name, used to pin a schedule to a car.
    pub file: String,
    pub path: String,
    /// "двигател" | "кутия" | "общ"
    pub kind: String,
    pub meta: ScheduleMeta,
    pub intervals: Vec<Interval>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Done {
    pub date: String,
    pub km: Option<u64>,
    /// What in the history matched, e.g. "Маслен филтър (РК-2026-0004)".
    pub what: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DueItem {
    pub schedule: String,
    pub operation: String,
    pub intervalKm: Option<u64>,
    pub intervalMonths: Option<u32>,
    pub note: String,
    pub last: Option<Done>,
    pub dueKm: Option<u64>,
    pub kmLeft: Option<i64>,
    /// Date from the time limit.
    pub dueByTime: Option<String>,
    /// Date the km limit is reached at the recent pace.
    pub dueByKm: Option<String>,
    /// The earlier of the two.
    pub nextDate: Option<String>,
    pub daysLeft: Option<i64>,
    /// "просрочено" | "скоро" | "наред" | "няма_запис"
    pub status: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CarSchedule {
    pub schedules: Vec<Schedule>,
    /// True when the car pins its schedules instead of matching by codes.
    pub pinned: bool,
    pub items: Vec<DueItem>,
    /// Every schedule file, for choosing by hand.
    pub available: Vec<ScheduleRef>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRef {
    pub file: String,
    pub name: String,
    pub kind: String,
}

fn num(s: &str) -> Option<u64> {
    let d: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    d.parse().ok().filter(|n| *n > 0)
}

pub fn parse_schedule(file: &str, path: &str, text: &str) -> Result<Schedule, String> {
    let (meta, body): (ScheduleMeta, String) = parse_record(text)?;
    let intervals = parse_table(&body)
        .rows
        .into_iter()
        .filter(|r| r.first().map(|c| !c.trim().is_empty()).unwrap_or(false))
        .map(|r| {
            let g = |i: usize| r.get(i).cloned().unwrap_or_default();
            Interval { operation: g(0), km: num(&g(1)), months: num(&g(2)).map(|m| m as u32), search: g(3), note: g(4) }
        })
        .collect();
    let kind = if !meta.engines.is_empty() {
        "двигател"
    } else if !meta.gearboxes.is_empty() {
        "кутия"
    } else {
        "общ"
    };
    let mut meta = meta;
    if meta.name.trim().is_empty() {
        meta.name = file.trim_end_matches(".md").to_string();
    }
    Ok(Schedule { file: file.into(), path: path.into(), kind: kind.into(), meta, intervals })
}

/// All schedule files. Unreadable ones are returned as problems.
pub fn load_all(dir: &Path) -> (Vec<Schedule>, Vec<(String, String)>) {
    let mut out = Vec::new();
    let mut problems = Vec::new();
    let Ok(rd) = fs::read_dir(dir) else { return (out, problems) };
    let mut files: Vec<_> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|e| e == "md").unwrap_or(false)).collect();
    files.sort();
    for p in files {
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        let path = p.to_string_lossy().to_string();
        match read_text(&p).map_err(|e| e.to_string()).and_then(|t| parse_schedule(&name, &path, &t)) {
            Ok(s) => out.push(s),
            Err(m) => problems.push((path, m)),
        }
    }
    (out, problems)
}

fn norm(s: &str) -> String {
    s.to_lowercase().replace(['ё'], "е").replace(char::is_whitespace, " ")
}

/// Codes are compared without spaces, dashes and dots: "ZF 8HP" = "ZF8HP".
fn same_code(a: &str, b: &str) -> bool {
    let n = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_uppercase();
    let a = n(a);
    !a.is_empty() && a == n(b)
}

fn same_make(list: &[String], make: &str) -> bool {
    let m = norm(make).replace('š', "s");
    list.iter().any(|x| {
        let x = norm(x).replace('š', "s");
        !x.is_empty() && (m == x || m.starts_with(&x))
    })
}

/// Which schedules apply to a car: the pinned ones if it has any, otherwise
/// matched by engine and gearbox code, with a generic schedule for the make
/// and fuel when no engine schedule matches.
pub fn pick<'a>(all: &'a [Schedule], car: &Car, pinned: &[String]) -> Vec<&'a Schedule> {
    if !pinned.is_empty() {
        return pinned.iter().filter_map(|f| all.iter().find(|s| &s.file == f)).collect();
    }
    let mut out: Vec<&Schedule> = Vec::new();
    let engine: Vec<&Schedule> = all.iter().filter(|s| s.meta.engines.iter().any(|e| same_code(e, &car.engineCode))).collect();
    let gearbox: Vec<&Schedule> = all.iter().filter(|s| s.meta.gearboxes.iter().any(|g| same_code(g, &car.gearboxCode))).collect();
    if engine.is_empty() {
        // Generic: make + fuel beats fuel only beats anything.
        let fuel = norm(&car.fuel);
        let generic = all
            .iter()
            .filter(|s| s.kind == "общ")
            .filter(|s| s.meta.makes.is_empty() || same_make(&s.meta.makes, &car.make))
            .filter(|s| s.meta.fuel.is_empty() || (!fuel.is_empty() && fuel.starts_with(&norm(&s.meta.fuel))))
            .max_by_key(|s| (!s.meta.makes.is_empty()) as u8 * 2 + (!s.meta.fuel.is_empty()) as u8);
        out.extend(generic);
    } else {
        out.extend(engine);
    }
    out.extend(gearbox);
    out
}

/// Does `text` match the search expression?
pub fn matches(search: &str, text: &str) -> bool {
    let t = norm(text);
    search.split(';').map(str::trim).filter(|a| !a.is_empty()).any(|alt| {
        let words: Vec<String> = alt.split_whitespace().map(norm).collect();
        !words.is_empty()
            && words.iter().all(|w| match w.strip_prefix('-') {
                Some(not) => !t.contains(not),
                None => t.contains(w.as_str()),
            })
    })
}

/// A row of the car's `график-поддръжка.md`: done outside the shop or before
/// the car came here.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ManualDone {
    pub operation: String,
    pub date: String,
    pub km: Option<u64>,
    pub note: String,
}

pub fn read_manual(car_dir: &Path) -> Vec<ManualDone> {
    let Ok(body) = read_text(&car_dir.join(CAR_SCHEDULE_FILE)) else { return vec![] };
    parse_table(&body)
        .rows
        .into_iter()
        .map(|r| {
            let g = |i: usize| r.get(i).cloned().unwrap_or_default();
            ManualDone { operation: g(0), date: g(1), km: num(&g(2)), note: g(3) }
        })
        .filter(|m| !m.operation.is_empty())
        .collect()
}

pub fn add_manual(car_dir: &Path, row: ManualDone) -> std::io::Result<()> {
    let file = car_dir.join(CAR_SCHEDULE_FILE);
    let body = if file.exists() { read_text(&file)? } else { String::new() };
    let table = parse_table(&body);
    let mut all = read_manual(car_dir);
    all.push(row);
    all.sort_by(|a, b| b.date.cmp(&a.date));
    let rows: Vec<Vec<String>> =
        all.iter().map(|m| vec![m.operation.clone(), m.date.clone(), m.km.map(|k| k.to_string()).unwrap_or_default(), m.note.clone()]).collect();
    let prefix = if table.prefix.trim().is_empty() {
        "# График за поддръжка – отбелязано ръчно\n\nОперации, направени извън сервиза или преди колата да дойде при нас.\nИмето в първата колона трябва да съвпада с операцията в графика.".to_string()
    } else {
        table.prefix
    };
    write_atomic(&file, &render_table(&prefix, &DONE_HEADER, &rows, &table.suffix))
}

fn date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.get(..10)?, "%Y-%m-%d").ok()
}

fn fmt(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

/// The latest time an interval was done, from all evidence.
fn last_done(iv: &Interval, parts: &[PartRow], orders: &[&WorkOrder], manual: &[ManualDone]) -> Option<Done> {
    let mut found: Vec<Done> = Vec::new();
    for m in manual.iter().filter(|m| norm(&m.operation) == norm(&iv.operation)) {
        found.push(Done { date: m.date.clone(), km: m.km, what: if m.note.is_empty() { "отбелязано ръчно".into() } else { m.note.clone() } });
    }
    if !iv.search.trim().is_empty() {
        for p in parts.iter().filter(|p| matches(&iv.search, &format!("{} {}", p.part, p.brand))) {
            let what = if p.order.is_empty() { p.part.clone() } else { format!("{} ({})", p.part, p.order) };
            found.push(Done { date: p.date.clone(), km: p.km, what });
        }
        for o in orders {
            for l in o.labor.iter().filter(|l| matches(&iv.search, &l.description)) {
                found.push(Done { date: o.date.clone(), km: o.mileage, what: format!("{} ({})", l.description, o.number) });
            }
        }
    }
    found.into_iter().filter(|d| date(&d.date).is_some()).max_by(|a, b| a.date.cmp(&b.date).then(a.km.cmp(&b.km)))
}

pub fn due(sched: &Schedule, iv: &Interval, last: Option<Done>, u: &Usage, today: &str) -> DueItem {
    let today_d = date(today);
    let mut item = DueItem {
        schedule: sched.meta.name.clone(),
        operation: iv.operation.clone(),
        intervalKm: iv.km,
        intervalMonths: iv.months,
        note: iv.note.clone(),
        last: last.clone(),
        dueKm: None,
        kmLeft: None,
        dueByTime: None,
        dueByKm: None,
        nextDate: None,
        daysLeft: None,
        status: "няма_запис".into(),
    };
    let Some(last) = last else { return item };
    if let (Some(step), Some(done_km)) = (iv.km, last.km) {
        let due_km = done_km + step;
        item.dueKm = Some(due_km);
        if let Some(cur) = u.lastKm {
            let left = due_km as i64 - cur as i64;
            item.kmLeft = Some(left);
            item.dueByKm = if left <= 0 { u.lastDate.clone() } else { usage::forecast(u, left as u64) };
        }
    }
    if let (Some(m), Some(d)) = (iv.months, date(&last.date)) {
        item.dueByTime = d.checked_add_months(Months::new(m)).map(fmt);
    }
    item.nextDate = match (&item.dueByKm, &item.dueByTime) {
        (Some(a), Some(b)) => Some(a.min(b).clone()),
        (a, b) => a.clone().or(b.clone()),
    };
    if let (Some(n), Some(t)) = (item.nextDate.as_deref().and_then(date), today_d) {
        item.daysLeft = Some((n - t).num_days());
    }
    let over = item.kmLeft.map(|k| k <= 0).unwrap_or(false) || item.daysLeft.map(|d| d < 0).unwrap_or(false);
    let soon = item.kmLeft.map(|k| k <= SOON_KM).unwrap_or(false) || item.daysLeft.map(|d| d <= SOON_DAYS).unwrap_or(false);
    item.status = if over {
        "просрочено"
    } else if soon {
        "скоро"
    } else {
        "наред"
    }
    .into();
    item
}

pub struct CarHistory<'a> {
    pub car: &'a Car,
    pub pinned: &'a [String],
    pub parts: &'a [PartRow],
    pub orders: Vec<&'a WorkOrder>,
    pub manual: &'a [ManualDone],
    pub usage: &'a Usage,
}

pub fn for_car(all: &[Schedule], h: &CarHistory, today: &str) -> CarSchedule {
    let chosen = pick(all, h.car, h.pinned);
    let mut items = Vec::new();
    for s in &chosen {
        for iv in &s.intervals {
            let last = last_done(iv, h.parts, &h.orders, h.manual);
            items.push(due(s, iv, last, h.usage, today));
        }
    }
    let rank = |s: &str| match s {
        "просрочено" => 0,
        "скоро" => 1,
        "наред" => 2,
        _ => 3,
    };
    items.sort_by(|a, b| rank(&a.status).cmp(&rank(&b.status)).then(a.nextDate.cmp(&b.nextDate)));
    CarSchedule {
        schedules: chosen.into_iter().cloned().collect(),
        pinned: !h.pinned.is_empty(),
        items,
        available: all.iter().map(|s| ScheduleRef { file: s.file.clone(), name: s.meta.name.clone(), kind: s.kind.clone() }).collect(),
    }
}

/// Starter schedule files shipped with the app (file name, text).
pub const STARTER: &[(&str, &str)] = &[
    ("vag-2.0-tdi-ea288.md", include_str!("../resources/schedules/vag-2.0-tdi-ea288.md")),
    ("vag-2.0-tdi-ea189.md", include_str!("../resources/schedules/vag-2.0-tdi-ea189.md")),
    ("vag-1.6-tdi.md", include_str!("../resources/schedules/vag-1.6-tdi.md")),
    ("vag-1.9-2.0-tdi-pd.md", include_str!("../resources/schedules/vag-1.9-2.0-tdi-pd.md")),
    ("vag-1.0-1.5-tsi-ea211.md", include_str!("../resources/schedules/vag-1.0-1.5-tsi-ea211.md")),
    ("vag-1.2-1.4-tsi-ea111.md", include_str!("../resources/schedules/vag-1.2-1.4-tsi-ea111.md")),
    ("vag-1.8-2.0-tsi-ea888.md", include_str!("../resources/schedules/vag-1.8-2.0-tsi-ea888.md")),
    ("dsg-6-dq250.md", include_str!("../resources/schedules/dsg-6-dq250.md")),
    ("dsg-7-dq200.md", include_str!("../resources/schedules/dsg-7-dq200.md")),
    ("dsg-7-dq381-dq500.md", include_str!("../resources/schedules/dsg-7-dq381-dq500.md")),
    ("bmw-n47-b47.md", include_str!("../resources/schedules/bmw-n47-b47.md")),
    ("bmw-n57-b57.md", include_str!("../resources/schedules/bmw-n57-b57.md")),
    ("zf-8hp.md", include_str!("../resources/schedules/zf-8hp.md")),
    ("mercedes-om651.md", include_str!("../resources/schedules/mercedes-om651.md")),
    ("renault-dacia-1.5-dci-k9k.md", include_str!("../resources/schedules/renault-dacia-1.5-dci-k9k.md")),
    ("psa-1.6-hdi-bluehdi.md", include_str!("../resources/schedules/psa-1.6-hdi-bluehdi.md")),
    ("ford-1.5-1.6-tdci.md", include_str!("../resources/schedules/ford-1.5-1.6-tdci.md")),
    ("fiat-opel-1.3-multijet.md", include_str!("../resources/schedules/fiat-opel-1.3-multijet.md")),
    ("hyundai-kia-1.6-crdi.md", include_str!("../resources/schedules/hyundai-kia-1.6-crdi.md")),
    ("toyota-hybrid-1.8.md", include_str!("../resources/schedules/toyota-hybrid-1.8.md")),
    ("общ-дизел.md", include_str!("../resources/schedules/generic-diesel.md")),
    ("общ-бензин.md", include_str!("../resources/schedules/generic-petrol.md")),
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{LaborLine, Reading};

    const SAMPLE: &str = "---\nиме: VAG 2.0 TDI\nмарки: [Volkswagen]\nдвигатели: [CRLB, CRBC]\nизточник: тест\n---\n\n| Операция | Км | Месеци | Търси в историята | Бележка |\n|---|---|---|---|---|\n| Масло и маслен филтър | 15 000 | 12 | маслен филтър; масло -dsg -кутия | |\n| Ангренажен ремък | 210000 | 120 | ангренаж | |\n| Спирачна течност | | 24 | спирачна течност | |\n";

    fn golf() -> Car {
        Car { make: "Volkswagen".into(), engineCode: "crlb".into(), gearboxCode: "DQ250".into(), fuel: "дизел".into(), ..Default::default() }
    }

    fn usage_golf() -> Usage {
        usage::compute(&[
            Reading { date: "2026-03-14".into(), km: 189_000, source: String::new() },
            Reading { date: "2026-11-02".into(), km: 203_400, source: String::new() },
        ])
    }

    #[test]
    fn parses_schedule_files() {
        let s = parse_schedule("a.md", "", SAMPLE).unwrap();
        assert_eq!(s.kind, "двигател");
        assert_eq!(s.intervals.len(), 3);
        assert_eq!(s.intervals[0].km, Some(15_000));
        assert_eq!(s.intervals[2].km, None);
        assert_eq!(s.intervals[2].months, Some(24));
    }

    #[test]
    fn search_expressions() {
        assert!(matches("масло -dsg -кутия", "Двигателно масло 5W-30"));
        assert!(!matches("масло -dsg -кутия", "Масло DSG"));
        assert!(matches("маслен филтър; масло", "МАСЛЕН ФИЛТЪР MANN"));
        assert!(!matches("", "каквото и да е"));
    }

    #[test]
    fn picks_by_engine_code_then_generic() {
        let engine = parse_schedule("e.md", "", SAMPLE).unwrap();
        let gearbox = parse_schedule("g.md", "", "---\nкутии: [DQ250]\n---\n").unwrap();
        let diesel = parse_schedule("d.md", "", "---\nгориво: дизел\n---\n").unwrap();
        let petrol = parse_schedule("p.md", "", "---\nгориво: бензин\n---\n").unwrap();
        let all = vec![engine, gearbox, diesel, petrol];
        let names: Vec<&str> = pick(&all, &golf(), &[]).iter().map(|s| s.file.as_str()).collect();
        assert_eq!(names, vec!["e.md", "g.md"]);
        let other = Car { engineCode: "XYZ".into(), fuel: "дизел".into(), ..Default::default() };
        let names: Vec<&str> = pick(&all, &other, &[]).iter().map(|s| s.file.as_str()).collect();
        assert_eq!(names, vec!["d.md"]);
        let names: Vec<&str> = pick(&all, &other, &["p.md".into()]).iter().map(|s| s.file.as_str()).collect();
        assert_eq!(names, vec!["p.md"]);
        assert!(same_code("ZF 8HP", "zf-8hp"));
        assert!(!same_code("", ""));
    }

    #[test]
    fn due_dates_from_history_and_usage() {
        let s = parse_schedule("e.md", "", SAMPLE).unwrap();
        let parts = vec![
            PartRow { date: "2026-03-14".into(), km: Some(189_000), part: "Маслен филтър".into(), order: "РК-2026-0004".into(), ..Default::default() },
            PartRow { date: "2025-09-20".into(), km: Some(180_000), part: "Масло DSG".into(), ..Default::default() },
        ];
        let wo = WorkOrder {
            date: "2021-05-01".into(),
            mileage: Some(120_000),
            number: "РК-2021-0001".into(),
            labor: vec![LaborLine { description: "Смяна на ангренажен ремък и водна помпа".into(), ..Default::default() }],
            ..Default::default()
        };
        let car = golf();
        let u = usage_golf();
        let h = CarHistory { car: &car, pinned: &[], parts: &parts, orders: vec![&wo], manual: &[], usage: &u };
        let cs = for_car(&[s], &h, "2026-11-15");
        let oil = cs.items.iter().find(|i| i.operation.starts_with("Масло")).unwrap();
        assert_eq!(oil.last.as_ref().unwrap().date, "2026-03-14");
        assert_eq!(oil.dueKm, Some(204_000));
        assert_eq!(oil.kmLeft, Some(600));
        assert_eq!(oil.dueByKm.as_deref(), Some("2026-11-12"));
        assert_eq!(oil.dueByTime.as_deref(), Some("2027-03-14"));
        assert_eq!(oil.nextDate.as_deref(), Some("2026-11-12"));
        assert_eq!(oil.status, "просрочено");
        let belt = cs.items.iter().find(|i| i.operation.starts_with("Ангренаж")).unwrap();
        assert_eq!(belt.dueKm, Some(330_000));
        assert_eq!(belt.status, "наред");
        let fluid = cs.items.iter().find(|i| i.operation.starts_with("Спирачна")).unwrap();
        assert_eq!(fluid.status, "няма_запис");
        assert_eq!(cs.items[0].status, "просрочено", "overdue first");
    }

    #[test]
    fn manual_rows_count_and_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        add_manual(dir.path(), ManualDone { operation: "Спирачна течност".into(), date: "2026-01-10".into(), km: None, note: "друг сервиз".into() }).unwrap();
        let manual = read_manual(dir.path());
        assert_eq!(manual.len(), 1);
        let s = parse_schedule("e.md", "", SAMPLE).unwrap();
        let car = golf();
        let u = usage_golf();
        let h = CarHistory { car: &car, pinned: &[], parts: &[], orders: vec![], manual: &manual, usage: &u };
        let cs = for_car(&[s], &h, "2026-11-15");
        let fluid = cs.items.iter().find(|i| i.operation.starts_with("Спирачна")).unwrap();
        assert_eq!(fluid.nextDate.as_deref(), Some("2028-01-10"));
        assert_eq!(fluid.status, "наред");
    }

    #[test]
    fn starter_files_all_parse() {
        for (name, text) in STARTER {
            let s = parse_schedule(name, "", text.trim_start_matches('\u{feff}')).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!s.intervals.is_empty(), "{name} has no intervals");
            assert!(!s.meta.source.is_empty(), "{name} has no source");
            assert!(!s.meta.verified, "{name}: starter data is unchecked until the owner checks it");
        }
    }
}
