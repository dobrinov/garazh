//! The file-system database. Every client, car and repair is a folder;
//! every record is a Markdown file. The folders are the only source of truth.

use crate::md::{self, hash, parse_record, parse_table, read_text, render_record, render_table, write_atomic};
use crate::model::*;
use crate::names;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const SHOP_FILE: &str = "сервиз.md";
pub const CLIENTS_DIR: &str = "клиенти";
pub const CLIENT_FILE: &str = "клиент.md";
pub const CAR_FILE: &str = "автомобил.md";
pub const MILEAGE_FILE: &str = "пробег.md";
pub const PARTS_FILE: &str = "части.md";
pub const ORDERS_DIR: &str = "ремонти";
pub const ORDER_FILE: &str = "работна-карта.md";
pub const DOCS_DIR: &str = "документи";
pub const INDEX_DIR: &str = ".index";
pub const QUOTES_DIR: &str = "оферти-и-доклади";
pub const QUOTE_FILE: &str = "документ.md";
pub const REFERENCE_DIR: &str = "справочници";
pub const VIN_CACHE_DIR: &str = "vin-отговори";
const LOGO_STEM: &str = "лого";
const LOGO_MAX_BYTES: u64 = 5_000_000;
const LOGO_TYPES: &[(&str, &str)] =
    &[("png", "image/png"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("svg", "image/svg+xml"), ("webp", "image/webp")];

/// Work order stages, in order. Files from any version use these words.
pub const ORDER_STATUSES: [&str; 6] = ["приета", "диагностика", "чака_части", "в_ремонт", "готова", "предадена"];
const MILEAGE_HEADER: [&str; 3] = ["Дата", "Км", "Източник"];
const PARTS_HEADER: [&str; 7] = ["Дата", "Км", "Част", "Марка / кат. №", "К-во", "Цена", "РК"];

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Не е избрана папка с данни")]
    NoDataDir,
    #[error("Не е намерен запис: {0}")]
    NotFound(String),
    #[error("Файлът е променен извън програмата: {0}")]
    Conflict(String),
    #[error("Невалиден файл {path}: {message}")]
    Parse { path: String, message: String },
    #[error("{0}")]
    Invalid(String),
    #[error("Грешка при достъп до диска: {0}")]
    Io(#[from] std::io::Error),
}

impl StoreError {
    pub fn code(&self) -> &'static str {
        match self {
            StoreError::NoDataDir => "no_data_dir",
            StoreError::NotFound(_) => "not_found",
            StoreError::Conflict(_) => "conflict",
            StoreError::Parse { .. } => "parse",
            StoreError::Invalid(_) => "invalid",
            StoreError::Io(_) => "io",
        }
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// A record as loaded from disk, with where it lives and a hash of the
/// file text so a later save can detect edits made outside the app.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Loaded<T> {
    pub data: T,
    pub notes: String,
    pub dir: String,
    pub hash: String,
}

/// What the UI sends back to save a record.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SaveInput<T> {
    pub data: T,
    pub notes: String,
    /// Hash from when the record was opened; None for new records.
    pub baseHash: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    pub path: String,
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: Option<String>,
}

/// Everything in the data folder, read in one pass.
#[derive(Default, Debug)]
pub struct Scan {
    pub clients: Vec<Loaded<Client>>,
    pub cars: Vec<(Loaded<Car>, Vec<Reading>)>,
    pub orders: Vec<Loaded<WorkOrder>>,
    pub quotes: Vec<Loaded<Quote>>,
    pub problems: Vec<Problem>,
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn new_id(prefix: &str) -> String {
    let u = uuid::Uuid::new_v4().simple().to_string();
    format!("{prefix}-{}", &u[..10])
}

fn path_str(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

fn load<T: serde::de::DeserializeOwned + Default>(file: &Path) -> std::result::Result<(T, String, String), String> {
    let text = read_text(file).map_err(|e| e.to_string())?;
    let (data, notes) = parse_record::<T>(&text)?;
    Ok((data, notes, hash(&text)))
}

fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(dir)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default();
    v.sort();
    v
}

/// Pick a folder name next to `parent` that does not exist yet (or is `current`).
fn unique_dir(parent: &Path, name: &str, current: Option<&Path>) -> PathBuf {
    let mut candidate = parent.join(name);
    let mut n = 2;
    while candidate.exists() && Some(candidate.as_path()) != current {
        candidate = parent.join(format!("{name} ({n})"));
        n += 1;
    }
    candidate
}

pub struct Store {
    pub root: PathBuf,
}

impl Store {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Store { root: root.into() }
    }

    fn clients_dir(&self) -> PathBuf {
        self.root.join(CLIENTS_DIR)
    }

    /// Create the folder layout in an empty or existing folder. Never overwrites.
    pub fn init(&self) -> Result<()> {
        fs::create_dir_all(self.clients_dir())?;
        fs::create_dir_all(self.root.join(INDEX_DIR))?;
        // Starter reference data goes in only when its folder has no files yet,
        // so files the owner deleted on purpose do not come back.
        for (dir, files) in [(self.schedules_dir(), crate::schedule::STARTER), (self.links_dir(), crate::links::STARTER), (self.jobs_dir(), crate::jobs::STARTER)] {
            let empty = fs::read_dir(&dir).map(|mut rd| rd.next().is_none()).unwrap_or(true);
            if empty {
                self.install_starter(&dir, files, false)?;
            }
        }
        let shop = self.root.join(SHOP_FILE);
        if !shop.exists() {
            let text = render_record(&Shop::default(), "# Настройки на сервиза\n\nТози файл пази данните за сервиза и броячите на номерата.")
                .map_err(StoreError::Invalid)?;
            write_atomic(&shop, &text)?;
        }
        let readme = self.root.join("ПРОЧЕТИ.txt");
        if !readme.exists() {
            write_atomic(&readme, README)?;
        }
        Ok(())
    }

    pub fn schedules_dir(&self) -> PathBuf {
        self.root.join(REFERENCE_DIR).join(crate::schedule::SCHEDULES_DIR)
    }
    pub fn links_dir(&self) -> PathBuf {
        self.root.join(REFERENCE_DIR).join(crate::links::LINKS_DIR)
    }
    pub fn jobs_dir(&self) -> PathBuf {
        self.root.join(REFERENCE_DIR).join(crate::jobs::JOBS_DIR)
    }
    pub fn vin_cache_dir(&self) -> PathBuf {
        self.root.join(REFERENCE_DIR).join(VIN_CACHE_DIR)
    }

    /// Write the shipped starter files into `dir`. Existing files are kept
    /// unless `overwrite`. Returns how many files were written.
    pub fn install_starter(&self, dir: &Path, files: &[(&str, &str)], overwrite: bool) -> Result<usize> {
        fs::create_dir_all(dir)?;
        let mut n = 0;
        for (name, text) in files {
            let p = dir.join(name);
            if overwrite || !p.exists() {
                write_atomic(&p, text)?;
                n += 1;
            }
        }
        Ok(n)
    }

    // ---------- shop ----------

    pub fn shop(&self) -> Result<Loaded<Shop>> {
        let file = self.root.join(SHOP_FILE);
        if !file.exists() {
            return Err(StoreError::NoDataDir);
        }
        let (data, notes, h) = load::<Shop>(&file).map_err(|m| StoreError::Parse { path: path_str(&file), message: m })?;
        Ok(Loaded { data, notes, dir: path_str(&self.root), hash: h })
    }

