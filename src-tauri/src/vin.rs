//! VIN decoding.
//!
//! Basic decoding is local and works offline: the maker from the first
//! characters (WMI), the model year from position 10 and, for the VW group,
//! the model from positions 7–8. Engine and gearbox are not encoded in a
//! European VIN in a standard way, so they come from an online service
//! (switched on in Settings) and every answer is cached in the data folder.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

/// One decoded value and where it came from.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VinField {
    /// Car field name (camelCase, as in `model::Car`).
    pub field: String,
    pub value: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VinResult {
    pub vin: String,
    pub valid: bool,
    pub country: String,
    pub fields: Vec<VinField>,
    pub warnings: Vec<String>,
    /// True when the online lookup was used (or answered from its cache).
    pub online: bool,
}

const TRANSLIT: &[(char, u32)] = &[
    ('A', 1), ('B', 2), ('C', 3), ('D', 4), ('E', 5), ('F', 6), ('G', 7), ('H', 8),
    ('J', 1), ('K', 2), ('L', 3), ('M', 4), ('N', 5), ('P', 7), ('R', 9),
    ('S', 2), ('T', 3), ('U', 4), ('V', 5), ('W', 6), ('X', 7), ('Y', 8), ('Z', 9),
];
const WEIGHTS: [u32; 17] = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

pub fn normalize(vin: &str) -> String {
    vin.chars().filter(|c| !c.is_whitespace() && *c != '-').collect::<String>().to_uppercase()
}

/// The North American check digit (position 9). European makers often
/// do not use it, so a mismatch is only a hint.
pub fn check_digit_ok(vin: &str) -> bool {
    let mut sum = 0;
    for (i, c) in vin.chars().enumerate() {
        let v = if let Some(d) = c.to_digit(10) {
            d
        } else if let Some((_, v)) = TRANSLIT.iter().find(|(ch, _)| *ch == c) {
            *v
        } else {
            return false;
        };
        sum += v * WEIGHTS[i];
    }
    let expected = match sum % 11 {
        10 => 'X',
        n => char::from_digit(n, 10).unwrap(),
    };
    vin.chars().nth(8) == Some(expected)
}

