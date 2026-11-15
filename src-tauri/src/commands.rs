//! Tauri commands: the only way the UI reaches the disk.
#![allow(non_snake_case)]

use crate::backup;
use crate::faultcodes::{self, FaultScan};
use crate::links::{self, Link};
use crate::schedule::{self, CarSchedule, ManualDone};
use crate::vin::{self, VinResult};
use crate::config::AppConfig;
use crate::model::*;
use crate::store::{self, FileInfo, Loaded, SaveInput, Store, StoreError};
use crate::views::{self, CarDetail, CarSummary, ClientDetail, ClientSummary, Dashboard, OrderDetail, OrderSummary};
use crate::usage;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub config_dir: PathBuf,
    pub config: Mutex<AppConfig>,
    /// Serialises writes so two clicks never take the same number.
    pub write_lock: Mutex<()>,
}

#[derive(Serialize, Debug)]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

impl From<StoreError> for ApiError {
    fn from(e: StoreError) -> Self {
        ApiError { code: e.code().into(), message: e.to_string() }
    }
}

impl From<std::io::Error> for ApiError {
    fn from(e: std::io::Error) -> Self {
        ApiError { code: "io".into(), message: e.to_string() }
    }
}

type R<T> = Result<T, ApiError>;

fn store(state: &AppState) -> R<Store> {
    let cfg = state.config.lock().unwrap();
    let dir = cfg.data_path().ok_or(StoreError::NoDataDir)?;
    Ok(Store::new(dir))
}

fn not_found(id: &str) -> ApiError {
    StoreError::NotFound(id.to_string()).into()
}

/// Feature switches kept in сервиз.md. A switch that is not written down
/// takes its default; the same defaults are in src/lib/features.ts.
pub fn feature_on(shop: &Shop, key: &str) -> bool {
    shop.features.get(key).copied().unwrap_or(!matches!(key, "vinOnline" | "stock"))
}

fn features(st: &Store) -> Shop {
    st.shop().map(|s| s.data).unwrap_or_default()
}

// ---------- app ----------

#[tauri::command]
pub fn app_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

/// Choose (and if needed create) the data folder.
#[tauri::command]
pub fn set_data_dir(state: State<AppState>, path: String) -> R<AppConfig> {
    let p = PathBuf::from(&path);
    if path.trim().is_empty() {
        return Err(StoreError::Invalid("Изберете папка".into()).into());
    }
    Store::new(&p).init()?;
    let mut cfg = state.config.lock().unwrap();
    cfg.dataDir = Some(path);
    cfg.save(&state.config_dir)?;
    Ok(cfg.clone())
}

#[tauri::command]
pub fn set_backup(state: State<AppState>, dir: Option<String>, daily: bool, keep: u32) -> R<AppConfig> {
    let mut cfg = state.config.lock().unwrap();
    cfg.backupDir = dir.filter(|d| !d.trim().is_empty());
    cfg.backupDaily = daily;
    cfg.backupKeep = keep.clamp(1, 365);
    cfg.save(&state.config_dir)?;
    Ok(cfg.clone())
}

#[tauri::command]
pub fn backup_now(state: State<AppState>) -> R<String> {
    run_backup(&state)
}

pub fn run_backup(state: &AppState) -> R<String> {
    let (data, target, keep) = {
        let cfg = state.config.lock().unwrap();
        let data = cfg.data_path().ok_or(StoreError::NoDataDir)?;
        let target = cfg
            .backupDir
            .clone()
            .ok_or_else(|| ApiError { code: "invalid".into(), message: "Изберете папка за архив в Настройки".into() })?;
        (data, PathBuf::from(target), cfg.backupKeep)
    };
    let out = backup::backup(&data, &target, keep)?;
    let mut cfg = state.config.lock().unwrap();
    cfg.lastBackup = Some(chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
    cfg.save(&state.config_dir)?;
    Ok(out.to_string_lossy().to_string())
}

/// Daily backup on start, when switched on and the last one is older than a day.
pub fn backup_if_due(state: &AppState) {
    let due = {
        let cfg = state.config.lock().unwrap();
        cfg.backupDaily
            && cfg.backupDir.is_some()
            && cfg.dataDir.is_some()
            && cfg.lastBackup.as_deref().map(|d| &d[..10.min(d.len())] < store::today().as_str()).unwrap_or(true)
    };
    if due {
        let _ = run_backup(state);
    }
}

#[tauri::command]
pub fn open_path(app: tauri::AppHandle, path: String) -> R<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| ApiError { code: "io".into(), message: e.to_string() })
}