    pub fn save_shop(&self, input: SaveInput<Shop>) -> Result<Loaded<Shop>> {
        let current = self.shop()?;
        let mut data = input.data;
        // Counters are owned by the app; never let the UI roll them back.
        data.counters.client = data.counters.client.max(current.data.counters.client);
        data.counters.workOrder = data.counters.workOrder.max(current.data.counters.workOrder);
        data.counters.quote = data.counters.quote.max(current.data.counters.quote);
        data.counters.report = data.counters.report.max(current.data.counters.report);
        self.write_record(&self.root.join(SHOP_FILE), &data, &input.notes, input.baseHash.as_deref())?;
        self.shop()
    }

    fn next_counter(&self, which: fn(&mut Counters) -> &mut u32) -> Result<u32> {
        let mut shop = self.shop()?;
        let n = {
            let c = which(&mut shop.data.counters);
            *c += 1;
            *c
        };
        self.write_record(&self.root.join(SHOP_FILE), &shop.data, &shop.notes, None)?;
        Ok(n)
    }

    // ---------- generic ----------

    fn write_record<T: Serialize>(&self, file: &Path, data: &T, notes: &str, base_hash: Option<&str>) -> Result<()> {
        if let Some(base) = base_hash {
            if file.exists() {
                let now = hash(&read_text(file)?);
                if now != base {
                    return Err(StoreError::Conflict(path_str(file)));
                }
            }
        }
        let text = render_record(data, notes).map_err(StoreError::Invalid)?;
        write_atomic(file, &text)?;
        Ok(())
    }

    fn reload<T: serde::de::DeserializeOwned + Default>(&self, dir: &Path, file_name: &str) -> Result<Loaded<T>> {
        let file = dir.join(file_name);
        let (data, notes, h) = load::<T>(&file).map_err(|m| StoreError::Parse { path: path_str(&file), message: m })?;
        Ok(Loaded { data, notes, dir: path_str(dir), hash: h })
    }

    // ---------- scan ----------

    pub fn scan(&self) -> Result<Scan> {
        if !self.root.join(SHOP_FILE).exists() {
            return Err(StoreError::NoDataDir);
        }
        let mut s = Scan::default();
        for cdir in subdirs(&self.clients_dir()) {
            let cfile = cdir.join(CLIENT_FILE);
            if !cfile.exists() {
                continue;
            }
            let client = match load::<Client>(&cfile) {
                Ok((mut data, notes, h)) => {
                    if data.id.is_empty() {
                        // A folder made by hand: derive a stable id from its name.
                        data.id = format!("c-{}", &hash(&path_str(&cdir))[..10]);
                    }
                    Loaded { data, notes, dir: path_str(&cdir), hash: h }
                }
                Err(m) => {
                    s.problems.push(Problem { path: path_str(&cfile), message: m });
                    continue;
                }
            };
            for kdir in subdirs(&cdir) {
                let kfile = kdir.join(CAR_FILE);
                if !kfile.exists() {
                    continue;
                }
                let (mut car, notes, h) = match load::<Car>(&kfile) {
                    Ok(x) => x,
                    Err(m) => {
                        s.problems.push(Problem { path: path_str(&kfile), message: m });
                        continue;
                    }
                };
                if car.id.is_empty() {
                    car.id = format!("k-{}", &hash(&path_str(&kdir))[..10]);
                }
                car.clientId = client.data.id.clone();
                let readings = read_readings(&kdir);
                for odir in subdirs(&kdir.join(ORDERS_DIR)) {
                    let ofile = odir.join(ORDER_FILE);
                    if !ofile.exists() {
                        continue;
                    }
                    match load::<WorkOrder>(&ofile) {
                        Ok((mut wo, notes, h)) => {
                            if wo.id.is_empty() {
                                wo.id = format!("r-{}", &hash(&path_str(&odir))[..10]);
                            }
                            wo.carId = car.id.clone();
                            wo.clientId = client.data.id.clone();
                            s.orders.push(Loaded { data: wo, notes, dir: path_str(&odir), hash: h });
                        }
                        Err(m) => s.problems.push(Problem { path: path_str(&ofile), message: m }),
                    }
                }
                for qdir in subdirs(&kdir.join(QUOTES_DIR)) {
                    let qfile = qdir.join(QUOTE_FILE);
                    if !qfile.exists() {
                        continue;
                    }
                    match load::<Quote>(&qfile) {
                        Ok((mut q, notes, h)) => {
                            if q.id.is_empty() {
                                q.id = format!("q-{}", &hash(&path_str(&qdir))[..10]);
                            }
                            q.carId = car.id.clone();
                            q.clientId = client.data.id.clone();
                            s.quotes.push(Loaded { data: q, notes, dir: path_str(&qdir), hash: h });
                        }
                        Err(m) => s.problems.push(Problem { path: path_str(&qfile), message: m }),
                    }
                }
                s.cars.push((Loaded { data: car, notes, dir: path_str(&kdir), hash: h }, readings));
            }
            s.clients.push(client);
        }
        Ok(s)
    }

    fn find_client(&self, scan: &Scan, id: &str) -> Result<Loaded<Client>> {
        scan.clients.iter().find(|c| c.data.id == id).cloned().ok_or_else(|| StoreError::NotFound(id.into()))
    }
    fn find_car(&self, scan: &Scan, id: &str) -> Result<Loaded<Car>> {
        scan.cars.iter().find(|c| c.0.data.id == id).map(|c| c.0.clone()).ok_or_else(|| StoreError::NotFound(id.into()))
    }
    fn find_order(&self, scan: &Scan, id: &str) -> Result<Loaded<WorkOrder>> {
        scan.orders.iter().find(|o| o.data.id == id).cloned().ok_or_else(|| StoreError::NotFound(id.into()))
    }

    fn find_quote(&self, scan: &Scan, id: &str) -> Result<Loaded<Quote>> {
        scan.quotes.iter().find(|q| q.data.id == id).cloned().ok_or_else(|| StoreError::NotFound(id.into()))
    }
    pub fn quote(&self, id: &str) -> Result<Loaded<Quote>> {
        let scan = self.scan()?;
        self.find_quote(&scan, id)
    }

    pub fn client(&self, id: &str) -> Result<Loaded<Client>> {
        let scan = self.scan()?;
        self.find_client(&scan, id)
    }
    pub fn car(&self, id: &str) -> Result<Loaded<Car>> {
        let scan = self.scan()?;
        self.find_car(&scan, id)
    }
    pub fn order(&self, id: &str) -> Result<Loaded<WorkOrder>> {
        let scan = self.scan()?;
        self.find_order(&scan, id)
    }

    // ---------- clients ----------