/// Maker by world manufacturer identifier. Longest prefix wins.
const WMI: &[(&str, &str)] = &[
    ("WVW", "Volkswagen"), ("WVG", "Volkswagen"), ("WV1", "Volkswagen"), ("WV2", "Volkswagen"), ("WV3", "Volkswagen"),
    ("1VW", "Volkswagen"), ("3VW", "Volkswagen"), ("VWV", "Volkswagen"), ("AAV", "Volkswagen"),
    ("WAU", "Audi"), ("WUA", "Audi"), ("TRU", "Audi"), ("WA1", "Audi"),
    ("TMB", "Škoda"), ("TMP", "Škoda"),
    ("VSS", "SEAT"), ("VS6", "SEAT"), ("VSE", "SEAT"),
    ("WBA", "BMW"), ("WBS", "BMW"), ("WBY", "BMW"), ("WBX", "BMW"), ("5UX", "BMW"), ("4US", "BMW"),
    ("WMW", "MINI"),
    ("WDB", "Mercedes-Benz"), ("WDD", "Mercedes-Benz"), ("WDC", "Mercedes-Benz"), ("WDF", "Mercedes-Benz"),
    ("W1K", "Mercedes-Benz"), ("W1N", "Mercedes-Benz"), ("W1V", "Mercedes-Benz"), ("W1W", "Mercedes-Benz"), ("VSA", "Mercedes-Benz"),
    ("WP0", "Porsche"), ("WP1", "Porsche"),
    ("W0L", "Opel"), ("W0V", "Opel"), ("VXK", "Opel"), ("W0X", "Opel"),
    ("WF0", "Ford"), ("WF1", "Ford"), ("NM0", "Ford"), ("1FA", "Ford"), ("1FM", "Ford"),
    ("VF1", "Renault"), ("VF2", "Renault"), ("VF6", "Renault"), ("VF8", "Renault"),
    ("UU1", "Dacia"), ("UU3", "Dacia"),
    ("VF3", "Peugeot"), ("VR3", "Peugeot"),
    ("VF7", "Citroën"), ("VR7", "Citroën"),
    ("VR1", "DS"),
    ("ZFA", "Fiat"), ("ZFC", "Fiat"), ("NM4", "Fiat"),
    ("ZAR", "Alfa Romeo"), ("ZLA", "Lancia"), ("ZAC", "Jeep"), ("1C4", "Jeep"),
    ("JTD", "Toyota"), ("JTE", "Toyota"), ("JTN", "Toyota"), ("JTM", "Toyota"), ("JTH", "Lexus"),
    ("SB1", "Toyota"), ("VNK", "Toyota"), ("NMT", "Toyota"), ("TW1", "Toyota"), ("YAR", "Toyota"),
    ("KMH", "Hyundai"), ("TMA", "Hyundai"), ("NLH", "Hyundai"), ("MAL", "Hyundai"),
    ("KNA", "Kia"), ("KNE", "Kia"), ("KND", "Kia"), ("U5Y", "Kia"), ("U6Y", "Kia"),
    ("VSK", "Nissan"), ("SJN", "Nissan"), ("JN1", "Nissan"), ("JN8", "Nissan"),
    ("JMZ", "Mazda"), ("JM1", "Mazda"),
    ("JHM", "Honda"), ("SHH", "Honda"), ("SHS", "Honda"),
    ("YV1", "Volvo"), ("YV4", "Volvo"), ("LYV", "Volvo"),
    ("SAJ", "Jaguar"), ("SAL", "Land Rover"),
    ("JSA", "Suzuki"), ("TSM", "Suzuki"), ("JS2", "Suzuki"),
    ("JMB", "Mitsubishi"), ("JA3", "Mitsubishi"), ("XMC", "Mitsubishi"),
    ("JF1", "Subaru"), ("JF2", "Subaru"),
    ("TMK", "Hyundai"),
    ("LRW", "Tesla"), ("5YJ", "Tesla"), ("XP7", "Tesla"),
];

fn country(vin: &str) -> &'static str {
    let c1 = vin.chars().next().unwrap_or(' ');
    let c2 = vin.chars().nth(1).unwrap_or(' ');
    match (c1, c2) {
        ('W', _) => "Германия",
        ('V', 'F'..='R') => "Франция",
        ('V', 'S'..='W') => "Испания",
        ('V', 'X') => "Франция",
        ('T', 'R') => "Унгария",
        ('T', 'J'..='V') => "Чехия",
        ('T', 'W'..='Z') => "Португалия",
        ('U', 'U') => "Румъния",
        ('U', '5'..='7') => "Словакия",
        ('Z', _) => "Италия",
        ('S', 'A'..='M') => "Великобритания",
        ('S', 'U'..='Z') => "Полша",
        ('Y', 'S'..='W') => "Швеция",
        ('N', 'L'..='R') => "Турция",
        ('J', _) => "Япония",
        ('K', 'L'..='R') => "Южна Корея",
        ('L', _) => "Китай",
        ('1' | '4' | '5', _) => "САЩ",
        ('2', _) => "Канада",
        ('3', _) => "Мексико",
        _ => "",
    }
}

