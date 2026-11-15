//! Records as they travel over IPC (English camelCase). See `md` for how
//! they are stored on disk with Bulgarian keys.
#![allow(non_snake_case)]

use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fmt;

/// Money in euro cents. Written as "52.00" so files stay readable and
/// no float rounding ever touches stored amounts.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct Money(pub i64);

impl Money {
    pub fn parse(s: &str) -> Option<Money> {
        let t: String = s.trim().replace(',', ".").chars().filter(|c| !c.is_whitespace() && *c != '€').collect();
        if t.is_empty() {
            return Some(Money(0));
        }
        let (neg, t) = match t.strip_prefix('-') {
            Some(r) => (true, r.to_string()),
            None => (false, t),
        };
        let mut it = t.splitn(2, '.');
        let whole: i64 = it.next()?.parse().ok()?;
        let frac = it.next().unwrap_or("");
        if !frac.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        let mut f: String = frac.chars().take(3).collect();
        while f.len() < 3 {
            f.push('0');
        }
        // round half up on the third decimal
        let thousandths: i64 = f.parse().ok()?;
        let cents = whole * 100 + (thousandths + 5) / 10;
        Some(Money(if neg { -cents } else { cents }))
    }

    pub fn format(self) -> String {
        let a = self.0.abs();
        format!("{}{}.{:02}", if self.0 < 0 { "-" } else { "" }, a / 100, a % 100)
    }

    pub fn times(self, qty: f64) -> Money {
        Money((self.0 as f64 * qty).round() as i64)
    }

    pub fn percent(self, p: u32) -> Money {
        Money((self.0 as f64 * p as f64 / 100.0).round() as i64)
    }
}

impl Serialize for Money {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.format())
    }
}

