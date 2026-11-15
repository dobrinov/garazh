# Автосервиз

Desktop app for a small car repair shop, in Bulgarian, for Windows 10 and 11.
All data is kept as plain folders and Markdown files that can be browsed in
Explorer and edited in Notepad. See the technical plan and design canvas for
the full picture.

## What the MVP does

- Clients (private and company), with search and filters
- Cars per client: details, deadlines (ГТП, ГО, vignette), notes; search by
  plate (Latin or Cyrillic, with or without spaces), VIN fragment, make and model
- Work orders: intake, mileage check against the car's history, labour and
  parts lines, discount, VAT, payment, status steps, print / save as PDF
- Closing a work order writes its parts (with mileage) to `части.md` and its
  mileage to `пробег.md`, once
- Mileage and usage per car: km per day, month and year, trend, chart
- Documents: drag files onto the window or pick them; originals are copied into
  the car's `документи\` folder or the repair folder
- Dashboard: cars in the shop, deadlines in the next 30 days, turnover, unpaid
- Settings: shop details, labour rate, VAT, data folder, ZIP backups (manual
  and daily)
- Files edited outside the app are picked up when the window regains focus;
  saving over a file changed meanwhile is refused instead of overwriting it

Planned for version 1.0: maintenance schedule, VIN decode, quotes and reports,
useful links per make, fault codes from PDFs, feature switches.

## Data folder

```
<data folder>\
  сервиз.md                          shop details and number counters
  ПРОЧЕТИ.txt                        explains the layout in Bulgarian
  клиенти\
    0001 Иван Петров\
      клиент.md
      СА4821КН Volkswagen Golf VII\
        автомобил.md                 VIN, engine, gearbox, deadlines
        пробег.md                    odometer readings (table)
        части.md                     parts and consumables fitted (table)
        документи\                   uploaded files, as uploaded
        ремонти\
          2026-03-14 РК-2026-0004 Обслужване\
            работна-карта.md
            Diagnostika.pdf
  .index\                            disposable, safe to delete
```

Record files start with a YAML header between `---` lines using Bulgarian
keys (`рег_номер`, `пробег`, …). Unknown keys added by hand are kept on save.

## Developing

Requirements: Node 20+, pnpm, Rust (stable).

```sh
pnpm install
pnpm tauri dev          # run the app
pnpm test               # UI tests
cd src-tauri && cargo test   # core tests (file store, money, usage, backup)
```

Sample data to try the app with:

```sh
cd src-tauri
cargo run --example sample_data -- "/path/to/empty/folder"
```

Then pick that folder on the app's first start (or in Settings).

## Windows installer

Installers are built on Windows. Either run `pnpm tauri build` on a Windows
machine, or use the **Windows installer** GitHub Actions workflow
(`.github/workflows/windows.yml`), which uploads the `.exe` and `.msi`.
The installer installs per user (no admin rights) and adds Microsoft's
WebView2 runtime on Windows 10 if it is missing.

Before giving the installer to anyone, sign it with a code-signing
certificate so Windows SmartScreen does not block it.

## Code map

| Path | What |
| --- | --- |
| `src-tauri/src/md.rs` | Markdown + YAML header format, tables, atomic writes |
| `src-tauri/src/model.rs` | Records, money in cents, work-order totals |
| `src-tauri/src/store.rs` | The file-system database: scan, save, rename, close, attach |
| `src-tauri/src/views.rs` | Summaries for lists and the dashboard |
| `src-tauri/src/usage.rs` | Mileage usage and forecasts |
| `src-tauri/src/backup.rs` | ZIP backups |
| `src-tauri/src/commands.rs` | Tauri commands (the UI's only way to the disk) |
| `src/api.ts` | Typed command wrappers |
| `src/pages/*` | Screens |