#[tauri::command]
pub fn reveal_path(app: tauri::AppHandle, path: String) -> R<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().reveal_item_in_dir(path).map_err(|e| ApiError { code: "io".into(), message: e.to_string() })
}

// ---------- shop ----------

#[tauri::command]
pub fn get_shop(state: State<AppState>) -> R<Loaded<Shop>> {
    Ok(store(&state)?.shop()?)
}

#[tauri::command]
pub fn save_shop(state: State<AppState>, input: SaveInput<Shop>) -> R<Loaded<Shop>> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.save_shop(input)?)
}

// ---------- lists ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceRow {
    pub carId: String,
    pub plate: String,
    pub carName: String,
    pub clientName: String,
    pub operation: String,
    pub status: String,
    pub nextDate: Option<String>,
    pub kmLeft: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    #[serde(flatten)]
    pub base: Dashboard,
    pub maintenance: Vec<MaintenanceRow>,
}

/// Cars not seen for this long are left off the maintenance list: their
/// history here is too old to forecast from.
const MAINTENANCE_RECENT_DAYS: i64 = 730;

#[tauri::command]
pub fn dashboard(state: State<AppState>) -> R<DashboardData> {
    let st = store(&state)?;
    let scan = st.scan()?;
    let today = store::today();
    let mut base = views::dashboard(&scan, &today);
    let mut maintenance = Vec::new();
    if feature_on(&features(&st), "schedule") {
        let (all, problems) = schedule::load_all(&st.schedules_dir());
        base.problems.extend(problems.into_iter().map(|(path, message)| store::Problem { path, message }));
        for (car, readings) in &scan.cars {
            let cs = car_schedule(&st, &scan, &all, car, readings, &today);
            let Some(cs) = cs else { continue };
            for i in cs.items.into_iter().filter(|i| i.status == "просрочено" || i.status == "скоро") {
                maintenance.push(MaintenanceRow {
                    carId: car.data.id.clone(),
                    plate: car.data.plate.clone(),
                    carName: views::car_name(&car.data),
                    clientName: scan.clients.iter().find(|c| c.data.id == car.data.clientId).map(|c| c.data.name.clone()).unwrap_or_default(),
                    operation: i.operation,
                    status: i.status,
                    nextDate: i.nextDate,
                    kmLeft: i.kmLeft,
                });
            }
        }
        maintenance.sort_by(|a, b| a.nextDate.cmp(&b.nextDate));
    }
    Ok(DashboardData { base, maintenance })
}

/// The schedule for one car; None when its last reading is too old.
fn car_schedule(
    st: &Store,
    scan: &store::Scan,
    all: &[schedule::Schedule],
    car: &Loaded<Car>,
    readings: &[Reading],
    today: &str,
) -> Option<CarSchedule> {
    let rs = views::all_readings(scan, &car.data.id, readings);
    let u = usage::compute(&rs);
    let recent = match (u.lastDate.as_deref(), chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d").ok()) {
        (Some(d), Some(t)) => chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map(|d| (t - d).num_days() <= MAINTENANCE_RECENT_DAYS).unwrap_or(false),
        _ => false,
    };
    if !recent {
        return None;
    }
    Some(full_schedule(st, scan, all, car, &u, today))
}

fn full_schedule(st: &Store, scan: &store::Scan, all: &[schedule::Schedule], car: &Loaded<Car>, u: &usage::Usage, today: &str) -> CarSchedule {
    let dir = PathBuf::from(&car.dir);
    let parts = st.parts(&dir);
    let manual = schedule::read_manual(&dir);
    let orders: Vec<&WorkOrder> = scan.orders.iter().filter(|o| o.data.carId == car.data.id).map(|o| &o.data).collect();
    let h = schedule::CarHistory { car: &car.data, pinned: &car.data.schedules, parts: &parts, orders, manual: &manual, usage: u };
    schedule::for_car(all, &h, today)
}

