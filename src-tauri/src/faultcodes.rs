//! Fault codes read from the text layer of diagnostic scanner PDFs.
//! Scanned images without text need OCR, which is out of scope.

use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FaultCode {
    /// e.g. "P2002"
    pub code: String,
    /// "двигател/трансмисия" | "каросерия" | "шаси" | "мрежа"
    pub system: String,
    /// The line of the report the code was found on, as the scanner wrote it.
    pub text: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FaultScan {
    pub file: String,
    pub codes: Vec<FaultCode>,
    /// False when the PDF has no text layer (a scan) or could not be read.
    pub hasText: bool,
    pub error: Option<String>,
}

fn system(c: char) -> &'static str {
    match c {
        'P' => "двигател / трансмисия",
        'B' => "каросерия",
        'C' => "шаси",
        'U' => "комуникация",
        _ => "",
    }
}

fn is_code(w: &[char]) -> bool {
    w.len() == 5
        && matches!(w[0], 'P' | 'B' | 'C' | 'U')
        && matches!(w[1], '0'..='3')
        && w[2..].iter().all(|c| c.is_ascii_digit() || ('A'..='F').contains(c))
        // A plain number like "C2000" in a part number is rare but possible;
        // require at least one digit after the first two characters.
        && w[2..].iter().any(|c| c.is_ascii_digit())
}

/// Find codes in plain text. Each code is reported once, with the first line
/// it appears on.
pub fn find_codes(text: &str) -> Vec<FaultCode> {
    let mut out: Vec<FaultCode> = Vec::new();
    for line in text.lines() {
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        while i + 5 <= chars.len() {
            let before_ok = i == 0 || !chars[i - 1].is_alphanumeric();
            let after_ok = i + 5 == chars.len() || !chars[i + 5].is_alphanumeric();
            if before_ok && after_ok && is_code(&chars[i..i + 5]) {
                let code: String = chars[i..i + 5].iter().collect();
                if !out.iter().any(|c| c.code == code) {
                    let text = line.split_whitespace().collect::<Vec<_>>().join(" ");
                    out.push(FaultCode { system: system(chars[i]).into(), code, text });
                }
                i += 5;
            } else {
                i += 1;
            }
        }
    }
    out
}

pub fn scan_pdf(path: &Path) -> FaultScan {
    let mut r = FaultScan { file: path.to_string_lossy().to_string(), ..Default::default() };
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            r.error = Some(e.to_string());
            return r;
        }
    };
    // The PDF library can panic on malformed files; never let that take the app down.
    let result = std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem(&bytes));
    match result {
        Ok(Ok(text)) => {
            r.hasText = text.chars().any(|c| c.is_alphanumeric());
            r.codes = find_codes(&text);
        }
        Ok(Err(e)) => r.error = Some(format!("PDF файлът не може да се прочете: {e}")),
        Err(_) => r.error = Some("PDF файлът не може да се прочете".into()),
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_codes_with_their_lines() {
        let text = "Двигател (01)\nP2002 Филтър твърди частици, банк 1 – ефективност под прага   статичен\nU0100 Lost communication with ECM\nP2002 повторно\nКат. номер 04L906051L, P20 02, XP0420, C1234 ABS\n";
        let c = find_codes(text);
        let codes: Vec<&str> = c.iter().map(|x| x.code.as_str()).collect();
        assert_eq!(codes, vec!["P2002", "U0100", "C1234"]);
        assert_eq!(c[0].text, "P2002 Филтър твърди частици, банк 1 – ефективност под прага статичен");
        assert_eq!(c[1].system, "комуникация");
    }

    #[test]
    fn rejects_lookalikes() {
        assert!(find_codes("P4000 B5ABC PAAAA P0").is_empty());
    }

    #[test]
    fn unreadable_pdf_is_an_error_not_a_crash() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.pdf");
        std::fs::write(&p, b"not a pdf").unwrap();
        let r = scan_pdf(&p);
        assert!(r.error.is_some());
        assert!(r.codes.is_empty());
    }

    /// A minimal one-page PDF with a text layer, as scanner software writes.
    fn tiny_pdf(lines: &[&str]) -> Vec<u8> {
        let mut content = String::from("BT /F1 11 Tf 50 750 Td 14 TL\n");
        for l in lines {
            content.push_str(&format!("({l}) Tj T*\n"));
        }
        content.push_str("ET");
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>".to_string(),
            format!("<< /Length {} >>\nstream\n{}\nendstream", content.len(), content),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>".to_string(),
        ];
        let mut out = String::from("%PDF-1.4\n");
        let mut offsets = Vec::new();
        for (i, o) in objs.iter().enumerate() {
            offsets.push(out.len());
            out.push_str(&format!("{} 0 obj\n{}\nendobj\n", i + 1, o));
        }
        let xref = out.len();
        out.push_str(&format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1));
        for off in offsets {
            out.push_str(&format!("{off:010} 00000 n \n"));
        }
        out.push_str(&format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n", objs.len() + 1, xref));
        out.into_bytes()
    }

    #[test]
    fn reads_codes_from_a_pdf_text_layer() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Diagnostika.pdf");
        std::fs::write(&p, tiny_pdf(&["Engine (01)", "P2002 Diesel Particulate Filter Efficiency Below Threshold", "P0401 EGR flow insufficient"])).unwrap();
        let r = scan_pdf(&p);
        assert_eq!(r.error, None);
        assert!(r.hasText);
        let codes: Vec<&str> = r.codes.iter().map(|c| c.code.as_str()).collect();
        assert_eq!(codes, vec!["P2002", "P0401"]);
        assert!(r.codes[0].text.contains("Particulate"));
    }
}
