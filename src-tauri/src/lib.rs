// Records use camelCase field names so they match the UI's TypeScript types.
#![allow(non_snake_case)]

mod backup;
mod commands;
mod config;
pub mod faultcodes;
pub mod links;
pub mod schedule;
pub mod vin;
pub mod md;
pub mod model;
pub mod names;
pub mod store;
pub mod usage;
pub mod views;

use commands::AppState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let config = config::AppConfig::load(&config_dir);
            let state = AppState { config_dir, config: Mutex::new(config), write_lock: Mutex::new(()) };
            commands::backup_if_due(&state);
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_config,
            commands::set_data_dir,
            commands::set_backup,
            commands::backup_now,
            commands::set_auto_update,
            commands::open_path,
            commands::reveal_path,
            commands::get_shop,
            commands::save_shop,
            commands::dashboard,
            commands::list_clients,
            commands::list_cars,
            commands::list_orders,
            commands::get_client,
            commands::save_client,
            commands::get_car,
            commands::save_car,
            commands::add_reading,
            commands::add_parts,
            commands::get_order,
            commands::save_order,
            commands::close_order,
            commands::attach_files,
            commands::record_dir,
            commands::open_url,
            commands::decode_vin,
            commands::mark_done,
            commands::install_reference,
            commands::reference_dir,
            commands::list_quotes,
            commands::get_quote,
            commands::save_quote,
            commands::accept_quote,
            commands::scan_fault_codes,
            commands::get_logo,
            commands::set_logo_file,
            commands::set_logo_svg,
            commands::clear_logo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