    pub fn save_client(&self, input: SaveInput<Client>) -> Result<Loaded<Client>> {
        let mut data = input.data;
        if data.name.trim().is_empty() {
            return Err(StoreError::Invalid("Името на клиента е задължително".into()));
        }
        data.name = data.name.trim().to_string();
        if data.kind.is_empty() {
            data.kind = "частно".into();
        }
        let dir = if data.id.is_empty() {
            data.id = new_id("c");
            data.number = self.next_counter(|c| &mut c.client)?;
            data.created = today();
            let dir = unique_dir(&self.clients_dir(), &names::client_folder(data.number, &data.name), None);
            fs::create_dir_all(&dir)?;
            dir
        } else {
            let scan = self.scan()?;
            let current = self.find_client(&scan, &data.id)?;
            let cur_dir = PathBuf::from(&current.dir);
            if let Some(base) = input.baseHash.as_deref() {
                if base != current.hash {
                    return Err(StoreError::Conflict(path_str(&cur_dir.join(CLIENT_FILE))));
                }
            }
            let want = unique_dir(&self.clients_dir(), &names::client_folder(data.number, &data.name), Some(&cur_dir));
            if want != cur_dir {
                fs::rename(&cur_dir, &want)?;
            }
            want
        };
        self.write_record(&dir.join(CLIENT_FILE), &data, &input.notes, None)?;
        self.reload(&dir, CLIENT_FILE)
    }

    // ---------- cars ----------

    pub fn save_car(&self, input: SaveInput<Car>) -> Result<Loaded<Car>> {
        let mut data = input.data;
        data.plate = data.plate.trim().to_uppercase();
        data.vin = data.vin.trim().to_uppercase();
        let scan = self.scan()?;
        let owner = self.find_client(&scan, &data.clientId)?;
        let owner_dir = PathBuf::from(&owner.dir);
        let name = names::car_folder(&data.plate, &data.make, &data.model);
        let dir = if data.id.is_empty() {
            data.id = new_id("k");
            let dir = unique_dir(&owner_dir, &name, None);
            fs::create_dir_all(&dir)?;
            dir
        } else {
            let current = self.find_car(&scan, &data.id)?;
            let cur_dir = PathBuf::from(&current.dir);
            if let Some(base) = input.baseHash.as_deref() {
                if base != current.hash {
                    return Err(StoreError::Conflict(path_str(&cur_dir.join(CAR_FILE))));
                }
            }
            if current.data.clientId != data.clientId {
                // Owner change: the whole car folder, history included, moves.
                let old_owner = self.find_client(&scan, &current.data.clientId)?;
                let label = format!("{} (до {})", old_owner.data.name, today());
                if !data.pastOwners.contains(&label) {
                    data.pastOwners.push(label);
                }
            }
            let want = unique_dir(&owner_dir, &name, Some(&cur_dir));
            if want != cur_dir {
                fs::rename(&cur_dir, &want)?;
            }
            want
        };
        self.write_record(&dir.join(CAR_FILE), &data, &input.notes, None)?;
        self.reload(&dir, CAR_FILE)
    }

    #[cfg(test)]
    pub fn readings(&self, car_dir: &Path) -> Vec<Reading> {
        read_readings(car_dir)
    }

    pub fn add_reading(&self, car_id: &str, reading: Reading) -> Result<()> {
        if chrono::NaiveDate::parse_from_str(&reading.date, "%Y-%m-%d").is_err() {
            return Err(StoreError::Invalid("Датата трябва да е във формат ГГГГ-ММ-ДД".into()));
        }
        let car = self.car(car_id)?;
        let dir = PathBuf::from(&car.dir);
        let file = dir.join(MILEAGE_FILE);
        let body = if file.exists() { read_text(&file)? } else { String::new() };
        let table = parse_table(&body);
        let mut rs = read_readings(&dir);
        rs.push(reading);
        rs.sort_by(|a, b| a.date.cmp(&b.date).then(a.km.cmp(&b.km)));
        let rows: Vec<Vec<String>> = rs.iter().map(|r| vec![r.date.clone(), r.km.to_string(), r.source.clone()]).collect();
        let prefix = if table.prefix.trim().is_empty() { "# Пробег".to_string() } else { table.prefix };
        write_atomic(&file, &render_table(&prefix, &MILEAGE_HEADER, &rows, &table.suffix))?;
        Ok(())
    }

    pub fn parts(&self, car_dir: &Path) -> Vec<PartRow> {
        let file = car_dir.join(PARTS_FILE);
        let Ok(body) = read_text(&file) else { return vec![] };
        parse_table(&body)
            .rows
            .into_iter()
            .map(|r| {
                let g = |i: usize| r.get(i).cloned().unwrap_or_default();
                PartRow {
                    date: g(0),
                    km: parse_km(&g(1)),
                    part: g(2),
                    brand: g(3),
                    quantity: g(4),
                    price: g(5),
                    order: g(6),
                }
            })
            .collect()
    }

    pub fn add_parts(&self, car_id: &str, new_rows: Vec<PartRow>) -> Result<()> {
        let car = self.car(car_id)?;
        self.append_parts(Path::new(&car.dir), new_rows)
    }

    fn append_parts(&self, car_dir: &Path, new_rows: Vec<PartRow>) -> Result<()> {
        let file = car_dir.join(PARTS_FILE);
        let body = if file.exists() { read_text(&file)? } else { String::new() };
        let table = parse_table(&body);
        let mut all = self.parts(car_dir);
        all.extend(new_rows);
        // Newest first, so the latest change is at the top in Notepad.
        all.sort_by(|a, b| b.date.cmp(&a.date));
        let rows: Vec<Vec<String>> = all
            .iter()
            .map(|p| {
                vec![
                    p.date.clone(),
                    p.km.map(|k| k.to_string()).unwrap_or_default(),
                    p.part.clone(),
                    p.brand.clone(),
                    p.quantity.clone(),
                    p.price.clone(),
                    p.order.clone(),
                ]
            })
            .collect();
        let prefix = if table.prefix.trim().is_empty() { "# Сменени части и консумативи".to_string() } else { table.prefix };
        write_atomic(&file, &render_table(&prefix, &PARTS_HEADER, &rows, &table.suffix))?;
        Ok(())
    }

    // ---------- work orders ----------

    pub fn save_order(&self, input: SaveInput<WorkOrder>) -> Result<Loaded<WorkOrder>> {
        let mut data = input.data;
        let scan = self.scan()?;
        let car = self.find_car(&scan, &data.carId)?;
        data.clientId = car.data.clientId.clone();
        let car_dir = PathBuf::from(&car.dir);
        let orders_dir = car_dir.join(ORDERS_DIR);
        if data.date.is_empty() {
            data.date = today();
        }
        if data.status.is_empty() {
            data.status = "приета".into();
        }
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
        let dir = if data.id.is_empty() {
            data.record_stage(None, &now);
            data.id = new_id("r");
            let n = self.next_counter(|c| &mut c.workOrder)?;
            data.number = format!("РК-{}-{:04}", &data.date[..4.min(data.date.len())], n);
            if data.vatPercent == 0 {
                let shop = self.shop()?;
                if shop.data.vatRegistered {
                    data.vatPercent = shop.data.vatPercent;
                }
            }
            let dir = unique_dir(&orders_dir, &names::order_folder(&data.date, &data.number, &data.title), None);
            fs::create_dir_all(&dir)?;
            dir
        } else {
            let current = self.find_order(&scan, &data.id)?;
            let cur_dir = PathBuf::from(&current.dir);
            if let Some(base) = input.baseHash.as_deref() {
                if base != current.hash {
                    return Err(StoreError::Conflict(path_str(&cur_dir.join(ORDER_FILE))));
                }
            }
            // Keep what only the app may set.
            data.number = current.data.number.clone();
            data.historyWritten = current.data.historyWritten;
            data.record_stage(Some(&current.data), &now);
            let want = unique_dir(&orders_dir, &names::order_folder(&data.date, &data.number, &data.title), Some(&cur_dir));
            if want != cur_dir {
                fs::rename(&cur_dir, &want)?;
            }
            want
        };
        self.write_record(&dir.join(ORDER_FILE), &data, &input.notes, None)?;
        self.reload(&dir, ORDER_FILE)
    }