#[tauri::command]
pub fn list_clients(state: State<AppState>) -> R<Vec<ClientSummary>> {
    Ok(views::clients(&store(&state)?.scan()?))
}

#[tauri::command]
pub fn list_cars(state: State<AppState>) -> R<Vec<CarSummary>> {
    Ok(views::cars(&store(&state)?.scan()?, &store::today()))
}

#[tauri::command]
pub fn list_orders(state: State<AppState>) -> R<Vec<OrderSummary>> {
    Ok(views::orders(&store(&state)?.scan()?))
}

// ---------- clients ----------

#[tauri::command]
pub fn get_client(state: State<AppState>, id: String) -> R<ClientDetail> {
    let scan = store(&state)?.scan()?;
    views::client_detail(&scan, &id, &store::today()).ok_or_else(|| not_found(&id))
}

#[tauri::command]
pub fn save_client(state: State<AppState>, input: SaveInput<Client>) -> R<Loaded<Client>> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.save_client(input)?)
}

// ---------- cars ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CarPageData {
    #[serde(flatten)]
    pub detail: CarDetail,
    pub schedule: Option<CarSchedule>,
    pub links: Vec<Link>,
    pub quotes: Vec<QuoteSummary>,
}

#[tauri::command]
pub fn get_car(state: State<AppState>, id: String) -> R<CarPageData> {
    let st = store(&state)?;
    let scan = st.scan()?;
    let detail = car_detail(&st, &scan, &id)?;
    let shop = features(&st);
    let car = scan.cars.iter().find(|c| c.0.data.id == id).ok_or_else(|| not_found(&id))?;
    let schedule = feature_on(&shop, "schedule").then(|| {
        let (all, _) = schedule::load_all(&st.schedules_dir());
        full_schedule(&st, &scan, &all, &car.0, &detail.usage, &store::today())
    });
    let links = if feature_on(&shop, "links") { links::for_car(&st.links_dir(), &car.0.data) } else { vec![] };
    let mut quotes: Vec<QuoteSummary> = scan.quotes.iter().filter(|q| q.data.carId == id).map(|q| quote_summary(&scan, q)).collect();
    quotes.sort_by(|a, b| b.quote.date.cmp(&a.quote.date));
    Ok(CarPageData { detail, schedule, links, quotes })
}

fn car_detail(st: &Store, scan: &store::Scan, id: &str) -> R<CarDetail> {
    let car = scan.cars.iter().find(|c| c.0.data.id == id).ok_or_else(|| not_found(id))?;
    let dir = PathBuf::from(&car.0.dir);
    let mut docs = st.list_files(&dir.join(store::DOCS_DIR));
    for o in scan.orders.iter().filter(|o| o.data.carId == id) {
        docs.extend(st.list_files(Path::new(&o.dir)));
    }
    docs.sort_by(|a, b| b.modified.cmp(&a.modified));
    views::car_detail(scan, id, st.parts(&dir), docs, &store::today()).ok_or_else(|| not_found(id))
}

#[tauri::command]
pub fn save_car(state: State<AppState>, input: SaveInput<Car>) -> R<Loaded<Car>> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.save_car(input)?)
}

#[tauri::command]
pub fn add_reading(state: State<AppState>, carId: String, reading: Reading) -> R<()> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.add_reading(&carId, reading)?)
}

#[tauri::command]
pub fn add_parts(state: State<AppState>, carId: String, rows: Vec<PartRow>) -> R<()> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.add_parts(&carId, rows)?)
}

// ---------- work orders ----------

#[tauri::command]
pub fn get_order(state: State<AppState>, id: String) -> R<OrderDetail> {
    let st = store(&state)?;
    let scan = st.scan()?;
    let o = scan.orders.iter().find(|o| o.data.id == id).ok_or_else(|| not_found(&id))?;
    let files = st.list_files(Path::new(&o.dir));
    views::order_detail(&scan, &id, files).ok_or_else(|| not_found(&id))
}

