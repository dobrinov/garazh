//! Fill a data folder with realistic sample records, for trying the app.
//!
//!   cargo run --example sample_data -- "D:\Сервиз\Проба"
//!
//! Refuses to run on a folder that already has clients.

use avtoservis_lib::model::*;
use avtoservis_lib::store::{SaveInput, Store};

fn money(s: &str) -> Money {
    Money::parse(s).unwrap()
}

fn main() {
    let dir = std::env::args().nth(1).expect("usage: sample_data <folder>");
    let store = Store::new(&dir);
    store.init().unwrap();
    if !store.scan().unwrap().clients.is_empty() {
        eprintln!("{dir} вече съдържа клиенти – изберете празна папка.");
        std::process::exit(1);
    }

    let client = |name: &str, kind: &str, phone: &str| {
        store
            .save_client(SaveInput {
                data: Client { name: name.into(), kind: kind.into(), phone: phone.into(), viber: true, gdprConsent: Some("2024-03-12".into()), ..Default::default() },
                ..Default::default()
            })
            .unwrap()
            .data
    };
    let car = |client_id: &str, plate: &str, make: &str, model: &str, year: u32, vin: &str, engine: (&str, &str), gearbox: (&str, &str), gtp: &str| {
        store
            .save_car(SaveInput {
                data: Car {
                    clientId: client_id.into(),
                    plate: plate.into(),
                    make: make.into(),
                    model: model.into(),
                    year: Some(year),
                    vin: vin.into(),
                    engine: engine.0.into(),
                    engineCode: engine.1.into(),
                    gearbox: gearbox.0.into(),
                    gearboxCode: gearbox.1.into(),
                    fuel: "дизел".into(),
                    inspectionUntil: Some(gtp.into()),
                    ..Default::default()
                },
                ..Default::default()
            })
            .unwrap()
            .data
    };
    let order = |car_id: &str, date: &str, title: &str, km: u64, labor: Vec<(&str, f64)>, parts: Vec<(&str, &str, f64, &str, &str)>, close: bool, paid: bool| {
        let saved = store
            .save_order(SaveInput {
                data: WorkOrder {
                    carId: car_id.into(),
                    date: date.into(),
                    title: title.into(),
                    mileage: Some(km),
                    mechanic: "Георги".into(),
                    status: if close { "предадена".into() } else { "в_ремонт".into() },
                    paid,
                    payment: if paid { "В брой".into() } else { String::new() },
                    labor: labor.into_iter().map(|(d, h)| LaborLine { description: d.into(), mechanic: "Георги".into(), hours: h, rate: money("50") }).collect(),
                    parts: parts
                        .into_iter()
                        .map(|(p, n, q, u, price)| PartLine { part: p.into(), partNumber: n.into(), quantity: q, unit: u.into(), price: money(price), ..Default::default() })
                        .collect(),
                    ..Default::default()
                },
                ..Default::default()
            })
            .unwrap();
        if close {
            let mut closed = store.close_order(&saved.data.id).unwrap();
            closed.data.closedOn = Some(date.into());
            closed.data.status = "предадена".into();
            store.save_order(SaveInput { data: closed.data, notes: closed.notes, baseHash: None }).unwrap();
        }
    };

    let ivan = client("Иван Петров", "частно", "+359 888 123 456");
    let golf = car(&ivan.id, "СА 4821 КН", "Volkswagen", "Golf VII", 2016, "WVWZZZAUZGW123456", ("2.0 TDI 110 kW", "CRLB"), ("DSG 6 ст.", "DQ250"), "2026-11-28");
    store.add_reading(&golf.id, Reading { date: "2023-12-19".into(), km: 158_900, source: "при приемане".into() }).unwrap();
    order(&golf.id, "2024-05-05", "Голямо обслужване", 165_000, vec![("Смяна на филтри", 1.5)], vec![("Горивен филтър", "MANN-FILTER", 1.0, "бр.", "29"), ("Въздушен филтър", "MANN-FILTER", 1.0, "бр.", "16")], true, true);
    order(&golf.id, "2025-01-11", "Предни спирачки", 172_300, vec![("Смяна на дискове и накладки", 2.0)], vec![("Предни спирачни дискове", "Brembo", 2.0, "бр.", "48"), ("Предни накладки", "TRW", 1.0, "к-т", "42")], true, true);
    order(&golf.id, "2025-09-20", "Масло и филтър DSG", 180_000, vec![("Смяна на масло DSG, адаптация", 1.5)], vec![("Масло DSG", "VAG G 052 182 A2", 5.5, "л", "17.80")], true, true);
    order(&golf.id, "2026-03-14", "Обслужване – масло и филтри", 189_000, vec![("Смяна масло и филтри", 1.0)], vec![("Двигателно масло 5W-30 VW 507.00", "Castrol EDGE LL III", 4.6, "л", "11.30"), ("Маслен филтър", "MANN HU 6008/1 z", 1.0, "бр.", "11")], true, true);
    order(&golf.id, "2026-11-02", "Диагностика P2002", 203_400, vec![("Компютърна диагностика и регенерация", 1.5)], vec![("Датчик за налягане DPF", "VAG 04L 906 051 L", 1.0, "бр.", "74")], false, false);

    let maria = client("Мария Иванова", "частно", "+359 877 445 210");
    let octavia = car(&maria.id, "СВ 7710 АР", "Škoda", "Octavia III", 2015, "TMBAG7NE1F0098834", ("1.6 TDI 81 kW", "CLHA"), ("5 ст. ръчна", ""), "2027-04-02");
    order(&octavia.id, "2025-10-03", "Обслужване", 229_000, vec![("Масло и филтри", 1.0)], vec![("Двигателно масло 5W-30", "Motul", 4.3, "л", "10.50")], true, true);

    let firm = client("Транс-Логистик ЕООД", "фирма", "+359 2 955 1020");
    let bmw = car(&firm.id, "РВ 2045 ТМ", "BMW", "320d F30", 2014, "WBA3D31070F612840", ("2.0d 135 kW", "N47D20"), ("8 ст. автомат.", "ZF 8HP"), "2026-12-03");
    order(&bmw.id, "2026-06-12", "Ангренажна верига", 298_000, vec![("Смяна на ангренажна верига", 9.0)], vec![("Комплект ангренажна верига", "Febi", 1.0, "к-т", "310")], true, false);

    // A quote waiting for an answer, and a diagnostic report for the open repair.
    store
        .save_quote(SaveInput {
            data: Quote {
                kind: QUOTE.into(),
                carId: octavia.id.clone(),
                date: "2026-11-10".into(),
                validUntil: Some("2026-11-24".into()),
                title: "Смяна на съединител и маховик".into(),
                findings: "Съединителят буксува на 3-та и 4-та предавка.".into(),
                labor: vec![LaborLine { description: "Смяна на съединител и двумасов маховик".into(), hours: 6.5, rate: money("50"), ..Default::default() }],
                parts: vec![PartLine { part: "Комплект съединител с маховик".into(), partNumber: "LuK 600 0151 00".into(), quantity: 1.0, unit: "к-т".into(), price: money("520"), ..Default::default() }],
                ..Default::default()
            },
            ..Default::default()
        })
        .unwrap();
    store
        .save_quote(SaveInput {
            data: Quote {
                kind: DIAGNOSTIC_REPORT.into(),
                carId: golf.id.clone(),
                date: "2026-11-02".into(),
                mileage: Some(203_400),
                title: "Диагностика – светнала лампа за двигателя".into(),
                findings: "Записана грешка за ефективност на DPF. Датчикът за диференциално налягане дава нереални стойности.".into(),
                faultCodes: vec![FaultRow { code: "P2002".into(), text: "Филтър за твърди частици – ефективност под прага".into() }],
                recommendations: "Смяна на датчика за налягане и принудителна регенерация.".into(),
                ..Default::default()
            },
            ..Default::default()
        })
        .unwrap();

    println!("Готово: {dir}");
}