/// VW-group model code in positions 7–8. Only the common ones; a guess
/// the user confirms, never a certainty.
const VAG_MODELS: &[(&str, &str, &str)] = &[
    ("Volkswagen", "1J", "Golf IV"), ("Volkswagen", "1K", "Golf V"), ("Volkswagen", "5K", "Golf VI"),
    ("Volkswagen", "AU", "Golf VII"), ("Volkswagen", "5G", "Golf VII"), ("Volkswagen", "CD", "Golf VIII"),
    ("Volkswagen", "3B", "Passat B5"), ("Volkswagen", "3C", "Passat B6/B7"), ("Volkswagen", "3G", "Passat B8"),
    ("Volkswagen", "6R", "Polo V"), ("Volkswagen", "AW", "Polo VI"), ("Volkswagen", "5N", "Tiguan I"),
    ("Volkswagen", "AD", "Tiguan II"), ("Volkswagen", "1T", "Touran"), ("Volkswagen", "7H", "Transporter T5"),
    ("Volkswagen", "SH", "Transporter T6"), ("Volkswagen", "2K", "Caddy"), ("Volkswagen", "7P", "Touareg II"),
    ("Volkswagen", "A1", "T-Roc"), ("Volkswagen", "3H", "Arteon"),
    ("Škoda", "1Z", "Octavia II"), ("Škoda", "5E", "Octavia III"), ("Škoda", "NE", "Octavia III"), ("Škoda", "NX", "Octavia IV"),
    ("Škoda", "3T", "Superb II"), ("Škoda", "3V", "Superb III"), ("Škoda", "5J", "Fabia II / Roomster"),
    ("Škoda", "NJ", "Fabia III"), ("Škoda", "NS", "Kodiaq"), ("Škoda", "NU", "Karoq"), ("Škoda", "NH", "Rapid"),
    ("Škoda", "5L", "Yeti"),
    ("Audi", "8P", "A3 (8P)"), ("Audi", "8V", "A3 (8V)"), ("Audi", "8K", "A4 (B8)"), ("Audi", "8W", "A4 (B9)"),
    ("Audi", "4G", "A6 (C7)"), ("Audi", "4F", "A6 (C6)"), ("Audi", "8U", "Q3"), ("Audi", "8R", "Q5"),
    ("SEAT", "1P", "Leon II"), ("SEAT", "5F", "Leon III"), ("SEAT", "6J", "Ibiza IV"), ("SEAT", "KJ", "Ibiza V"),
];

/// Model year letter in position 10, repeating every 30 years. Picks the
/// latest year up to the current one (a repair shop sees next year's models rarely).
pub fn model_year(c: char, this_year: i32) -> Option<i32> {
    const CODES: &str = "ABCDEFGHJKLMNPRSTVWXY123456789";
    let idx = CODES.find(c)? as i32;
    let mut y = 1980 + idx;
    while y + 30 <= this_year {
        y += 30;
    }
    Some(y)
}

pub fn decode_local(raw: &str, this_year: i32) -> VinResult {
    let vin = normalize(raw);
    let mut r = VinResult { vin: vin.clone(), ..Default::default() };
    if vin.len() != 17 {
        r.warnings.push(format!("VIN трябва да е 17 знака, въведени са {}", vin.chars().count()));
        return r;
    }
    if let Some(bad) = vin.chars().find(|c| !c.is_ascii_alphanumeric() || matches!(c, 'I' | 'O' | 'Q')) {
        r.warnings.push(format!("Знакът „{bad}“ не се използва във VIN (често е 0 или 1)"));
        return r;
    }
    r.valid = true;
    r.country = country(&vin).to_string();
    let src = "VIN (локално)".to_string();
    let make = WMI
        .iter()
        .filter(|(p, _)| vin.starts_with(p))
        .max_by_key(|(p, _)| p.len())
        .map(|(_, m)| m.to_string());
    if let Some(m) = &make {
        r.fields.push(VinField { field: "make".into(), value: m.clone(), source: src.clone() });
        let code = &vin[6..8];
        if let Some((_, _, model)) = VAG_MODELS.iter().find(|(mk, c, _)| mk == m && *c == code) {
            r.fields.push(VinField { field: "model".into(), value: model.to_string(), source: src.clone() });
        }
    } else {
        r.warnings.push(format!("Непознат производител ({})", &vin[..3]));
    }
    // Most European makers fill position 10 with the model year; some older
    // ones put a filler there (often Z), which gives no year.
    let c10 = vin.chars().nth(9).unwrap();
    if c10 != 'Z' && c10 != '0' {
        if let Some(y) = model_year(c10, this_year) {
            r.fields.push(VinField { field: "year".into(), value: y.to_string(), source: src.clone() });
        }
    }
    let american = matches!(vin.chars().next(), Some('1'..='5'));
    if american && !check_digit_ok(&vin) {
        r.warnings.push("Контролната цифра (9-и знак) не съвпада – проверете VIN за грешка".into());
    }
    r
}

