//! Read-only summaries for lists and the dashboard, built from one scan.
#![allow(non_snake_case)]

use crate::model::*;
use crate::store::{FileInfo, Loaded, Problem, Scan};
use crate::usage::{self, Usage};
use chrono::NaiveDate;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CarRef {
    pub id: String,
    pub plate: String,
    pub make: String,
    pub model: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientSummary {
    pub client: Client,
    pub cars: Vec<CarRef>,
    pub lastVisit: Option<String>,
    pub turnover: Money,
    pub unpaid: Money,
    pub openOrders: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Deadline {
    /// гтп | го | винетка
    pub kind: String,
    pub label: String,
    pub date: String,
    pub days: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CarSummary {
    pub car: Car,
    pub ownerName: String,
    pub usage: Usage,
    pub lastVisit: Option<String>,
    pub openOrder: Option<String>,
    pub deadlines: Vec<Deadline>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OrderSummary {
    pub order: WorkOrder,
    pub totals: Totals,
    pub plate: String,
    pub carName: String,
    pub clientName: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientDetail {
    pub client: Loaded<Client>,
    pub cars: Vec<CarSummary>,
    pub orders: Vec<OrderSummary>,
    pub turnover: Money,
    pub unpaid: Money,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CarDetail {
    pub car: Loaded<Car>,
    pub owner: Client,
    pub readings: Vec<Reading>,
    pub usage: Usage,
    pub parts: Vec<PartRow>,
    pub orders: Vec<OrderSummary>,
    pub documents: Vec<FileInfo>,
    pub deadlines: Vec<Deadline>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OrderDetail {
    pub order: Loaded<WorkOrder>,
    pub totals: Totals,
    pub car: Car,
    pub client: Client,
    pub files: Vec<FileInfo>,
    pub carKm: Option<u64>,
    pub carUsage: Usage,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeadlineRow {
    pub carId: String,
    pub plate: String,
    pub carName: String,
    pub clientId: String,
    pub clientName: String,
    pub deadline: Deadline,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub inShop: Vec<OrderSummary>,
    pub deadlines: Vec<DeadlineRow>,
    pub clients: usize,
    pub cars: usize,
    pub monthTurnover: Money,
    pub unpaid: Money,
    pub problems: Vec<Problem>,
}

pub fn car_name(c: &Car) -> String {
    format!("{} {}", c.make, c.model).trim().to_string()
}

fn days_between(today: &str, d: &str) -> Option<i64> {
    let a = NaiveDate::parse_from_str(today, "%Y-%m-%d").ok()?;
    let b = NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()?;
    Some((b - a).num_days())
}

pub fn deadlines(c: &Car, today: &str) -> Vec<Deadline> {
    let mut v = Vec::new();
    for (kind, label, date) in [
        ("гтп", "ГТП", &c.inspectionUntil),
        ("го", "Гражданска отговорност", &c.insuranceUntil),
        ("винетка", "Винетка", &c.vignetteUntil),
    ] {
        if let Some(d) = date {
            if let Some(days) = days_between(today, d) {
                v.push(Deadline { kind: kind.into(), label: label.into(), date: d.clone(), days });
            }
        }
    }
    v.sort_by_key(|d| d.days);
    v
}

/// Readings from пробег.md plus the mileage written on work orders.
fn all_readings(scan: &Scan, car_id: &str, base: &[Reading]) -> Vec<Reading> {
    let mut rs = base.to_vec();
    for o in scan.orders.iter().filter(|o| o.data.carId == car_id) {
        if let Some(km) = o.data.mileage {
            if !rs.iter().any(|r| r.source == o.data.number) {
                rs.push(Reading { date: o.data.date.clone(), km, source: o.data.number.clone() });
            }
        }
    }
    rs.sort_by(|a, b| a.date.cmp(&b.date).then(a.km.cmp(&b.km)));
    rs
}

fn is_open(o: &WorkOrder) -> bool {
    o.status != STATUS_DELIVERED
}

fn counts_as_turnover(o: &WorkOrder) -> bool {
    o.closedOn.is_some()
}

pub fn order_summary(scan: &Scan, o: &WorkOrder) -> OrderSummary {
    let car = scan.cars.iter().find(|c| c.0.data.id == o.carId).map(|c| &c.0.data);
    let client = scan.clients.iter().find(|c| c.data.id == o.clientId).map(|c| &c.data);
    OrderSummary {
        order: o.clone(),
        totals: o.totals(),
        plate: car.map(|c| c.plate.clone()).unwrap_or_default(),
        carName: car.map(car_name).unwrap_or_default(),
        clientName: client.map(|c| c.name.clone()).unwrap_or_default(),
    }
}

pub fn car_summary(scan: &Scan, car: &Loaded<Car>, readings: &[Reading], today: &str) -> CarSummary {
    let rs = all_readings(scan, &car.data.id, readings);
    let orders: Vec<&WorkOrder> = scan.orders.iter().filter(|o| o.data.carId == car.data.id).map(|o| &o.data).collect();
    CarSummary {
        car: car.data.clone(),
        ownerName: scan.clients.iter().find(|c| c.data.id == car.data.clientId).map(|c| c.data.name.clone()).unwrap_or_default(),
        usage: usage::compute(&rs),
        lastVisit: orders.iter().map(|o| o.date.clone()).max(),
        openOrder: orders.iter().find(|o| is_open(o)).map(|o| o.id.clone()),
        deadlines: deadlines(&car.data, today),
    }
}

pub fn clients(scan: &Scan) -> Vec<ClientSummary> {
    scan.clients
        .iter()
        .map(|c| {
            let orders: Vec<&WorkOrder> = scan.orders.iter().filter(|o| o.data.clientId == c.data.id).map(|o| &o.data).collect();
            ClientSummary {
                client: c.data.clone(),
                cars: scan
                    .cars
                    .iter()
                    .filter(|k| k.0.data.clientId == c.data.id)
                    .map(|k| CarRef { id: k.0.data.id.clone(), plate: k.0.data.plate.clone(), make: k.0.data.make.clone(), model: k.0.data.model.clone() })
                    .collect(),
                lastVisit: orders.iter().map(|o| o.date.clone()).max(),
                turnover: Money(orders.iter().filter(|o| counts_as_turnover(o)).map(|o| o.totals().total.0).sum()),
                unpaid: Money(orders.iter().filter(|o| counts_as_turnover(o) && !o.paid).map(|o| o.totals().total.0).sum()),
                openOrders: orders.iter().filter(|o| is_open(o)).count(),
            }
        })
        .collect()
}

pub fn cars(scan: &Scan, today: &str) -> Vec<CarSummary> {
    scan.cars.iter().map(|(car, rs)| car_summary(scan, car, rs, today)).collect()
}

pub fn orders(scan: &Scan) -> Vec<OrderSummary> {
    let mut v: Vec<OrderSummary> = scan.orders.iter().map(|o| order_summary(scan, &o.data)).collect();
    v.sort_by(|a, b| b.order.date.cmp(&a.order.date).then(b.order.number.cmp(&a.order.number)));
    v
}

pub fn dashboard(scan: &Scan, today: &str) -> Dashboard {
    let month = &today[..7.min(today.len())];
    let mut in_shop: Vec<OrderSummary> = scan.orders.iter().filter(|o| is_open(&o.data)).map(|o| order_summary(scan, &o.data)).collect();
    in_shop.sort_by(|a, b| a.order.date.cmp(&b.order.date));
    let mut rows = Vec::new();
    for (car, _) in &scan.cars {
        let client = scan.clients.iter().find(|c| c.data.id == car.data.clientId);
        for d in deadlines(&car.data, today) {
            if d.days <= 30 {
                rows.push(DeadlineRow {
                    carId: car.data.id.clone(),
                    plate: car.data.plate.clone(),
                    carName: car_name(&car.data),
                    clientId: car.data.clientId.clone(),
                    clientName: client.map(|c| c.data.name.clone()).unwrap_or_default(),
                    deadline: d,
                });
            }
        }
    }
    rows.sort_by_key(|r| r.deadline.days);
    Dashboard {
        inShop: in_shop,
        deadlines: rows,
        clients: scan.clients.len(),
        cars: scan.cars.len(),
        monthTurnover: Money(
            scan.orders
                .iter()
                .filter(|o| o.data.closedOn.as_deref().map(|d| d.starts_with(month)).unwrap_or(false))
                .map(|o| o.data.totals().total.0)
                .sum(),
        ),
        unpaid: Money(scan.orders.iter().filter(|o| counts_as_turnover(&o.data) && !o.data.paid).map(|o| o.data.totals().total.0).sum()),
        problems: scan.problems.clone(),
    }
}

pub fn client_detail(scan: &Scan, id: &str, today: &str) -> Option<ClientDetail> {
    let client = scan.clients.iter().find(|c| c.data.id == id)?.clone();
    let summary = clients(scan).into_iter().find(|s| s.client.id == id)?;
    let mut orders: Vec<OrderSummary> = scan.orders.iter().filter(|o| o.data.clientId == id).map(|o| order_summary(scan, &o.data)).collect();
    orders.sort_by(|a, b| b.order.date.cmp(&a.order.date));
    Some(ClientDetail {
        client,
        cars: scan.cars.iter().filter(|k| k.0.data.clientId == id).map(|(k, rs)| car_summary(scan, k, rs, today)).collect(),
        orders,
        turnover: summary.turnover,
        unpaid: summary.unpaid,
    })
}

pub fn car_detail(scan: &Scan, id: &str, parts: Vec<PartRow>, documents: Vec<FileInfo>, today: &str) -> Option<CarDetail> {
    let (car, base) = scan.cars.iter().find(|c| c.0.data.id == id)?;
    let readings = all_readings(scan, id, base);
    let mut orders: Vec<OrderSummary> = scan.orders.iter().filter(|o| o.data.carId == id).map(|o| order_summary(scan, &o.data)).collect();
    orders.sort_by(|a, b| b.order.date.cmp(&a.order.date));
    Some(CarDetail {
        owner: scan.clients.iter().find(|c| c.data.id == car.data.clientId).map(|c| c.data.clone()).unwrap_or_default(),
        usage: usage::compute(&readings),
        readings,
        parts,
        orders,
        documents,
        deadlines: deadlines(&car.data, today),
        car: car.clone(),
    })
}

pub fn order_detail(scan: &Scan, id: &str, files: Vec<FileInfo>) -> Option<OrderDetail> {
    let o = scan.orders.iter().find(|o| o.data.id == id)?.clone();
    let (car, base) = scan.cars.iter().find(|c| c.0.data.id == o.data.carId)?;
    let rs = all_readings(scan, &car.data.id, base);
    let u = usage::compute(&rs);
    Some(OrderDetail {
        totals: o.data.totals(),
        car: car.data.clone(),
        client: scan.clients.iter().find(|c| c.data.id == o.data.clientId).map(|c| c.data.clone()).unwrap_or_default(),
        files,
        carKm: u.lastKm,
        carUsage: u,
        order: o,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deadlines_are_sorted_and_counted_in_days() {
        let car = Car {
            inspectionUntil: Some("2026-11-28".into()),
            insuranceUntil: Some("2027-03-14".into()),
            vignetteUntil: Some("bad".into()),
            ..Default::default()
        };
        let d = deadlines(&car, "2026-11-16");
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].kind, "гтп");
        assert_eq!(d[0].days, 12);
    }
}