impl<'de> Deserialize<'de> for Money {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> de::Visitor<'de> for V {
            type Value = Money;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("сума като \"52.00\"")
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Money, E> {
                Money::parse(v).ok_or_else(|| E::custom(format!("невалидна сума: {v}")))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Money, E> {
                Ok(Money(v * 100))
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Money, E> {
                Ok(Money(v as i64 * 100))
            }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Money, E> {
                Ok(Money((v * 100.0).round() as i64))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Money, E> {
                Ok(Money(0))
            }
        }
        d.deserialize_any(V)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Counters {
    pub client: u32,
    pub workOrder: u32,
    pub quote: u32,
    pub report: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Shop {
    pub schema: u32,
    pub name: String,
    pub phone: String,
    pub address: String,
    pub eik: String,
    pub laborRate: Money,
    pub vatPercent: u32,
    pub vatRegistered: bool,
    /// Logo file in the data folder (e.g. "лого.png"); empty = none.
    pub logo: String,
    pub counters: Counters,
    pub features: BTreeMap<String, bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Shop {
    fn default() -> Self {
        Shop {
            schema: 1,
            name: "Автосервиз".into(),
            phone: String::new(),
            address: String::new(),
            eik: String::new(),
            laborRate: Money(5000),
            vatPercent: 20,
            vatRegistered: true,
            logo: String::new(),
            counters: Counters::default(),
            features: BTreeMap::new(),
            extra: Map::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Client {
    pub id: String,
    pub number: u32,
    pub name: String,
    /// "частно" or "фирма"
    pub kind: String,
    pub phone: String,
    pub email: String,
    pub eik: String,
    pub address: String,
    pub viber: bool,
    pub gdprConsent: Option<String>,
    pub discountPercent: u32,
    pub created: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Car {
    pub id: String,
    pub clientId: String,
    pub plate: String,
    pub vin: String,
    pub make: String,
    pub model: String,
    pub year: Option<u32>,
    pub engine: String,
    pub engineCode: String,
    pub gearbox: String,
    pub gearboxCode: String,
    pub fuel: String,
    pub color: String,
    pub paintCode: String,
    pub tyres: String,
    pub inspectionUntil: Option<String>,
    pub insuranceUntil: Option<String>,
    pub vignetteUntil: Option<String>,
    /// Fields the user typed over an automatic (VIN) value.
    pub manualFields: Vec<String>,
    /// Fields last filled from the VIN (not typed by hand).
    pub vinFields: Vec<String>,
    /// Schedule files chosen by hand; empty = matched by engine and gearbox code.
    pub schedules: Vec<String>,
    pub pastOwners: Vec<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LaborLine {
    pub description: String,
    pub mechanic: String,
    pub hours: f64,
    pub rate: Money,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PartLine {
    pub part: String,
    pub partNumber: String,
    pub quantity: f64,
    pub unit: String,
    pub price: Money,
}

pub const STATUS_DELIVERED: &str = "предадена";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkOrder {
    pub id: String,
    pub number: String,
    pub clientId: String,
    pub carId: String,
    pub date: String,
    pub title: String,
    /// приета | диагностика | чака_части | в_ремонт | готова | предадена
    pub status: String,
    pub mileage: Option<u64>,
    pub fuelLevel: String,
    pub complaint: String,
    pub mechanic: String,
    pub labor: Vec<LaborLine>,
    pub parts: Vec<PartLine>,
    pub discountPercent: u32,
    pub vatPercent: u32,
    pub payment: String,
    pub paid: bool,
    pub closedOn: Option<String>,
    pub historyWritten: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub labor: Money,
    pub parts: Money,
    pub discount: Money,
    pub net: Money,
    pub vat: Money,
    pub total: Money,
}

pub fn totals(labor: &[LaborLine], parts: &[PartLine], discount_percent: u32, vat_percent: u32) -> Totals {
    let labor = Money(labor.iter().map(|l| l.rate.times(l.hours).0).sum());
    let parts = Money(parts.iter().map(|p| p.price.times(p.quantity).0).sum());
    let gross = Money(labor.0 + parts.0);
    let discount = gross.percent(discount_percent);
    let net = Money(gross.0 - discount.0);
    let vat = net.percent(vat_percent);
    Totals { labor, parts, discount, net, vat, total: Money(net.0 + vat.0) }
}

impl WorkOrder {
    pub fn totals(&self) -> Totals {
        totals(&self.labor, &self.parts, self.discountPercent, self.vatPercent)
    }
}

pub const QUOTE: &str = "оферта";
pub const REPAIR_REPORT: &str = "доклад";
pub const DIAGNOSTIC_REPORT: &str = "диагностика";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct FaultRow {
    pub code: String,
    pub text: String,
}

/// A quote or a report for the customer (a folder under the car's
/// `оферти-и-доклади`). Quotes carry priced lines; reports describe what
/// was found or done.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Quote {
    pub id: String,
    pub number: String,
    /// оферта | доклад | диагностика
    pub kind: String,
    pub clientId: String,
    pub carId: String,
    /// The work order it was made from, or the one made from it.
    pub orderId: String,
    pub date: String,
    pub validUntil: Option<String>,
    pub title: String,
    pub mileage: Option<u64>,
    /// чернова | изпратена | приета | отказана
    pub status: String,
    pub findings: String,
    pub recommendations: String,
    pub faultCodes: Vec<FaultRow>,
    pub labor: Vec<LaborLine>,
    pub parts: Vec<PartLine>,
    pub discountPercent: u32,
    pub vatPercent: u32,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Quote {
    pub fn totals(&self) -> Totals {
        totals(&self.labor, &self.parts, self.discountPercent, self.vatPercent)
    }
}

/// One odometer reading (a row of пробег.md).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Reading {
    pub date: String,
    pub km: u64,
    pub source: String,
}

/// One part or consumable fitted to a car (a row of части.md).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PartRow {
    pub date: String,
    pub km: Option<u64>,
    pub part: String,
    pub brand: String,
    pub quantity: String,
    pub price: String,
    pub order: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_parses_and_formats() {
        assert_eq!(Money::parse("52.00"), Some(Money(5200)));
        assert_eq!(Money::parse("52,5"), Some(Money(5250)));
        assert_eq!(Money::parse("€ 1 180"), Some(Money(118000)));
        assert_eq!(Money::parse("11.305"), Some(Money(1131)));
        assert_eq!(Money::parse("-3.10"), Some(Money(-310)));
        assert_eq!(Money::parse("abc"), None);
        assert_eq!(Money(118000).format(), "1180.00");
        assert_eq!(Money(-5).format(), "-0.05");
    }

    #[test]
    fn work_order_totals_with_discount_and_vat() {
        let wo = WorkOrder {
            labor: vec![LaborLine { hours: 1.5, rate: Money(5000), ..Default::default() }],
            parts: vec![PartLine { quantity: 4.6, price: Money(1130), ..Default::default() }],
            discountPercent: 5,
            vatPercent: 20,
            ..Default::default()
        };
        let t = wo.totals();
        assert_eq!(t.labor, Money(7500));
        assert_eq!(t.parts, Money(5198));
        assert_eq!(t.discount, Money(635)); // 5% of 126.98 = 6.349
        assert_eq!(t.net, Money(12063));
        assert_eq!(t.vat, Money(2413));
        assert_eq!(t.total, Money(14476));
    }
}