// ---------- online (NHTSA vPIC) ----------

pub const NHTSA: &str = "NHTSA vPIC";

fn nhtsa_url(vin: &str) -> String {
    format!("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/{vin}?format=json")
}

/// Turn a vPIC answer into car fields. Values vPIC does not know come back
/// empty and are skipped.
pub fn fields_from_nhtsa(answer: &Value) -> Vec<VinField> {
    let Some(row) = answer.get("Results").and_then(|r| r.get(0)) else { return vec![] };
    let get = |k: &str| row.get(k).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty() && *s != "Not Applicable").map(str::to_string);
    let src = NHTSA.to_string();
    let mut out = Vec::new();
    let mut push = |field: &str, value: Option<String>| {
        if let Some(v) = value {
            out.push(VinField { field: field.into(), value: v, source: src.clone() });
        }
    };
    push("make", get("Make").map(|m| title_case(&m)));
    push("model", get("Model"));
    push("year", get("ModelYear"));
    let engine = {
        let litres = get("DisplacementL").and_then(|l| l.parse::<f64>().ok()).map(|l| format!("{l:.1}"));
        let kw = get("EngineKW").and_then(|k| k.parse::<f64>().ok()).map(|k| format!("{} kW", k.round()));
        let cyl = get("EngineCylinders").map(|c| format!("{c} цил."));
        let parts: Vec<String> = [litres, cyl, kw].into_iter().flatten().collect();
        (!parts.is_empty()).then(|| parts.join(" "))
    };
    push("engine", engine);
    push("engineCode", get("EngineModel"));
    push("fuel", get("FuelTypePrimary").map(|f| fuel_bg(&f)));
    let gearbox = match (get("TransmissionStyle"), get("TransmissionSpeeds")) {
        (Some(s), Some(n)) => Some(format!("{} {n} ст.", gearbox_bg(&s))),
        (Some(s), None) => Some(gearbox_bg(&s)),
        _ => None,
    };
    push("gearbox", gearbox);
    out
}

fn title_case(s: &str) -> String {
    if s.len() <= 3 {
        return s.to_string(); // BMW, KIA
    }
    s.split(' ')
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + &c.as_str().to_lowercase(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
        .replace("Mercedes-benz", "Mercedes-Benz")
}

fn fuel_bg(f: &str) -> String {
    let l = f.to_lowercase();
    if l.contains("diesel") {
        "дизел"
    } else if l.contains("electric") {
        "електрически"
    } else if l.contains("gasoline") || l.contains("petrol") {
        "бензин"
    } else {
        return f.to_string();
    }
    .into()
}

fn gearbox_bg(s: &str) -> String {
    let l = s.to_lowercase();
    if l.contains("dual") || l.contains("dct") {
        "автоматична с два съединителя".into()
    } else if l.contains("cvt") || l.contains("continuously") {
        "CVT".into()
    } else if l.contains("manual") {
        "ръчна".into()
    } else if l.contains("auto") {
        "автоматична".into()
    } else {
        s.to_string()
    }
}

/// Fetch (or read from cache) the vPIC answer for `vin`. The raw answer is
/// kept in `cache_dir\<VIN>.json` so a car decoded once never needs the
/// network again.
pub fn lookup_nhtsa(vin: &str, cache_dir: &Path) -> Result<Value, String> {
    let file = cache_dir.join(format!("{vin}.json"));
    if let Ok(text) = std::fs::read_to_string(&file) {
        if let Ok(v) = serde_json::from_str(&text) {
            return Ok(v);
        }
    }
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(15)).build();
    let resp = agent.get(&nhtsa_url(vin)).call().map_err(|e| format!("Няма връзка с {NHTSA}: {e}"))?;
    let v: Value = resp.into_json().map_err(|e| format!("Неочакван отговор от {NHTSA}: {e}"))?;
    std::fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let pretty = serde_json::to_string_pretty(&v).unwrap_or_default();
    crate::md::write_atomic(&file, &pretty).map_err(|e| e.to_string())?;
    Ok(v)
}

