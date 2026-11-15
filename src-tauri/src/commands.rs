//! Tauri commands: the only way the UI reaches the disk.
#![allow(non_snake_case)]

use crate::backup;
use crate::config::AppConfig;
use crate::model::*;
use crate::store::{self, FileInfo, Loaded, SaveInput, Store, StoreError};
use crate::views::{self, CarDetail, CarSummary, ClientDetail, ClientSummary, Dashboard, OrderDetail, OrderSummary};
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

#[tauri::command]
pub fn dashboard(state: State<AppState>) -> R<Dashboard> {
    let scan = store(&state)?.scan()?;
    Ok(views::dashboard(&scan, &store::today()))
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

#[tauri::command]
pub fn get_car(state: State<AppState>, id: String) -> R<CarDetail> {
    let st = store(&state)?;
    let scan = st.scan()?;
    let car = scan.cars.iter().find(|c| c.0.data.id == id).ok_or_else(|| not_found(&id))?;
    let dir = PathBuf::from(&car.0.dir);
    let mut docs = st.list_files(&dir.join(store::DOCS_DIR));
    for o in scan.orders.iter().filter(|o| o.data.carId == id) {
        docs.extend(st.list_files(Path::new(&o.dir)));
    }
    docs.sort_by(|a, b| b.modified.cmp(&a.modified));
    views::car_detail(&scan, &id, st.parts(&dir), docs, &store::today()).ok_or_else(|| not_found(&id))
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

/// target: "car" (its документи folder) or "order" (the repair folder).
#[tauri::command]
pub fn attach_files(state: State<AppState>, target: String, id: String, paths: Vec<String>) -> R<Vec<FileInfo>> {
    let _g = state.write_lock.lock().unwrap();
    let st = store(&state)?;
    let dir = match target.as_str() {
        "car" => st.car_docs_dir(&id)?,
        "order" => st.order_dir(&id)?,
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
