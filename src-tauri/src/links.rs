#![allow(non_snake_case)]
//! Useful links per make, kept in editable files under `справочници\марки\`.
//! A file without `марки:` applies to every car.

use crate::md::{parse_record, parse_table, read_text};
use crate::model::Car;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::Path;

pub const LINKS_DIR: &str = "марки";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LinksMeta {
    pub name: String,
    pub makes: Vec<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub name: String,
    /// With the car's data filled in.
    pub url: String,
    pub note: String,
    /// Copied to the clipboard when the link is opened, for sites whose
    /// address cannot carry it (e.g. the VIN for a catalogue's search box).
    pub copy: String,
    /// What `copy` is, for the message: "VIN", "Рег. номер"…
    pub copyLabel: String,
    /// Which file it came from, so the user can edit it.
    pub group: String,
    pub file: String,
}

fn norm_make(s: &str) -> String {
    s.trim().to_lowercase().replace('š', "s").replace('ë', "e")
}

fn applies(meta: &LinksMeta, make: &str) -> bool {
    if meta.makes.is_empty() {
        return true;
    }
    let m = norm_make(make);
    !m.is_empty() && meta.makes.iter().any(|x| norm_make(x) == m)
}

fn enc(s: &str) -> String {
    let mut out = String::new();
    for b in s.trim().bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// The last 7 characters of the VIN (the serial part), which is what parts
/// catalogues such as RealOEM ask for. Empty when the VIN is too short.
pub fn vin7(vin: &str) -> String {
    let v: Vec<char> = vin.chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_uppercase()).collect();
    if v.len() < 7 {
        return String::new();
    }
    v[v.len() - 7..].iter().collect()
}

/// Placeholders a links file can use, with the car's value and a name for
/// messages. {VIN7} comes before {VIN} so it is not half-replaced.
fn placeholders(car: &Car) -> [(&'static str, String, &'static str); 9] {
    [
        ("{VIN7}", vin7(&car.vin), "VIN (последните 7 знака)"),
        ("{VIN}", car.vin.trim().to_uppercase(), "VIN"),
        ("{МАРКА}", car.make.trim().to_string(), "Марка"),
        ("{МОДЕЛ}", car.model.trim().to_string(), "Модел"),
        ("{ГОДИНА}", car.year.map(|y| y.to_string()).unwrap_or_default(), "Година"),
        ("{ДВИГАТЕЛ}", car.engine.trim().to_string(), "Двигател"),
        ("{КОД_ДВИГАТЕЛ}", car.engineCode.trim().to_string(), "Код на двигателя"),
        ("{КОД_КУТИЯ}", car.gearboxCode.trim().to_string(), "Код на кутията"),
        ("{РЕГ_НОМЕР}", car.plate.trim().to_string(), "Рег. номер"),
    ]
}

pub fn fill(url: &str, car: &Car) -> String {
    let mut out = url.to_string();
    for (ph, v, _) in placeholders(car) {
        // Plates go into addresses without spaces: CA1234XX.
        let v = if ph == "{РЕГ_НОМЕР}" { v.replace(' ', "") } else { v };
        out = out.replace(ph, &enc(&v));
    }
    out
}

fn fill_label(name: &str, car: &Car) -> String {
    let mut out = name.to_string();
    for (ph, v, _) in placeholders(car) {
        out = out.replace(ph, &v);
    }
    out
}

/// True when the text uses a placeholder the car has no value for.
fn needs_missing(text: &str, car: &Car) -> bool {
    placeholders(car).iter().any(|(ph, v, _)| text.contains(ph) && v.is_empty())
}

/// The name of the first placeholder in `text`, for "VIN е копиран".
fn copy_label(text: &str, car: &Car) -> String {
    placeholders(car).iter().find(|(ph, _, _)| text.contains(ph)).map(|(_, _, l)| l.to_string()).unwrap_or_else(|| "Текстът".into())
}

/// Rows from the starter files of older versions, upgraded on the fly to
/// open the car directly or copy what the site asks for. Only an exact
/// match is changed; rows the owner edited are left alone. The files on
/// disk are not rewritten. (old address, new address, copy)
const UPGRADES: &[(&str, &str, &str)] = &[
    ("https://www.realoem.com/", "https://www.realoem.com/bmw/enUS/select?vin={VIN7}", ""),
    ("https://7zap.com/", "https://7zap.com/", "{VIN}"),
    ("https://partsouq.com/", "https://partsouq.com/en/search/all?q={VIN}", "{VIN}"),
    ("https://www.mdecoder.com/", "https://www.mdecoder.com/decode/{VIN}", ""),
    ("https://www.partslink24.com/", "https://www.partslink24.com/", "{VIN}"),
    ("https://rta.government.bg/", "https://rta.government.bg/", "{РЕГ_НОМЕР}"),
    ("https://www.guaranteefund.org/", "https://www.guaranteefund.org/", "{РЕГ_НОМЕР}"),
    ("https://www.bgtoll.bg/", "https://check.bgtoll.bg/", "{РЕГ_НОМЕР}"),
];