    /// Change only the stage of a work order. Only the status line of the
    /// file changes; everything else, including fields written by other
    /// versions or by hand, is kept.
    pub fn set_order_status(&self, id: &str, status: &str) -> Result<Loaded<WorkOrder>> {
        if !ORDER_STATUSES.contains(&status) {
            return Err(StoreError::Invalid(format!("Непознат етап: {status}")));
        }
        let scan = self.scan()?;
        let mut order = self.find_order(&scan, id)?;
        if order.data.status == status {
            return Ok(order);
        }
        let before = order.data.clone();
        order.data.status = status.to_string();
        order.data.record_stage(Some(&before), &chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
        let dir = PathBuf::from(&order.dir);
        self.write_record(&dir.join(ORDER_FILE), &order.data, &order.notes, Some(&order.hash))?;
        self.reload(&dir, ORDER_FILE)
    }

    /// Write the order's parts and mileage into the car's history, once.
    pub fn close_order(&self, id: &str) -> Result<Loaded<WorkOrder>> {
        let scan = self.scan()?;
        let mut order = self.find_order(&scan, id)?;
        let car = self.find_car(&scan, &order.data.carId)?;
        let car_dir = PathBuf::from(&car.dir);
        let closed_on = order.data.closedOn.clone().unwrap_or_else(today);
        // Parts are recorded on the repair date, with the mileage taken at intake.
        let fitted_on = if order.data.date.is_empty() { closed_on.clone() } else { order.data.date.clone() };
        if !order.data.historyWritten {
            let rows: Vec<PartRow> = order
                .data
                .parts
                .iter()
                .filter(|p| !p.part.trim().is_empty())
                .map(|p| PartRow {
                    date: fitted_on.clone(),
                    km: order.data.mileage,
                    part: p.part.clone(),
                    brand: p.partNumber.clone(),
                    quantity: format!("{} {}", fmt_qty(p.quantity), p.unit).trim().to_string(),
                    price: p.price.times(p.quantity).format(),
                    order: order.data.number.clone(),
                })
                .collect();
            if !rows.is_empty() {
                self.append_parts(&car_dir, rows)?;
            }
            if let Some(km) = order.data.mileage {
                let already = read_readings(&car_dir).iter().any(|r| r.source == order.data.number);
                if !already {
                    self.add_reading(&car.data.id, Reading { date: fitted_on.clone(), km, source: order.data.number.clone() })?;
                }
            }
            order.data.historyWritten = true;
        }
        order.data.closedOn = Some(closed_on);
        if order.data.status != STATUS_DELIVERED {
            let before = order.data.clone();
            order.data.status = "готова".into();
            order.data.record_stage(Some(&before), &chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
        }
        let dir = PathBuf::from(&order.dir);
        self.write_record(&dir.join(ORDER_FILE), &order.data, &order.notes, None)?;
        self.reload(&dir, ORDER_FILE)
    }

    /// Take the stock-picked parts of a closed work order off the shelf, once.
    /// Returns codes that were no longer in stock.
    pub fn take_stock(&self, id: &str) -> Result<Vec<String>> {
        let scan = self.scan()?;
        let mut order = self.find_order(&scan, id)?;
        if order.data.stockTaken || order.data.closedOn.is_none() {
            return Ok(vec![]);
        }
        let used: Vec<(String, f64)> = order
            .data
            .parts
            .iter()
            .filter(|p| !p.stockCode.trim().is_empty() && p.quantity > 0.0)
            .map(|p| (p.stockCode.trim().to_string(), p.quantity))
            .collect();
        let date = order.data.closedOn.clone().unwrap_or_else(today);
        let missing = crate::stock::Stock::new(&self.root).take(&used, &order.data.number, &date)?;
        order.data.stockTaken = true;
        let dir = PathBuf::from(&order.dir);
        self.write_record(&dir.join(ORDER_FILE), &order.data, &order.notes, None)?;
        Ok(missing)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    // ---------- shop logo ----------

    /// Copy an image into the data folder as the shop's logo, replacing the old one.
    pub fn set_logo_file(&self, src: &Path) -> Result<Loaded<Shop>> {
        let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !LOGO_TYPES.iter().any(|(e, _)| *e == ext) {
            return Err(StoreError::Invalid("Логото трябва да е PNG, JPG, SVG или WEBP".into()));
        }
        let size = fs::metadata(src)?.len();
        if size > LOGO_MAX_BYTES {
            return Err(StoreError::Invalid(format!("Файлът е твърде голям ({} MB); до 5 MB", size / 1_000_000)));
        }
        let bytes = fs::read(src)?;
        self.write_logo(&ext, &bytes)
    }

    /// Use one of the built-in logos (an SVG drawn by the app).
    pub fn set_logo_svg(&self, svg: &str) -> Result<Loaded<Shop>> {
        let t = svg.trim();
        if !t.starts_with("<svg") || t.len() > 100_000 || t.contains("<script") {
            return Err(StoreError::Invalid("Невалидно лого".into()));
        }
        self.write_logo("svg", t.as_bytes())
    }

    pub fn clear_logo(&self) -> Result<Loaded<Shop>> {
        let mut shop = self.shop()?;
        self.remove_logo_files()?;
        shop.data.logo.clear();
        self.write_record(&self.root.join(SHOP_FILE), &shop.data, &shop.notes, None)?;
        self.shop()
    }

    fn remove_logo_files(&self) -> Result<()> {
        for (ext, _) in LOGO_TYPES {
            let p = self.root.join(format!("{LOGO_STEM}.{ext}"));
            if p.exists() {
                fs::remove_file(p)?;
            }
        }
        Ok(())
    }

    fn write_logo(&self, ext: &str, bytes: &[u8]) -> Result<Loaded<Shop>> {
        let mut shop = self.shop()?;
        self.remove_logo_files()?;
        let name = format!("{LOGO_STEM}.{ext}");
        let tmp = self.root.join(format!(".{name}.tmp"));
        fs::write(&tmp, bytes)?;
        fs::rename(&tmp, self.root.join(&name))?;
        shop.data.logo = name;
        self.write_record(&self.root.join(SHOP_FILE), &shop.data, &shop.notes, None)?;
        self.shop()
    }

    /// The logo as a data: URL the window can show; None when there is none
    /// or the file was deleted by hand.
    pub fn logo_data_url(&self) -> Result<Option<String>> {
        use base64::Engine;
        let shop = self.shop()?;
        if shop.data.logo.is_empty() {
            return Ok(None);
        }
        let p = self.root.join(&shop.data.logo);
        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let Some((_, mime)) = LOGO_TYPES.iter().find(|(e, _)| *e == ext) else { return Ok(None) };
        let Ok(bytes) = fs::read(&p) else { return Ok(None) };
        Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
    }

    // ---------- quotes and reports ----------

    pub fn save_quote(&self, input: SaveInput<Quote>) -> Result<Loaded<Quote>> {
        let mut data = input.data;
        if ![QUOTE, REPAIR_REPORT, DIAGNOSTIC_REPORT].contains(&data.kind.as_str()) {
            return Err(StoreError::Invalid(format!("Непознат вид документ: {}", data.kind)));
        }
        let scan = self.scan()?;
        let car = self.find_car(&scan, &data.carId)?;
        data.clientId = car.data.clientId.clone();
        let parent = PathBuf::from(&car.dir).join(QUOTES_DIR);
        if data.date.is_empty() {
            data.date = today();
        }
        if data.status.is_empty() {
            data.status = "чернова".into();
        }
        let dir = if data.id.is_empty() {
            data.id = new_id("q");
            let (prefix, n) = if data.kind == QUOTE {
                ("ОФ", self.next_counter(|c| &mut c.quote)?)
            } else {
                ("ДК", self.next_counter(|c| &mut c.report)?)
            };
            data.number = format!("{prefix}-{}-{:04}", &data.date[..4.min(data.date.len())], n);
            if data.vatPercent == 0 && data.kind == QUOTE {
                let shop = self.shop()?;
                if shop.data.vatRegistered {
                    data.vatPercent = shop.data.vatPercent;
                }
            }
            let dir = unique_dir(&parent, &names::order_folder(&data.date, &data.number, &data.title), None);
            fs::create_dir_all(&dir)?;
            dir
        } else {
            let current = self.find_quote(&scan, &data.id)?;
            let cur_dir = PathBuf::from(&current.dir);
            if let Some(base) = input.baseHash.as_deref() {
                if base != current.hash {
                    return Err(StoreError::Conflict(path_str(&cur_dir.join(QUOTE_FILE))));
                }
            }
            data.number = current.data.number.clone();
            data.kind = current.data.kind.clone();
            let want = unique_dir(&parent, &names::order_folder(&data.date, &data.number, &data.title), Some(&cur_dir));
            if want != cur_dir {
                fs::rename(&cur_dir, &want)?;
            }
            want
        };
        self.write_record(&dir.join(QUOTE_FILE), &data, &input.notes, None)?;
        self.reload(&dir, QUOTE_FILE)
    }

    /// The customer accepted a quote: open a work order with its lines and
    /// link the two. Accepting twice returns the same work order.
    pub fn accept_quote(&self, id: &str) -> Result<Loaded<WorkOrder>> {
        let scan = self.scan()?;
        let mut q = self.find_quote(&scan, id)?;
        if q.data.kind != QUOTE {
            return Err(StoreError::Invalid("Само оферта може да се приеме".into()));
        }
        if !q.data.orderId.is_empty() {
            if let Ok(o) = self.find_order(&scan, &q.data.orderId) {
                return Ok(o);
            }
        }
        let order = self.save_order(SaveInput {
            data: WorkOrder {
                carId: q.data.carId.clone(),
                title: q.data.title.clone(),
                complaint: format!("По оферта {}", q.data.number),
                labor: q.data.labor.clone(),
                parts: q.data.parts.clone(),
                discountPercent: q.data.discountPercent,
                vatPercent: q.data.vatPercent,
                ..Default::default()
            },
            ..Default::default()
        })?;
        q.data.status = "приета".into();
        q.data.orderId = order.data.id.clone();
        let dir = PathBuf::from(&q.dir);
        self.write_record(&dir.join(QUOTE_FILE), &q.data, &q.notes, None)?;
        Ok(order)
    }

    // ---------- documents ----------

    pub fn car_docs_dir(&self, car_id: &str) -> Result<PathBuf> {
        Ok(PathBuf::from(self.car(car_id)?.dir).join(DOCS_DIR))
    }

    pub fn order_dir(&self, order_id: &str) -> Result<PathBuf> {
        Ok(PathBuf::from(self.order(order_id)?.dir))
    }

    /// Copy files into `dir`, keeping their original bytes and names.
    pub fn attach(&self, dir: &Path, sources: &[String]) -> Result<Vec<FileInfo>> {
        fs::create_dir_all(dir)?;
        let mut out = Vec::new();
        for src in sources {
            let src = Path::new(src);
            if !src.is_file() {
                return Err(StoreError::Invalid(format!("Не е файл: {}", src.display())));
            }
            let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "файл".into());
            let (stem, ext) = match name.rsplit_once('.') {
                Some((s, e)) => (s.to_string(), format!(".{e}")),
                None => (name.clone(), String::new()),
            };
            let mut target = dir.join(&name);
            let mut n = 2;
            while target.exists() {
                target = dir.join(format!("{stem} ({n}){ext}"));
                n += 1;
            }
            fs::copy(src, &target)?;
            out.push(file_info(&target));
        }
        Ok(out)
    }

    /// Uploaded files in a folder and its sub-folders (one level), records excluded.
    pub fn list_files(&self, dir: &Path) -> Vec<FileInfo> {
        let mut out = Vec::new();
        let mut visit = |d: &Path| {
            if let Ok(rd) = fs::read_dir(d) {
                for e in rd.flatten() {
                    let p = e.path();
                    let name = e.file_name().to_string_lossy().to_string();
                    if p.is_file() && !name.ends_with(".md") && !name.starts_with('.') {
                        out.push(file_info(&p));
                    }
                }
            }
        };
        visit(dir);
        for sub in subdirs(dir) {
            if sub.join(ORDER_FILE).exists() || sub.join(CAR_FILE).exists() {
                continue;
            }
            visit(&sub);
        }
        out.sort_by(|a, b| b.modified.cmp(&a.modified));
        out
    }
}

fn file_info(p: &Path) -> FileInfo {
    let meta = fs::metadata(p).ok();
    FileInfo {
        name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        path: path_str(p),
        size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
        modified: meta
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%d %H:%M").to_string()),
    }
}

fn parse_km(s: &str) -> Option<u64> {
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

fn fmt_qty(q: f64) -> String {
    if (q - q.round()).abs() < 1e-9 {
        format!("{}", q.round() as i64)
    } else {
        format!("{q}")
    }
}

fn read_readings(car_dir: &Path) -> Vec<Reading> {
    let Ok(body) = read_text(&car_dir.join(MILEAGE_FILE)) else { return vec![] };
    md::parse_table(&body)
        .rows
        .into_iter()
        .filter_map(|r| {
            let km = parse_km(r.get(1)?)?;
            Some(Reading { date: r.first()?.clone(), km, source: r.get(2).cloned().unwrap_or_default() })
        })
        .collect()
}

const README: &str = "Данни на програмата Гараж\r\n\
\r\n\
Всичко тук е обикновени папки и текстови файлове. Можете да ги отваряте с\r\n\
Notepad и Excel и да копирате документи директно в папките.\r\n\
\r\n\
клиенти\\<номер> <име>\\клиент.md            данни за клиента\r\n\
клиенти\\...\\<рег. номер> <марка модел>\\      папка на автомобила\r\n\
    автомобил.md   данни за колата (VIN, двигател, срокове)\r\n\
    пробег.md      отчитания на километража\r\n\
    части.md       сменени части и консумативи\r\n\
    ремонти\\       по една папка за всеки ремонт с работната карта и файловете\r\n\
    документи\\     талон, ГТП и други документи\r\n\
    оферти-и-доклади\\  оферти, доклади за ремонт и диагностика\r\n\
    график-поддръжка.md  обслужвания, отбелязани ръчно\r\n\
    обаждания.md   обаждания до клиента за срокове и обслужване\r\n\
справочници\\графици\\   графици за поддръжка по двигател и кутия (редактируеми)\r\n\
справочници\\марки\\     полезни връзки по марка (редактируеми)\r\n\
справочници\\работи\\    обичайни работи: етап и редове за нова работна карта (редактируеми)\r\n\
справочници\\vin-отговори\\  запазени отговори от онлайн проверка на VIN\r\n\
сервиз.md                                  данни за сервиза и броячи\r\n\
очаквани.md                                коли, за които клиентът се е обадил\r\n\
.index\\                                    временни файлове, може да се изтрие\r\n\
\r\n\
Не променяйте реда между --- в началото на файловете, освен ако не сте сигурни.\r\n";

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path().join("Данни"));
        s.init().unwrap();
        (dir, s)
    }

