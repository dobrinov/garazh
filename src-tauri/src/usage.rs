//! How much a car is driven, from its odometer readings.

use crate::model::Reading;
use chrono::NaiveDate;
use serde::Serialize;

const DAYS_PER_MONTH: f64 = 30.44;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Period {
    pub from: String,
    pub to: String,
    pub km: u64,
    pub days: i64,
    pub perDay: f64,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// The latest odometer value known.
    pub lastKm: Option<u64>,
    pub lastDate: Option<String>,
    /// Pace in the most recent period between readings; used for forecasts.
    pub recentPerDay: Option<f64>,
    /// Pace over the whole history.
    pub averagePerDay: Option<f64>,
    pub recentPerMonth: Option<f64>,
    pub recentPerYear: Option<f64>,
    pub averagePerMonth: Option<f64>,
    /// Recent pace against the long-term average, in percent.
    pub changePercent: Option<i64>,
    pub periods: Vec<Period>,
    /// Readings that go backwards (typos, replaced odometer).
    pub warnings: Vec<String>,
}

fn date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

pub fn compute(readings: &[Reading]) -> Usage {
    let mut rs: Vec<(NaiveDate, &Reading)> = readings.iter().filter_map(|r| date(&r.date).map(|d| (d, r))).collect();
    rs.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.km.cmp(&b.1.km)));

    let mut u = Usage::default();
    // Keep the highest reading per day, drop readings that go backwards.
    let mut clean: Vec<(NaiveDate, u64)> = Vec::new();
    for (d, r) in rs {
        if let Some(last) = clean.last_mut() {
            if r.km < last.1 {
                u.warnings.push(format!("Пробегът {} км на {} е по-малък от предишния ({} км)", r.km, r.date, last.1));
                continue;
            }
            if last.0 == d {
                last.1 = r.km;
                continue;
            }
        }
        clean.push((d, r.km));
    }
    if let Some((d, km)) = clean.last() {
        u.lastKm = Some(*km);
        u.lastDate = Some(d.format("%Y-%m-%d").to_string());
    }
    for w in clean.windows(2) {
        let days = (w[1].0 - w[0].0).num_days();
        let km = w[1].1 - w[0].1;
        u.periods.push(Period {
            from: w[0].0.format("%Y-%m-%d").to_string(),
            to: w[1].0.format("%Y-%m-%d").to_string(),
            km,
            days,
            perDay: km as f64 / days as f64,
        });
    }
    if let (Some(first), Some(last), Some(recent)) = (clean.first(), clean.last(), u.periods.last()) {
        let days = (last.0 - first.0).num_days() as f64;
        let avg = (last.1 - first.1) as f64 / days;
        u.recentPerDay = Some(recent.perDay);
        u.averagePerDay = Some(avg);
        u.recentPerMonth = Some(recent.perDay * DAYS_PER_MONTH);
        u.recentPerYear = Some(recent.perDay * 365.0);
        u.averagePerMonth = Some(avg * DAYS_PER_MONTH);
        if avg > 0.0 {
            u.changePercent = Some(((recent.perDay / avg - 1.0) * 100.0).round() as i64);
        }
    }
    u
}

/// The date the car is expected to have covered `km_left` more km at its recent pace.
/// Used by the maintenance schedule (version 1.0).
#[allow(dead_code)]
pub fn forecast(u: &Usage, km_left: u64) -> Option<String> {
    let per_day = u.recentPerDay.filter(|p| *p > 0.0)?;
    let from = date(u.lastDate.as_deref()?)?;
    let days = (km_left as f64 / per_day).ceil() as i64;
    Some((from + chrono::Duration::days(days)).format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(date: &str, km: u64) -> Reading {
        Reading { date: date.into(), km, source: String::new() }
    }

    #[test]
    fn golf_example_from_the_design() {
        let u = compute(&[
            r("2026-11-02", 203_400),
            r("2023-12-19", 158_900),
            r("2024-05-05", 165_000),
            r("2025-01-11", 172_300),
            r("2025-09-20", 180_000),
            r("2026-03-14", 189_000),
        ]);
        assert_eq!(u.lastKm, Some(203_400));
        assert_eq!(u.periods.len(), 5);
        let recent = u.recentPerDay.unwrap();
        assert!((recent - 14_400.0 / 233.0).abs() < 1e-9);
        assert_eq!(u.recentPerMonth.unwrap().round(), 1881.0);
        assert!(u.changePercent.unwrap() > 40);
        assert_eq!(forecast(&u, 600).as_deref(), Some("2026-11-12"));
    }

    #[test]
    fn backwards_and_same_day_readings() {
        let u = compute(&[r("2026-01-01", 1000), r("2026-01-01", 1200), r("2026-02-01", 900), r("2026-03-02", 2700)]);
        assert_eq!(u.warnings.len(), 1);
        assert_eq!(u.periods.len(), 1);
        assert_eq!(u.periods[0].km, 1500);
        assert_eq!(u.periods[0].days, 60);
    }

    #[test]
    fn one_reading_has_no_pace() {
        let u = compute(&[r("2026-01-01", 1000)]);
        assert_eq!(u.lastKm, Some(1000));
        assert_eq!(u.recentPerDay, None);
        assert_eq!(forecast(&u, 100), None);
    }
}
