//! Stock (Склад), optional. Two plain tables in the data folder:
//!
//! `склад/наличност.md` – what is on the shelf:
//! | Код   | Част          | Марка / кат. № | Наличност | Мярка | Мин. | Доставна цена | Продажна цена | Място |
//! | С0001 | Маслен филтър | MANN HU 816 x  | 6         | бр.   | 2    | 9.50          | 14.00         | Р1-2  |
//!
//! `склад/движения.md` – every change, newest first, so the count can be
//! checked against deliveries and work orders:
//! | Дата       | Код   | Част          | Промяна | Остатък | Причина  | Работна карта |
//!
//! Parts picked from stock in a work order carry the stock code; closing
//! the work order takes them off the shelf once.
#![allow(non_snake_case)]

use crate::md::{parse_table, read_text, render_table, write_atomic};
use crate::model::Money;
use crate::store::{Result, StoreError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const STOCK_DIR: &str = "склад";
const ITEMS_FILE: &str = "наличност.md";
const MOVES_FILE: &str = "движения.md";
const ITEMS_HEADER: [&str; 9] = ["Код", "Част", "Марка / кат. №", "Наличност", "Мярка", "Мин.", "Доставна цена", "Продажна цена", "Място"];
const MOVES_HEADER: [&str; 7] = ["Дата", "Код", "Част", "Промяна", "Остатък", "Причина", "Работна карта"];

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct StockItem {
    pub code: String,
    pub part: String,
    pub partNumber: String,
    pub quantity: f64,
    pub unit: String,
    /// Warn when the quantity falls to this or below; 0 = never.
    pub minimum: f64,
    pub buyPrice: Money,
    pub sellPrice: Money,
    pub place: String,
}

impl StockItem {
    pub fn low(&self) -> bool {
        self.minimum > 0.0 && self.quantity <= self.minimum
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct StockMove {
    pub date: String,
    pub code: String,
    pub part: String,
    pub change: f64,
    pub balance: f64,
    pub reason: String,
    pub order: String,
}

pub struct Stock {
    dir: PathBuf,
}

pub fn qty(q: f64) -> String {
    if (q - q.round()).abs() < 1e-9 {
        format!("{}", q.round() as i64)
    } else {
        format!("{}", (q * 1000.0).round() / 1000.0)
    }
}

fn parse_qty(s: &str) -> f64 {
    s.trim().replace(',', ".").replace(' ', "").parse().unwrap_or(0.0)
}

fn signed(q: f64) -> String {
    if q > 0.0 { format!("+{}", qty(q)) } else { qty(q) }
}

impl Stock {
    pub fn new(root: &Path) -> Stock {
        Stock { dir: root.join(STOCK_DIR) }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn items(&self) -> Vec<StockItem> {
        let Ok(body) = read_text(&self.dir.join(ITEMS_FILE)) else { return vec![] };
        parse_table(&body)
            .rows
            .into_iter()
            .map(|r| {
                let g = |i: usize| r.get(i).map(|s| s.trim().to_string()).unwrap_or_default();
                StockItem {
                    code: g(0),
                    part: g(1),
                    partNumber: g(2),
                    quantity: parse_qty(&g(3)),
                    unit: g(4),
                    minimum: parse_qty(&g(5)),
                    buyPrice: Money::parse(&g(6)).unwrap_or_default(),
                    sellPrice: Money::parse(&g(7)).unwrap_or_default(),
                    place: g(8),
                }
            })
            .filter(|i| !i.code.is_empty() || !i.part.is_empty())
            .collect()
    }

    pub fn moves(&self) -> Vec<StockMove> {
        let Ok(body) = read_text(&self.dir.join(MOVES_FILE)) else { return vec![] };
        parse_table(&body)
            .rows
            .into_iter()
            .map(|r| {
                let g = |i: usize| r.get(i).map(|s| s.trim().to_string()).unwrap_or_default();
                StockMove { date: g(0), code: g(1), part: g(2), change: parse_qty(&g(3)), balance: parse_qty(&g(4)), reason: g(5), order: g(6) }
            })
            .collect()
    }

    fn write_items(&self, items: &[StockItem]) -> Result<()> {
        let file = self.dir.join(ITEMS_FILE);
        let table = parse_table(&if file.exists() { read_text(&file)? } else { String::new() });
        let mut items = items.to_vec();
        items.sort_by(|a, b| a.part.to_lowercase().cmp(&b.part.to_lowercase()).then(a.code.cmp(&b.code)));
        let rows: Vec<Vec<String>> = items
            .iter()
            .map(|i| {
                vec![
                    i.code.clone(),
                    i.part.clone(),
                    i.partNumber.clone(),
                    qty(i.quantity),
                    i.unit.clone(),
                    if i.minimum > 0.0 { qty(i.minimum) } else { String::new() },
                    i.buyPrice.format(),
                    i.sellPrice.format(),
                    i.place.clone(),
                ]
            })
            .collect();
        let prefix = if table.prefix.trim().is_empty() {
            "# Склад – наличност\n\nПрограмата променя наличността при доставка, корекция и приключване на работна карта.\nВсяка промяна се записва в движения.md.".to_string()
        } else {
            table.prefix
        };
        write_atomic(&file, &render_table(&prefix, &ITEMS_HEADER, &rows, &table.suffix))?;
        Ok(())
    }

    fn log(&self, new: Vec<StockMove>) -> Result<()> {
        if new.is_empty() {
            return Ok(());
        }
        let file = self.dir.join(MOVES_FILE);
        let table = parse_table(&if file.exists() { read_text(&file)? } else { String::new() });
        // Newest first: this batch on top, in its own order (e.g. the work
        // order's lines), then everything before it.
        let mut all = new;
        all.extend(self.moves());
        all.sort_by(|a, b| b.date.cmp(&a.date));
        let rows: Vec<Vec<String>> = all
            .iter()
            .map(|m| vec![m.date.clone(), m.code.clone(), m.part.clone(), signed(m.change), qty(m.balance), m.reason.clone(), m.order.clone()])
            .collect();
        let prefix = if table.prefix.trim().is_empty() { "# Склад – движения".to_string() } else { table.prefix };
        write_atomic(&file, &render_table(&prefix, &MOVES_HEADER, &rows, &table.suffix))?;
        Ok(())
    }

    fn next_code(items: &[StockItem]) -> String {
        let n = items
            .iter()
            .filter_map(|i| i.code.strip_prefix('С').and_then(|d| d.parse::<u32>().ok()))
            .max()
            .unwrap_or(0);
        format!("С{:04}", n + 1)
    }

    /// Add a new item or change an existing one (`original` = its code before
    /// the edit). The quantity of an existing item is changed only through
    /// receive/adjust, so the movements stay complete.
    pub fn save(&self, mut item: StockItem, original: Option<&str>, date: &str) -> Result<Vec<StockItem>> {
        item.part = item.part.trim().to_string();
        item.code = item.code.trim().to_string();
        if item.part.is_empty() {
            return Err(StoreError::Invalid("Въведете име на частта".into()));
        }
        let mut items = self.items();
        if item.code.is_empty() {
            item.code = Self::next_code(&items);
        }
        if items.iter().any(|i| i.code == item.code && Some(i.code.as_str()) != original) {
            return Err(StoreError::Invalid(format!("Код {} вече се използва", item.code)));
        }
        match original.and_then(|o| items.iter().position(|i| i.code == o)) {
            Some(pos) => {
                item.quantity = items[pos].quantity;
                items[pos] = item;
                self.write_items(&items)?;
            }
            None => {
                let start = item.quantity;
                let (code, part) = (item.code.clone(), item.part.clone());
                items.push(item);
                self.write_items(&items)?;
                if start != 0.0 {
                    self.log(vec![StockMove { date: date.into(), code, part, change: start, balance: start, reason: "начална наличност".into(), order: String::new() }])?;
                }
            }
        }
        Ok(self.items())
    }

    /// Change the quantity by `change` (delivery: +, correction: + or −).
    pub fn change(&self, code: &str, change: f64, reason: &str, date: &str, buy_price: Option<Money>) -> Result<Vec<StockItem>> {
        if change == 0.0 {
            return Err(StoreError::Invalid("Въведете количество".into()));
        }
        let mut items = self.items();
        let it = items.iter_mut().find(|i| i.code == code).ok_or_else(|| StoreError::NotFound(format!("артикул {code} в склада")))?;
        it.quantity += change;
        if let Some(p) = buy_price.filter(|p| p.0 > 0) {
            it.buyPrice = p;
        }
        let m = StockMove { date: date.into(), code: code.into(), part: it.part.clone(), change, balance: it.quantity, reason: reason.trim().into(), order: String::new() };
        self.write_items(&items)?;
        self.log(vec![m])?;
        Ok(self.items())
    }

    pub fn remove(&self, code: &str) -> Result<Vec<StockItem>> {
        let mut items = self.items();
        let before = items.len();
        items.retain(|i| i.code != code);
        if items.len() == before {
            return Err(StoreError::NotFound(format!("артикул {code} в склада")));
        }
        self.write_items(&items)?;
        Ok(items)
    }

    /// Take parts used on a work order off the shelf: (code, quantity).
    /// Codes not in stock any more are skipped and returned.
    pub fn take(&self, used: &[(String, f64)], order_number: &str, date: &str) -> Result<Vec<String>> {
        let mut items = self.items();
        let mut moves = Vec::new();
        let mut missing = Vec::new();
        for (code, q) in used {
            match items.iter_mut().find(|i| &i.code == code) {
                Some(it) => {
                    it.quantity -= q;
                    moves.push(StockMove { date: date.into(), code: code.clone(), part: it.part.clone(), change: -q, balance: it.quantity, reason: "работна карта".into(), order: order_number.into() });
                }
                None => missing.push(code.clone()),
            }
        }
        if !moves.is_empty() {
            self.write_items(&items)?;
            self.log(moves)?;
        }
        Ok(missing)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(part: &str, q: f64, min: f64) -> StockItem {
        StockItem { part: part.into(), partNumber: "MANN HU 816 x".into(), quantity: q, unit: "бр.".into(), minimum: min, sellPrice: Money(1400), ..Default::default() }
    }

    #[test]
    fn add_receive_take_and_log() {
        let dir = tempfile::tempdir().unwrap();
        let s = Stock::new(dir.path());
        assert!(s.items().is_empty());
        let items = s.save(item("Маслен филтър", 3.0, 2.0), None, "2026-11-01").unwrap();
        assert_eq!(items[0].code, "С0001");
        s.save(item("Масло 5W-30", 20.0, 5.0), None, "2026-11-01").unwrap();
        assert!(s.save(StockItem { code: "С0001".into(), ..item("x", 1.0, 0.0) }, None, "2026-11-01").is_err(), "codes are unique");

        let items = s.change("С0001", 5.0, "доставка", "2026-11-02", Some(Money(950))).unwrap();
        let f = items.iter().find(|i| i.code == "С0001").unwrap();
        assert_eq!((f.quantity, f.buyPrice), (8.0, Money(950)));

        let missing = s.take(&[("С0001".into(), 7.0), ("С0002".into(), 4.5), ("С0099".into(), 1.0)], "РК-0007", "2026-11-03").unwrap();
        assert_eq!(missing, vec!["С0099".to_string()]);
        let items = s.items();
        let f = items.iter().find(|i| i.code == "С0001").unwrap();
        assert_eq!(f.quantity, 1.0);
        assert!(f.low());
        assert_eq!(items.iter().find(|i| i.code == "С0002").unwrap().quantity, 15.5);

        let moves = s.moves();
        assert_eq!(moves.len(), 5);
        assert_eq!((moves[0].date.as_str(), moves[0].order.as_str()), ("2026-11-03", "РК-0007"));
        assert_eq!(moves[0].change, -7.0);
        assert_eq!(moves.last().unwrap().reason, "начална наличност");

        let text = read_text(&dir.path().join(STOCK_DIR).join(ITEMS_FILE)).unwrap();
        assert!(text.contains("| С0001 | Маслен филтър"), "{text}");
        assert!(read_text(&dir.path().join(STOCK_DIR).join(MOVES_FILE)).unwrap().contains("| -7 "));
    }

    #[test]
    fn editing_keeps_the_quantity_and_can_rename_the_code() {
        let dir = tempfile::tempdir().unwrap();
        let s = Stock::new(dir.path());
        s.save(item("Филтър", 4.0, 0.0), None, "2026-11-01").unwrap();
        let items = s.save(StockItem { code: "MF-1".into(), place: "Р2".into(), quantity: 999.0, ..item("Маслен филтър", 0.0, 1.0) }, Some("С0001"), "2026-11-02").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!((items[0].code.as_str(), items[0].quantity, items[0].place.as_str()), ("MF-1", 4.0, "Р2"));
        assert!(s.remove("MF-1").unwrap().is_empty());
    }

    #[test]
    fn a_file_typed_by_hand_reads() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(STOCK_DIR)).unwrap();
        std::fs::write(dir.path().join(STOCK_DIR).join(ITEMS_FILE), "| Код | Част | Марка / кат. № | Наличност |\r\n|---|---|---|---|\r\n| A1 | Свещ | NGK | 2,5 |\r\n").unwrap();
        let items = Stock::new(dir.path()).items();
        assert_eq!((items[0].code.as_str(), items[0].quantity, items[0].minimum), ("A1", 2.5, 0.0));
    }
}