    fn new_client(s: &Store, name: &str) -> Loaded<Client> {
        s.save_client(SaveInput { data: Client { name: name.into(), ..Default::default() }, ..Default::default() }).unwrap()
    }

    fn new_car(s: &Store, client_id: &str, plate: &str) -> Loaded<Car> {
        s.save_car(SaveInput {
            data: Car { clientId: client_id.into(), plate: plate.into(), make: "Volkswagen".into(), model: "Golf VII".into(), ..Default::default() },
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn init_creates_layout_and_is_idempotent() {
        let (_t, s) = store();
        assert!(s.root.join(SHOP_FILE).exists());
        assert!(s.root.join(CLIENTS_DIR).is_dir());
        s.init().unwrap();
        assert_eq!(s.shop().unwrap().data.vatPercent, 20);
    }

    #[test]
    fn clients_get_numbered_folders_and_rename_on_change() {
        let (_t, s) = store();
        let a = new_client(&s, "Иван Петров");
        let b = new_client(&s, "Мария Иванова");
        assert_eq!(a.data.number, 1);
        assert_eq!(b.data.number, 2);
        assert!(a.dir.ends_with("0001 Иван Петров"));
        let mut edit = a.data.clone();
        edit.name = "Иван Петров Иванов".into();
        let saved = s.save_client(SaveInput { data: edit, notes: "бележка".into(), baseHash: Some(a.hash.clone()) }).unwrap();
        assert!(saved.dir.ends_with("0001 Иван Петров Иванов"));
        assert!(!Path::new(&a.dir).exists());
        assert_eq!(saved.notes, "бележка\n");
        assert_eq!(s.scan().unwrap().clients.len(), 2);
    }

    #[test]
    fn save_detects_outside_edits() {
        let (_t, s) = store();
        let a = new_client(&s, "Иван");
        let file = Path::new(&a.dir).join(CLIENT_FILE);
        let text = read_text(&file).unwrap();
        write_atomic(&file, &text.replace("Иван", "Иван (от Notepad)")).unwrap();
        let err = s.save_client(SaveInput { data: a.data.clone(), notes: String::new(), baseHash: Some(a.hash) }).unwrap_err();
        assert_eq!(err.code(), "conflict");
    }

    #[test]
    fn hand_written_fields_survive_a_save() {
        let (_t, s) = store();
        let a = new_client(&s, "Иван");
        let file = Path::new(&a.dir).join(CLIENT_FILE);
        let text = read_text(&file).unwrap().replacen("---\n", "---\nлюбим_механик: Георги\n", 1);
        write_atomic(&file, &text).unwrap();
        let fresh = s.client(&a.data.id).unwrap();
        let mut d = fresh.data.clone();
        d.phone = "0888".into();
        s.save_client(SaveInput { data: d, notes: String::new(), baseHash: Some(fresh.hash) }).unwrap();
        let after = read_text(&file).unwrap();
        assert!(after.contains("любим_механик: Георги"));
        assert!(after.contains("телефон:"));
    }

    #[test]
    fn car_lives_in_client_folder_and_moves_with_owner() {
        let (_t, s) = store();
        let a = new_client(&s, "Иван");
        let b = new_client(&s, "Мария");
        let car = new_car(&s, &a.data.id, "са 4821 кн");
        assert_eq!(car.data.plate, "СА 4821 КН");
        assert!(car.dir.starts_with(&a.dir));
        assert!(car.dir.ends_with("СА4821КН Volkswagen Golf VII"));
        let mut moved = car.data.clone();
        moved.clientId = b.data.id.clone();
        let after = s.save_car(SaveInput { data: moved, notes: String::new(), baseHash: Some(car.hash) }).unwrap();
        assert!(after.dir.starts_with(&b.dir));
        assert_eq!(after.data.pastOwners.len(), 1);
        let scan = s.scan().unwrap();
        assert_eq!(scan.cars.len(), 1);
        assert_eq!(scan.cars[0].0.data.clientId, b.data.id);
    }

    #[test]
    fn closing_an_order_writes_history_once() {
        let (_t, s) = store();
        let c = new_client(&s, "Иван");
        let car = new_car(&s, &c.data.id, "СА 4821 КН");
        let wo = s
            .save_order(SaveInput {
                data: WorkOrder {
                    carId: car.data.id.clone(),
                    date: "2026-11-16".into(),
                    title: "Обслужване".into(),
                    mileage: Some(204_120),
                    parts: vec![
                        PartLine { part: "Маслен филтър".into(), partNumber: "HU 6008/1 z".into(), quantity: 1.0, unit: "бр.".into(), price: Money(1100), ..Default::default() },
                        PartLine { part: "Масло 5W-30".into(), quantity: 4.6, unit: "л".into(), price: Money(1130), ..Default::default() },
                    ],
                    ..Default::default()
                },
                ..Default::default()
            })
            .unwrap();
        assert_eq!(wo.data.number, "РК-2026-0001");
        assert_eq!(wo.data.vatPercent, 20);
        assert!(wo.dir.ends_with("2026-11-16 РК-2026-0001 Обслужване"));
        s.close_order(&wo.data.id).unwrap();
        s.close_order(&wo.data.id).unwrap();
        let parts = s.parts(Path::new(&car.dir));
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].km, Some(204_120));
        assert_eq!(parts[0].date, "2026-11-16", "parts carry the repair date, not the day of closing");
        assert_eq!(parts.iter().find(|p| p.part.starts_with("Масло")).unwrap().quantity, "4.6 л");
        let rs = s.readings(Path::new(&car.dir));
        assert_eq!(rs.len(), 1);
        assert_eq!(rs[0].source, "РК-2026-0001");
        let closed = s.order(&wo.data.id).unwrap();
        assert!(closed.data.historyWritten);
        assert_eq!(closed.data.status, "готова");
    }

    #[test]
    fn stock_is_taken_once_when_the_order_closes() {
        let (_t, s) = store();
        let stock = crate::stock::Stock::new(&s.root);
        stock.save(crate::stock::StockItem { part: "Маслен филтър".into(), quantity: 5.0, ..Default::default() }, None, "2026-11-01").unwrap();
        let c = new_client(&s, "Иван");
        let car = new_car(&s, &c.data.id, "СА 4821 КН");
        let wo = s
            .save_order(SaveInput {
                data: WorkOrder {
                    carId: car.data.id.clone(),
                    date: "2026-11-16".into(),
                    parts: vec![
                        PartLine { part: "Маслен филтър".into(), quantity: 2.0, stockCode: "С0001".into(), ..Default::default() },
                        PartLine { part: "Чистачки".into(), quantity: 1.0, ..Default::default() },
                    ],
                    ..Default::default()
                },
                ..Default::default()
            })
            .unwrap();
        assert!(s.take_stock(&wo.data.id).unwrap().is_empty(), "not before closing");
        assert_eq!(stock.items()[0].quantity, 5.0);
        s.close_order(&wo.data.id).unwrap();
        s.take_stock(&wo.data.id).unwrap();
        s.take_stock(&wo.data.id).unwrap();
        assert_eq!(stock.items()[0].quantity, 3.0);
        let o = s.order(&wo.data.id).unwrap();
        assert!(o.data.stockTaken);
        assert_eq!(o.data.parts[0].stockCode, "С0001");
        let text = read_text(&PathBuf::from(&o.dir).join(ORDER_FILE)).unwrap();
        assert!(text.contains("склад_код: С0001") && text.contains("изписано_от_склада: true"), "{text}");
        assert_eq!(text.matches("склад_код").count(), 1, "empty codes are not written");
    }

    #[test]
    fn folders_made_by_hand_are_picked_up() {
        let (_t, s) = store();
        let cdir = s.root.join(CLIENTS_DIR).join("0099 Ръчно Добавен");
        write_atomic(&cdir.join(CLIENT_FILE), "---\nиме: Ръчно Добавен\n---\n").unwrap();
        let kdir = cdir.join("РВ1234АА Opel Astra");
        write_atomic(&kdir.join(CAR_FILE), "---\nрег_номер: РВ 1234 АА\nмарка: Opel\n---\n").unwrap();
        write_atomic(&kdir.join(MILEAGE_FILE), "| Дата | Км |\n|---|---|\n| 2026-01-10 | 100 200 |\n").unwrap();
        write_atomic(&cdir.join("Счупен").join(CAR_FILE), "---\nгодина: [не, е, число]\n---\n").unwrap();
        let scan = s.scan().unwrap();
        assert_eq!(scan.clients.len(), 1);
        assert_eq!(scan.cars.len(), 1);
        assert_eq!(scan.cars[0].1[0].km, 100_200);
        assert_eq!(scan.problems.len(), 1, "a broken file is reported, not fatal");
    }

    #[test]
    fn attachments_keep_names_and_never_overwrite() {
        let (t, s) = store();
        let src = t.path().join("Diagnostika.pdf");
        fs::write(&src, b"%PDF-1.4 test").unwrap();
        let target = s.root.join("x");
        s.attach(&target, &[path_str(&src)]).unwrap();
        let second = s.attach(&target, &[path_str(&src)]).unwrap();
        assert_eq!(second[0].name, "Diagnostika (2).pdf");
        assert_eq!(fs::read(target.join("Diagnostika.pdf")).unwrap(), b"%PDF-1.4 test");
        assert_eq!(s.list_files(&target).len(), 2);
    }

    #[test]
    fn init_installs_starter_reference_once() {
        let (_d, s) = store();
        let n = fs::read_dir(s.schedules_dir()).unwrap().count();
        assert_eq!(n, crate::schedule::STARTER.len());
        assert!(s.links_dir().join("общи.md").exists());
        fs::remove_file(s.links_dir().join("bmw.md")).unwrap();
        s.init().unwrap();
        assert!(!s.links_dir().join("bmw.md").exists(), "a deleted file does not come back");
    }

    #[test]
    fn quotes_are_numbered_and_accepting_opens_one_work_order() {
        let (_d, s) = store();
        let c = new_client(&s, "Иван");
        let k = new_car(&s, &c.data.id, "СА 1111 АА");
        let q = s
            .save_quote(SaveInput {
                data: Quote {
                    kind: QUOTE.into(),
                    carId: k.data.id.clone(),
                    date: "2026-11-15".into(),
                    title: "Съединител".into(),
                    labor: vec![LaborLine { description: "Смяна на съединител".into(), hours: 6.0, rate: Money(5000), ..Default::default() }],
                    ..Default::default()
                },
                ..Default::default()
            })
            .unwrap();
        assert_eq!(q.data.number, "ОФ-2026-0001");
        assert_eq!(q.data.status, "чернова");
        assert!(q.dir.contains(QUOTES_DIR));
        let text = read_text(&Path::new(&q.dir).join(QUOTE_FILE)).unwrap();
        assert!(text.contains("вид: оферта"));
        let r = s
            .save_quote(SaveInput { data: Quote { kind: DIAGNOSTIC_REPORT.into(), carId: k.data.id.clone(), date: "2026-11-15".into(), ..Default::default() }, ..Default::default() })
            .unwrap();
        assert_eq!(r.data.number, "ДК-2026-0001");
        let o1 = s.accept_quote(&q.data.id).unwrap();
        let o2 = s.accept_quote(&q.data.id).unwrap();
        assert_eq!(o1.data.id, o2.data.id);
        assert_eq!(o1.data.labor.len(), 1);
        let q2 = s.quote(&q.data.id).unwrap();
        assert_eq!(q2.data.status, "приета");
        assert_eq!(q2.data.orderId, o1.data.id);
        assert!(s.accept_quote(&r.data.id).is_err(), "a report cannot be accepted");
    }

    #[test]
    fn logo_is_a_file_in_the_data_folder_and_replaces_the_old_one() {
        let (d, s) = store();
        assert_eq!(s.logo_data_url().unwrap(), None);
        let png = d.path().join("моето лого.PNG");
        fs::write(&png, [0x89, b'P', b'N', b'G']).unwrap();
        let shop = s.set_logo_file(&png).unwrap();
        assert_eq!(shop.data.logo, "лого.png");
        assert!(s.root.join("лого.png").exists());
        assert!(s.logo_data_url().unwrap().unwrap().starts_with("data:image/png;base64,iVBO"));
        let shop = s.set_logo_svg("<svg viewBox='0 0 1 1'></svg>").unwrap();
        assert_eq!(shop.data.logo, "лого.svg");
        assert!(!s.root.join("лого.png").exists(), "old logo removed");
        assert!(s.set_logo_svg("<svg><script>alert(1)</script></svg>").is_err());
        let txt = d.path().join("a.txt");
        fs::write(&txt, "x").unwrap();
        assert!(s.set_logo_file(&txt).is_err());
        let shop = s.clear_logo().unwrap();
        assert_eq!(shop.data.logo, "");
        assert!(!s.root.join("лого.svg").exists());
        assert_eq!(s.logo_data_url().unwrap(), None);
    }

    /// A data folder as versions 0.2–0.3 left it: no очаквани.md or
    /// обаждания.md, files saved from Notepad (BOM, CRLF), folders made by
    /// hand without ids, a work order closed the old way (готова) and one
    /// with no stage at all. Everything new must read it and add to it
    /// without changing what was there.
    #[test]
    fn folders_from_older_versions_work_with_calls_and_stages() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Стари данни");
        let w = |rel: &str, text: &str| {
            let p = root.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, format!("\u{feff}{}", text.replace('\n', "\r\n"))).unwrap();
        };
        w(SHOP_FILE, "---\nсхема: 1\nиме: Сервиз\nброячи:\n  клиент: 1\n  работна_карта: 2\n---\n");
        w("клиенти/0001 Иван/клиент.md", "---\nиме: Иван Петров\nтелефон: 0888 123 456\n---\n");
        let car = "клиенти/0001 Иван/СА4821КН Golf";
        w(&format!("{car}/автомобил.md"), "---\nрег_номер: СА 4821 КН\nмарка: Volkswagen\nмодел: Golf\nгтп_до: 2026-11-28\n---\n");
        w(&format!("{car}/пробег.md"), "| Дата | Км | Източник |\n|---|---|---|\n| 2026-03-14 | 176900 | ръчно |\n");
        w(
            &format!("{car}/ремонти/2026-03-14 РК-2026-0001/работна-карта.md"),
            "---\nномер: РК-2026-0001\nдата: 2026-03-14\nстатус: готова\nприключена: 2026-03-14\nзаписана_в_историята: true\nмоя_бележка: пази се\n---\n",
        );
        w(&format!("{car}/ремонти/2026-11-16 РК-2026-0002/работна-карта.md"), "---\nномер: РК-2026-0002\nдата: 2026-11-16\n---\n");
        let s = Store::new(&root);

