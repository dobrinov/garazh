# Автосервиз

Desktop app for a small car repair shop, in Bulgarian, for Windows 10 and 11.
All data is kept as plain folders and Markdown files that can be browsed in
Explorer and edited in Notepad. See the technical plan and design canvas for
the full picture.

## What it does

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

Version 1.0 adds:

- **Feature switches** in Settings (stored in `сервиз.md` under `функции`);
  a switched-off feature hides its menus and sections and keeps its files
- **VIN decoding**: make, model (VW group) and model year offline from the
  VIN; online lookup through NHTSA vPIC (on by default, can be switched off;
  sends only the VIN, on click, answers cached in `справочници\vin-отговори\`).
  Fields filled from the VIN are listed under `от_vin:`; typing over one moves
  it to `ръчно:` and later lookups leave it alone
- **Maintenance schedule**: interval files in `справочници\графици\`, picked
  by engine and gearbox code (or chosen by hand per car); last done is found
  in `части.md` and the work orders' labour lines; next due by km (forecast
  from the car's usage) or time, whichever comes first. Operations done
  elsewhere are marked in the car's `график-поддръжка.md`. Due and overdue
  items are listed on the dashboard
- **Starter schedules for 22 engine and gearbox families. They are not
  checked**: every file has `проверено: false` until the owner verifies it
  against the manufacturer's data
- **Quotes and reports**: quotes (ОФ-…), repair reports and diagnostic
  reports (ДК-…) in the car's `оферти-и-доклади\` folder; print or save as
  PDF; accepting a quote opens a work order with its lines
- **Useful links** per make in `справочници\марки\`, with `{VIN}`,
  `{КОД_ДВИГАТЕЛ}` and other placeholders filled from the car
- **Fault codes** read from the text layer of diagnostic PDFs (P/B/C/U + 4)

Not done yet from the plan's version 1.0: code signing and automatic updates
(both need a certificate and signing keys first).

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
        график-поддръжка.md          maintenance done elsewhere (table)
        оферти-и-доклади\
          2026-11-10 ОФ-2026-0001 Съединител\
            документ.md
        ремонти\
          2026-03-14 РК-2026-0004 Обслужване\
            работна-карта.md
            Diagnostika.pdf
  справочници\
    графици\                         maintenance intervals, editable
    марки\                           useful links per make, editable
    vin-отговори\                    cached online VIN answers
  .index\                            disposable, safe to delete
```

Record files start with a YAML header between `---` lines using Bulgarian
keys (`рег_номер`, `пробег`, …). Unknown keys added by hand are kept on save.

## Developing

Requirements: Node 20+, pnpm, Rust (stable).

```sh
pnpm install
pnpm tauri dev          # run the app (starts Vite and the window)
pnpm test               # UI tests
cd src-tauri && cargo test   # core tests (file store, money, usage, backup)
```

Two ways to run it:

- `pnpm tauri dev`: loads the screens from the Vite dev server, so changes to
  `src/` show up at once. It runs cargo without the `embed-frontend` feature
  (see `scripts/tauri.mjs`).
- `cargo run` (in `src-tauri`): `embed-frontend` is on by default, so
  `build.rs` rebuilds the screens with `pnpm run build` when `src/` changed
  and builds them into the app. No dev server is needed; Node and pnpm are.

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
| `src-tauri/src/vin.rs` | VIN decoding (local tables, NHTSA vPIC) |
| `src-tauri/src/schedule.rs` | Maintenance schedule: files, matching, due dates |
| `src-tauri/src/links.rs` | Useful links per make |
| `src-tauri/src/faultcodes.rs` | Fault codes from PDF text |
| `src-tauri/resources/` | Starter schedules and links copied into new data folders |
| `src-tauri/src/commands.rs` | Tauri commands (the UI's only way to the disk) |
| `src/api.ts` | Typed command wrappers |
| `src/pages/*` | Screens |