#[tauri::command]
pub fn save_order(state: State<AppState>, input: SaveInput<WorkOrder>) -> R<Loaded<WorkOrder>> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.save_order(input)?)
}

#[tauri::command]
pub fn close_order(state: State<AppState>, id: String) -> R<Loaded<WorkOrder>> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.close_order(&id)?)
}

// ---------- documents ----------

/// target: "car" (its документи folder), "order" (the repair folder) or "quote".
#[tauri::command]
pub fn attach_files(state: State<AppState>, target: String, id: String, paths: Vec<String>) -> R<Vec<FileInfo>> {
    let _g = state.write_lock.lock().unwrap();
    let st = store(&state)?;
    let dir = match target.as_str() {
        "car" => st.car_docs_dir(&id)?,
        "order" => st.order_dir(&id)?,
        "quote" => PathBuf::from(st.quote(&id)?.dir),
        _ => return Err(StoreError::Invalid(format!("непозната цел: {target}")).into()),
    };
    Ok(st.attach(&dir, &paths)?)
}

#[tauri::command]
pub fn record_dir(state: State<AppState>, kind: String, id: String) -> R<String> {
    let st = store(&state)?;
    let dir = match kind.as_str() {
        "client" => st.client(&id)?.dir,
        "car" => st.car(&id)?.dir,
        "order" => st.order(&id)?.dir,
        "root" => st.root.to_string_lossy().to_string(),
        _ => return Err(StoreError::Invalid(format!("непознат вид: {kind}")).into()),
    };
    Ok(dir)
}

#[tauri::command]
pub fn open_url(app: tauri::AppHandle, url: String) -> R<()> {
    use tauri_plugin_opener::OpenerExt;
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(StoreError::Invalid("Адресът трябва да започва с http:// или https://".into()).into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| ApiError { code: "io".into(), message: e.to_string() })
}

// ---------- VIN ----------

/// Decode a VIN locally and, when switched on in Settings, online. Only the
/// VIN leaves the computer.
#[tauri::command]
pub async fn decode_vin(state: State<'_, AppState>, vin: String) -> R<VinResult> {
    let st = store(&state)?;
    let shop = features(&st);
    if !feature_on(&shop, "vin") {
        return Err(StoreError::Invalid("Разчитането на VIN е изключено в Настройки".into()).into());
    }
    let year = chrono::Datelike::year(&chrono::Local::now().date_naive());
    let local = vin::decode_local(&vin, year);
    if !local.valid || !feature_on(&shop, "vinOnline") {
        return Ok(local);
    }
    let cache = st.vin_cache_dir();
    let code = local.vin.clone();
    // Network call off the main thread so the window stays responsive.
    let answer = tauri::async_runtime::spawn_blocking(move || vin::lookup_nhtsa(&code, &cache))
        .await
        .map_err(|e| ApiError { code: "io".into(), message: e.to_string() })?;
    Ok(match answer {
        Ok(v) => vin::merge(local, vin::fields_from_nhtsa(&v)),
        Err(m) => {
            let mut r = local;
            r.warnings.push(m);
            r
        }
    })
}

// ---------- maintenance ----------

#[tauri::command]
pub fn mark_done(state: State<AppState>, carId: String, row: ManualDone) -> R<()> {
    let _g = state.write_lock.lock().unwrap();
    if chrono::NaiveDate::parse_from_str(&row.date, "%Y-%m-%d").is_err() {
        return Err(StoreError::Invalid("Датата трябва да е във формат ГГГГ-ММ-ДД".into()).into());
    }
    let st = store(&state)?;
    let car = st.car(&carId)?;
    schedule::add_manual(Path::new(&car.dir), row)?;
    Ok(())
}

/// Put the shipped schedules and links into the data folder. Existing files
/// are kept unless `overwrite`. Returns how many files were written.
#[tauri::command]
pub fn install_reference(state: State<AppState>, overwrite: bool) -> R<usize> {
    let _g = state.write_lock.lock().unwrap();
    let st = store(&state)?;
    let a = st.install_starter(&st.schedules_dir(), schedule::STARTER, overwrite)?;
    let b = st.install_starter(&st.links_dir(), links::STARTER, overwrite)?;
    Ok(a + b)
}