        let scan = s.scan().unwrap();
        assert!(scan.problems.is_empty(), "{:?}", scan.problems);
        assert_eq!(scan.orders.len(), 2);
        let car_id = scan.cars[0].0.data.id.clone();
        assert!(car_id.starts_with("k-"), "hand-made car folder gets a derived id");

        // Nothing expected, nobody called: the dashboard reads the old folder as is.
        assert!(crate::calls::expected(&root).is_empty());
        let dash = crate::views::dashboard(&scan, "2026-11-16");
        assert_eq!(dash.deadlines.len(), 1);
        assert_eq!(dash.deadlines[0].calledOn, None);
        assert_eq!(dash.deadlines[0].clientPhone, "0888 123 456");
        assert_eq!(dash.inShop.len(), 2, "an order closed the old way still waits for pickup");

        // A call is recorded next to the car; the scan does not mind the new file.
        let car_dir = PathBuf::from(&scan.cars[0].0.dir);
        crate::calls::set_called(&car_dir, "ГТП", "2026-11-28", true, "2026-11-16").unwrap();
        let scan = s.scan().unwrap();
        assert!(scan.problems.is_empty());
        let dash = crate::views::dashboard(&scan, "2026-11-16");
        assert_eq!(dash.deadlines[0].calledOn.as_deref(), Some("2026-11-16"));