fn same_url(a: &str, b: &str) -> bool {
    a.trim().trim_end_matches('/') == b.trim().trim_end_matches('/')
}

/// Links for a car: make-specific files first, then the general ones.
/// A link whose address needs a value the car does not have is left out.
pub fn for_car(dir: &Path, car: &Car) -> Vec<Link> {
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut files: Vec<_> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().map(|e| e == "md").unwrap_or(false)).collect();
    files.sort();
    let mut specific = Vec::new();
    let mut general = Vec::new();
    for p in files {
        let Ok(text) = read_text(&p) else { continue };
        let Ok((meta, body)) = parse_record::<LinksMeta>(&text) else { continue };
        if !applies(&meta, &car.make) {
            continue;
        }
        let file = p.to_string_lossy().to_string();
        let group = if meta.name.is_empty() { p.file_stem().unwrap().to_string_lossy().to_string() } else { meta.name.clone() };
        for r in parse_table(&body).rows {
            let g = |i: usize| r.get(i).cloned().unwrap_or_default();
            let (name, mut url, note, mut copy) = (g(0), g(1), g(2), g(3));
            if copy.is_empty() {
                if let Some((_, new_url, new_copy)) = UPGRADES.iter().find(|(old, _, _)| same_url(&url, old)) {
                    // Use the better address only when the car has what it needs.
                    if !needs_missing(new_url, car) {
                        url = new_url.to_string();
                    }
                    copy = new_copy.to_string();
                }
            }
            // RealOEM without a VIN: the catalogue's home page.
            if url.contains("realoem.com") && url.contains("{VIN7}") && vin7(&car.vin).is_empty() {
                url = "https://www.realoem.com/".to_string();
            }
            if name.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) {
                continue;
            }
            // A link whose address or name needs a value the car lacks is left out;
            // a missing value to copy only means nothing is copied.
            if needs_missing(&url, car) || needs_missing(&name, car) {
                continue;
            }
            let (copy, copyLabel) = if copy.is_empty() || needs_missing(&copy, car) { (String::new(), String::new()) } else { (fill_label(&copy, car), copy_label(&copy, car)) };
            let link = Link { name: fill_label(&name, car), url: fill(&url, car), note, copy, copyLabel, group: group.clone(), file: file.clone() };
            if meta.makes.is_empty() {
                general.push(link);
            } else {
                specific.push(link);
            }
        }
    }
    specific.extend(general);
    specific
}