/// Combine local and online fields. The local decoding wins where both
/// have a value (its tables are better for European cars); online answers
/// add what the VIN alone cannot tell, such as engine and gearbox.
pub fn merge(mut local: VinResult, online: Vec<VinField>) -> VinResult {
    local.online = true;
    for f in online {
        match local.fields.iter().find(|x| x.field == f.field) {
            Some(existing) => {
                if f.field == "make" && !existing.value.eq_ignore_ascii_case(&f.value) {
                    local.warnings.push(format!("{NHTSA} дава марка „{}“", f.value));
                }
            }
            None => local.fields.push(f),
        }
    }
    local
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field<'a>(r: &'a VinResult, name: &str) -> Option<&'a str> {
        r.fields.iter().find(|f| f.field == name).map(|f| f.value.as_str())
    }

    #[test]
    fn decodes_a_vw_golf_locally() {
        let r = decode_local("wvwzzzauzgw123456", 2026);
        assert!(r.valid);
        assert_eq!(field(&r, "make"), Some("Volkswagen"));
        assert_eq!(field(&r, "model"), Some("Golf VII"));
        assert_eq!(field(&r, "year"), Some("2016"));
        assert_eq!(r.country, "Германия");
    }

    #[test]
    fn skoda_and_bmw() {
        let r = decode_local("TMBAG7NE1F0098834", 2026);
        assert_eq!(field(&r, "make"), Some("Škoda"));
        assert_eq!(field(&r, "model"), Some("Octavia III"));
        assert_eq!(field(&r, "year"), Some("2015"));
        let b = decode_local("WBA3D31070F612840", 2026);
        assert_eq!(field(&b, "make"), Some("BMW"));
        assert_eq!(field(&b, "model"), None);
    }

    #[test]
    fn rejects_bad_vins() {
        assert!(!decode_local("WVWZZZ", 2026).valid);
        let r = decode_local("WVWZZZAUZGW12345O", 2026);
        assert!(!r.valid);
        assert!(r.warnings[0].contains('O'));
    }

    #[test]
    fn model_year_cycle() {
        assert_eq!(model_year('A', 2026), Some(2010));
        assert_eq!(model_year('T', 2026), Some(2026));
        assert_eq!(model_year('V', 2026), Some(1997));
        assert_eq!(model_year('9', 2026), Some(2009));
        assert_eq!(model_year('I', 2026), None);
    }

    #[test]
    fn check_digit() {
        assert!(check_digit_ok("1M8GDM9AXKP042788"));
        assert!(!check_digit_ok("1M8GDM9A1KP042788"));
    }

    #[test]
    fn nhtsa_answer_maps_to_fields() {
        let v: Value = serde_json::json!({"Results": [{
            "Make": "VOLKSWAGEN", "Model": "Golf", "ModelYear": "2016",
            "DisplacementL": "1.968", "EngineCylinders": "4", "EngineKW": "110.3",
            "EngineModel": "CRLB", "FuelTypePrimary": "Diesel",
            "TransmissionStyle": "Dual-Clutch Transmission (DCT)", "TransmissionSpeeds": "6",
            "Series": ""
        }]});
        let f = fields_from_nhtsa(&v);
        let get = |n: &str| f.iter().find(|x| x.field == n).map(|x| x.value.clone());
        assert_eq!(get("make").as_deref(), Some("Volkswagen"));
        assert_eq!(get("engine").as_deref(), Some("2.0 4 цил. 110 kW"));
        assert_eq!(get("engineCode").as_deref(), Some("CRLB"));
        assert_eq!(get("fuel").as_deref(), Some("дизел"));
        assert_eq!(get("gearbox").as_deref(), Some("автоматична с два съединителя 6 ст."));
        let merged = merge(decode_local("WVWZZZAUZGW123456", 2026), f);
        assert_eq!(field(&merged, "model"), Some("Golf VII"));
        assert_eq!(field(&merged, "engineCode"), Some("CRLB"));
        assert_eq!(field(&merged, "make"), Some("Volkswagen"));
        assert!(merged.online);
    }
}
