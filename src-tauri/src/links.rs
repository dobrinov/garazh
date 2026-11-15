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

pub fn fill(url: &str, car: &Car) -> String {
    url.replace("{VIN}", &enc(&car.vin))
        .replace("{МАРКА}", &enc(&car.make))
        .replace("{МОДЕЛ}", &enc(&car.model))
        .replace("{ДВИГАТЕЛ}", &enc(&car.engine))
        .replace("{КОД_ДВИГАТЕЛ}", &enc(&car.engineCode))
        .replace("{КОД_КУТИЯ}", &enc(&car.gearboxCode))
        .replace("{РЕГ_НОМЕР}", &enc(&car.plate.replace(' ', "")))
}

fn fill_label(name: &str, car: &Car) -> String {
    name.replace("{VIN}", &car.vin)
        .replace("{МАРКА}", &car.make)
        .replace("{МОДЕЛ}", &car.model)
        .replace("{ДВИГАТЕЛ}", &car.engine)
        .replace("{КОД_ДВИГАТЕЛ}", &car.engineCode)
        .replace("{КОД_КУТИЯ}", &car.gearboxCode)
        .replace("{РЕГ_НОМЕР}", &car.plate)
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
            let (name, url, note) = (g(0), g(1), g(2));
            if name.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) {
                continue;
            }
            let needs_missing = [("{VIN}", &car.vin), ("{КОД_ДВИГАТЕЛ}", &car.engineCode), ("{КОД_КУТИЯ}", &car.gearboxCode), ("{МОДЕЛ}", &car.model), ("{РЕГ_НОМЕР}", &car.plate)]
                .iter()
                .any(|(ph, v)| (url.contains(ph) || name.contains(ph)) && v.trim().is_empty());
            if needs_missing {
                continue;
            }
            let link = Link { name: fill_label(&name, car), url: fill(&url, car), note, group: group.clone(), file: file.clone() };
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
    fn placeholders_are_url_encoded() {
        let car = Car { make: "Mercedes-Benz".into(), engineCode: "OM 651".into(), ..Default::default() };
        assert_eq!(fill("https://x/?q={МАРКА}+{КОД_ДВИГАТЕЛ}", &car), "https://x/?q=Mercedes-Benz+OM+651");
        let bg = Car { plate: "СА 4821 КН".into(), ..Default::default() };
        assert!(fill("{РЕГ_НОМЕР}", &bg).starts_with("%D0%A1"));
    }
}