        // An expected car matches the existing car by plate, written in Latin.
        crate::calls::save_expected(&root, crate::calls::Expected { plate: "ca4821kh".into(), complaint: "Тракане".into(), ..Default::default() }, "2026-11-16").unwrap();
        let rows = crate::views::expected_rows(&scan, crate::calls::expected(&root));
        assert_eq!(rows[0].carId.as_deref(), Some(car_id.as_str()));
        assert!(rows[0].openOrder.is_some(), "the car is already in the shop");

        // Moving the stage of an order without a stage and without an id keeps the rest of the file.
        let old = scan.orders.iter().find(|o| o.data.number == "РК-2026-0001").unwrap().clone();
        let moved = s.set_order_status(&old.data.id, "предадена").unwrap();
        assert_eq!(moved.data.status, "предадена");
        assert_eq!(moved.data.extra.get("моя_бележка").and_then(|v| v.as_str()), Some("пази се"));
        assert_eq!(moved.data.closedOn.as_deref(), Some("2026-03-14"));
        let fresh = s.scan().unwrap();
        let no_stage = fresh.orders.iter().find(|o| o.data.number == "РК-2026-0002").unwrap();
        assert_eq!(no_stage.data.status, "", "an order without a stage is shown as приета, never rewritten on read");
        s.set_order_status(&no_stage.data.id, "в_ремонт").unwrap();
        assert!(s.set_order_status(&no_stage.data.id, "измислен").is_err());
        let after = s.scan().unwrap();
        assert_eq!(after.orders.len(), 2);
        assert_eq!(after.orders.iter().find(|o| o.data.number == "РК-2026-0002").unwrap().data.id, no_stage.data.id, "ids stay stable");
        assert_eq!(read_readings(&car_dir).len(), 1, "history files are not touched");
    }

    #[test]
    fn stage_times_are_recorded_and_survive_older_versions() {
        let (_t, s) = store();
        let c = new_client(&s, "Иван");
        let car = new_car(&s, &c.data.id, "СА 1");
        let o = s.save_order(SaveInput { data: WorkOrder { carId: car.data.id.clone(), status: "в_ремонт".into(), ..Default::default() }, ..Default::default() }).unwrap();
        assert_eq!(o.data.stages.len(), 1, "a new order notes its first stage");
        assert_eq!(o.data.stages[0].status, "в_ремонт");
        // The UI cannot rewrite the marks; a save without a change adds none.
        let mut edit = o.data.clone();
        edit.stages.clear();
        edit.title = "Ново заглавие".into();
        let o = s.save_order(SaveInput { data: edit, notes: String::new(), baseHash: Some(o.hash.clone()) }).unwrap();
        assert_eq!(o.data.stages.len(), 1);
        let o = s.set_order_status(&o.data.id, "готова").unwrap();
        assert_eq!(o.data.stages.iter().map(|m| m.status.as_str()).collect::<Vec<_>>(), vec!["в_ремонт", "готова"]);
        let file = Path::new(&o.dir).join(ORDER_FILE);
        let text = read_text(&file).unwrap();
        assert!(text.contains("етапи:") && text.contains("от: "), "{text}");

        // A version before 0.4 knows nothing of "етапи": it keeps them as an unknown field.
        #[derive(Serialize, serde::Deserialize, Default)]
        #[serde(rename_all = "camelCase", default)]
        struct Old {
            status: String,
            #[serde(flatten)]
            extra: serde_json::Map<String, serde_json::Value>,
        }
        let (mut old, notes): (Old, String) = crate::md::parse_record(&text).unwrap();
        old.status = "предадена".into();
        write_atomic(&file, &crate::md::render_record(&old, &notes).unwrap()).unwrap();
        let back = s.order(&o.data.id).unwrap();
        assert_eq!(back.data.stages.len(), 2, "marks survive a save by an older version");
        assert_eq!(back.data.status, "предадена");
    }

    #[test]
    fn an_order_from_before_stage_times_gets_its_intake_day() {
        let mut before = WorkOrder { date: "2026-11-02".into(), ..Default::default() };
        let mut now = before.clone();
        now.status = "диагностика".into();
        now.record_stage(Some(&before), "2026-11-16 10:00");
        assert_eq!(now.stages, vec![StageMark { status: "приета".into(), at: "2026-11-02".into() }, StageMark { status: "диагностика".into(), at: "2026-11-16 10:00".into() }]);
        // Already in a later stage: when it got there is not known, so nothing is made up.
        before.status = "в_ремонт".into();
        let mut later = before.clone();
        later.status = "готова".into();
        later.record_stage(Some(&before), "2026-11-16 10:00");
        assert_eq!(later.stages.len(), 1);
    }
}