pub const STARTER: &[(&str, &str)] = &[
    ("общи.md", include_str!("../resources/links/general.md")),
    ("vag.md", include_str!("../resources/links/vag.md")),
    ("bmw.md", include_str!("../resources/links/bmw.md")),
    ("mercedes.md", include_str!("../resources/links/mercedes.md")),
    ("toyota.md", include_str!("../resources/links/toyota.md")),
    ("ford.md", include_str!("../resources/links/ford.md")),
    ("stellantis-renault.md", include_str!("../resources/links/stellantis-renault.md")),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_for_a_skoda_with_vin() {
        let dir = tempfile::tempdir().unwrap();
        for (name, text) in STARTER {
            fs::write(dir.path().join(name), text).unwrap();
        }
        let car = Car { make: "Skoda".into(), vin: "TMBAG7NE1F0098834".into(), ..Default::default() };
        let links = for_car(dir.path(), &car);
        assert_eq!(links[0].group, "Volkswagen, Škoda, Audi, SEAT", "make-specific first");
        let google = links.iter().find(|l| l.name == "Търси VIN в Google").unwrap();
        assert_eq!(google.url, "https://www.google.com/search?q=TMBAG7NE1F0098834");
        assert!(!links.iter().any(|l| l.name.contains("двигател")), "needs an engine code the car does not have");
        assert!(!links.iter().any(|l| l.group.starts_with("BMW")));
    }

    #[test]
    fn realoem_opens_the_car_by_short_vin() {
        assert_eq!(vin7("WBA8E9C50GK644117"), "K644117");
        assert_eq!(vin7("wba 8e9c50 gk644117"), "K644117");
        assert_eq!(vin7("123"), "");
        let dir = tempfile::tempdir().unwrap();
        for (name, text) in STARTER {
            fs::write(dir.path().join(name), text).unwrap();
        }
        // An older data folder still has RealOEM's home page.
        fs::write(dir.path().join("стар.md"), "---\nмарки: [MINI]\n---\n\n| Име | Адрес | Бележка |\n|---|---|---|\n| RealOEM | https://www.realoem.com/ | |\n").unwrap();
        let bmw = Car { make: "BMW".into(), vin: "WBA8E9C50GK644117".into(), ..Default::default() };
        let links = for_car(dir.path(), &bmw);
        let r = links.iter().find(|l| l.name.starts_with("RealOEM")).unwrap();
        assert_eq!(r.url, "https://www.realoem.com/bmw/enUS/select?vin=K644117");
        let mini = Car { make: "MINI".into(), vin: "WMWXM510X02E12345".into(), ..Default::default() };
        assert!(for_car(dir.path(), &mini).iter().filter(|l| l.name.starts_with("RealOEM")).all(|l| l.url.ends_with("vin=2E12345")));
        // Without a VIN, RealOEM is still there and opens its home page.
        let no_vin = Car { make: "BMW".into(), ..Default::default() };
        let r = for_car(dir.path(), &no_vin).into_iter().find(|l| l.group == "BMW и MINI" && l.name.starts_with("RealOEM")).unwrap();
        assert_eq!(r.url, "https://www.realoem.com/");
        // Other makes never get it.
        let acura = Car { make: "Acura".into(), vin: "JH4CU26659C022238".into(), ..Default::default() };
        assert!(!for_car(dir.path(), &acura).iter().any(|l| l.name.starts_with("RealOEM")));
    }

    #[test]
    fn links_carry_the_car_or_copy_it() {
        let dir = tempfile::tempdir().unwrap();
        for (name, text) in STARTER {
            fs::write(dir.path().join(name), text).unwrap();
        }
        let acura = Car { make: "Acura".into(), model: "TSX".into(), year: Some(2009), vin: "jh4cu26659c022238".into(), plate: "CA 1234 XX".into(), ..Default::default() };
        let links = for_car(dir.path(), &acura);
        let by = |p: &str| links.iter().find(|l| l.name.starts_with(p)).unwrap_or_else(|| panic!("no link {p}"));
        assert_eq!(by("Търси Acura TSX 2009").url, "https://www.google.com/search?q=Acura+TSX+2009");
        assert_eq!(by("Partsouq").url, "https://partsouq.com/en/search/all?q=JH4CU26659C022238");
        assert_eq!((by("7zap").copy.as_str(), by("7zap").copyLabel.as_str()), ("JH4CU26659C022238", "VIN"));
        assert_eq!((by("БГ ТОЛ").copy.as_str(), by("БГ ТОЛ").copyLabel.as_str()), ("CA 1234 XX", "Рег. номер"));
        assert_eq!(by("Търси VIN").copy, "");

        // Without a year the make/model/year search is left out; without a plate nothing is copied.
        let bare = Car { make: "Acura".into(), model: "TSX".into(), ..Default::default() };
        let links = for_car(dir.path(), &bare);
        assert!(!links.iter().any(|l| l.name.starts_with("Търси Acura")));
        assert!(!links.iter().any(|l| l.name.starts_with("Partsouq")), "address needs the VIN");
        assert_eq!(links.iter().find(|l| l.name.starts_with("БГ ТОЛ")).unwrap().copy, "");
    }

    #[test]
    fn older_starter_rows_are_upgraded_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let old = "---\nиме: Общи\n---\n\n| Име | Адрес | Бележка |\n|---|---|---|\n| Partsouq | https://partsouq.com/ | Търсене по VIN |\n| БГ ТОЛ | https://www.bgtoll.bg/ | |\n| Свой | https://partsouq.com/en/x | |\n";
        fs::write(dir.path().join("общи.md"), old).unwrap();
        let car = Car { make: "Skoda".into(), vin: "TMBAG7NE1F0098834".into(), plate: "CA1234XX".into(), ..Default::default() };
        let links = for_car(dir.path(), &car);
        assert_eq!(links[0].url, "https://partsouq.com/en/search/all?q=TMBAG7NE1F0098834");
        assert_eq!(links[0].copy, "TMBAG7NE1F0098834");
        assert_eq!((links[1].url.as_str(), links[1].copy.as_str()), ("https://check.bgtoll.bg/", "CA1234XX"));
        assert_eq!((links[2].url.as_str(), links[2].copy.as_str()), ("https://partsouq.com/en/x", ""), "edited rows untouched");
        // No VIN: the old home page stays, nothing to copy.
        let links = for_car(dir.path(), &Car { make: "Skoda".into(), ..Default::default() });
        assert_eq!((links[0].url.as_str(), links[0].copy.as_str()), ("https://partsouq.com/", ""));
        assert_eq!(fs::read_to_string(dir.path().join("общи.md")).unwrap(), old, "file on disk unchanged");
    }

    #[test]
    fn placeholders_are_url_encoded() {
        let car = Car { make: "Mercedes-Benz".into(), engineCode: "OM 651".into(), ..Default::default() };
        assert_eq!(fill("https://x/?q={МАРКА}+{КОД_ДВИГАТЕЛ}", &car), "https://x/?q=Mercedes-Benz+OM+651");
        let bg = Car { plate: "СА 4821 КН".into(), ..Default::default() };
        assert!(fill("{РЕГ_НОМЕР}", &bg).starts_with("%D0%A1"));
    }
}