#[tauri::command]
pub fn reference_dir(state: State<AppState>, kind: String) -> R<String> {
    let st = store(&state)?;
    let dir = match kind.as_str() {
        "schedules" => st.schedules_dir(),
        "links" => st.links_dir(),
        _ => return Err(StoreError::Invalid(format!("непознат вид: {kind}")).into()),
    };
    std::fs::create_dir_all(&dir)?;
    Ok(dir.to_string_lossy().to_string())
}

// ---------- quotes and reports ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSummary {
    pub quote: Quote,
    pub totals: Totals,
    pub plate: String,
    pub carName: String,
    pub clientName: String,
    pub orderNumber: String,
}

fn quote_summary(scan: &store::Scan, q: &Loaded<Quote>) -> QuoteSummary {
    let car = scan.cars.iter().find(|c| c.0.data.id == q.data.carId).map(|c| &c.0.data);
    QuoteSummary {
        totals: q.data.totals(),
        plate: car.map(|c| c.plate.clone()).unwrap_or_default(),
        carName: car.map(views::car_name).unwrap_or_default(),
        clientName: scan.clients.iter().find(|c| c.data.id == q.data.clientId).map(|c| c.data.name.clone()).unwrap_or_default(),
        orderNumber: scan.orders.iter().find(|o| o.data.id == q.data.orderId).map(|o| o.data.number.clone()).unwrap_or_default(),
        quote: q.data.clone(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteDetail {
    pub quote: Loaded<Quote>,
    pub totals: Totals,
    pub car: Car,
    pub client: Client,
    pub orderNumber: String,
    pub files: Vec<FileInfo>,
}

#[tauri::command]
pub fn list_quotes(state: State<AppState>) -> R<Vec<QuoteSummary>> {
    let scan = store(&state)?.scan()?;
    let mut v: Vec<QuoteSummary> = scan.quotes.iter().map(|q| quote_summary(&scan, q)).collect();
    v.sort_by(|a, b| b.quote.date.cmp(&a.quote.date).then(b.quote.number.cmp(&a.quote.number)));
    Ok(v)
}

#[tauri::command]
pub fn get_quote(state: State<AppState>, id: String) -> R<QuoteDetail> {
    let st = store(&state)?;
    let scan = st.scan()?;
    let q = scan.quotes.iter().find(|q| q.data.id == id).ok_or_else(|| not_found(&id))?;
    let s = quote_summary(&scan, q);
    let car = scan.cars.iter().find(|c| c.0.data.id == q.data.carId).map(|c| c.0.data.clone()).unwrap_or_default();
    let client = scan.clients.iter().find(|c| c.data.id == q.data.clientId).map(|c| c.data.clone()).unwrap_or_default();
    Ok(QuoteDetail { totals: s.totals, orderNumber: s.orderNumber, car, client, files: st.list_files(Path::new(&q.dir)), quote: q.clone() })
}

#[tauri::command]
pub fn save_quote(state: State<AppState>, input: SaveInput<Quote>) -> R<Loaded<Quote>> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.save_quote(input)?)
}

#[tauri::command]
pub fn accept_quote(state: State<AppState>, id: String) -> R<Loaded<WorkOrder>> {
    let _g = state.write_lock.lock().unwrap();
    Ok(store(&state)?.accept_quote(&id)?)
}

// ---------- fault codes ----------

/// Read fault codes from a PDF in the data folder.
#[tauri::command]
pub async fn scan_fault_codes(state: State<'_, AppState>, path: String) -> R<FaultScan> {
    let st = store(&state)?;
    let p = PathBuf::from(&path);
    if !p.starts_with(&st.root) {
        return Err(StoreError::Invalid("Файлът не е в папката с данни".into()).into());
    }
    tauri::async_runtime::spawn_blocking(move || faultcodes::scan_pdf(&p))
        .await
        .map_err(|e| ApiError { code: "io".into(), message: e.to_string() })
}
