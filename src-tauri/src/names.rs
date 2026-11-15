//! Folder names that are readable, sort well in Explorer and are legal on Windows.

const MAX_CHARS: usize = 60;
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Replace characters Windows forbids, collapse spaces, cut to 60 characters.
pub fn sanitize(s: &str) -> String {
    let replaced: String = s
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { ' ' } else { c })
        .collect();
    let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let cut: String = collapsed.chars().take(MAX_CHARS).collect();
    let mut out = cut.trim_end_matches(['.', ' ']).to_string();
    if out.is_empty() {
        out = "без име".into();
    }
    if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(&out)) {
        out.push('_');
    }
    out
}

/// "СА 4821 КН" → "СА4821КН"
pub fn plate_compact(plate: &str) -> String {
    plate.chars().filter(|c| !c.is_whitespace() && *c != '-').collect::<String>().to_uppercase()
}

pub fn client_folder(number: u32, name: &str) -> String {
    sanitize(&format!("{number:04} {name}"))
}

pub fn car_folder(plate: &str, make: &str, model: &str) -> String {
    let p = plate_compact(plate);
    let label = format!("{} {} {}", if p.is_empty() { "БЕЗ-НОМЕР".to_string() } else { p }, make, model);
    sanitize(&label)
}

pub fn order_folder(date: &str, number: &str, title: &str) -> String {
    sanitize(&format!("{date} {number} {title}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forbidden_characters_are_replaced() {
        assert_eq!(sanitize("Транс: \"Логистик\" ЕООД / клон?"), "Транс Логистик ЕООД клон");
    }

    #[test]
    fn names_are_cut_and_never_empty_or_reserved() {
        assert_eq!(sanitize(&"а".repeat(100)).chars().count(), 60);
        assert_eq!(sanitize("  ...  "), "без име");
        assert_eq!(sanitize("con"), "con_");
        assert_eq!(sanitize("Ремонт."), "Ремонт");
    }

    #[test]
    fn folder_names_follow_the_plan() {
        assert_eq!(client_folder(1, "Иван Петров"), "0001 Иван Петров");
        assert_eq!(car_folder("СА 4821 КН", "VW", "Golf VII"), "СА4821КН VW Golf VII");
        assert_eq!(car_folder("", "Škoda", "Fabia"), "БЕЗ-НОМЕР Škoda Fabia");
        assert_eq!(order_folder("2026-11-02", "РК-2026-0412", "Диагностика P2002"), "2026-11-02 РК-2026-0412 Диагностика P2002");
    }
}
