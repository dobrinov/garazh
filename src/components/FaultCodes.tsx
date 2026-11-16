import { useState } from "react";
import { api, errorMessage, FaultScan, FileInfo } from "../api";
import { Icon, useToast } from "./ui";

/** Reads fault codes from the PDF files of a repair or report. */
/** Generic (SAE) codes have the same meaning on every car; obd-codes.com describes them. */
export function isGenericCode(code: string): boolean {
  return /^(P0|P2|U0)[0-9A-F]{3}$/i.test(code.trim());
}

export function faultSearchUrl(code: string, make = "", model = ""): string {
  return `https://www.google.com/search?q=${encodeURIComponent([code, make, model].filter((s) => s.trim()).join(" "))}`;
}

export function FaultCodes({ files, onCodes, make = "", model = "" }: { files: FileInfo[]; onCodes?: (codes: FaultScan["codes"]) => void; make?: string; model?: string }) {
  const toast = useToast();
  const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  const [scans, setScans] = useState<FaultScan[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (pdfs.length === 0) return null;
  const open = (url: string) => api.openUrl(url).catch((e) => toast(errorMessage(e), true));

  async function scan() {
    setBusy(true);
    try {
      const out: FaultScan[] = [];
      for (const f of pdfs) out.push(await api.scanFaultCodes(f.path));
      setScans(out);
      const codes = out.flatMap((s) => s.codes);
      onCodes?.(codes);
      if (codes.length === 0) toast("Не са намерени кодове за грешки в PDF файловете");
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row">
        <button className="btn small" onClick={scan} disabled={busy}>
          <Icon name="scan" size={15} />{busy ? "Четене…" : `Прочети кодовете за грешки от PDF (${pdfs.length})`}
        </button>
      </div>
      {scans?.map((s) => (
        <div key={s.file}>
          <div className="small muted">{s.file.split(/[\\/]/).pop()}</div>
          {s.error && <div className="note bad small">{s.error}</div>}
          {!s.error && !s.hasText && <div className="note warn small">PDF файлът няма текст (вероятно е сканиран) – кодовете не могат да се прочетат.</div>}
          {s.codes.length > 0 && (
            <table className="tbl">
              <tbody>
                {s.codes.map((c) => (
                  <tr key={c.code}>
                    <td className="mono nowrap"><strong>{c.code}</strong></td>
                    <td className="small muted nowrap">{c.system}</td>
                    <td className="small">{c.text}</td>
                    <td className="nowrap right">
                      {isGenericCode(c.code) && (
                        <button className="btn small icon-btn" title="Описание на кода (obd-codes.com)" aria-label={`Описание на ${c.code}`} onClick={() => open(`https://www.obd-codes.com/${c.code.toLowerCase()}`)}>
                          <Icon name="link" size={14} />
                        </button>
                      )}
                      <button
                        className="btn small icon-btn"
                        title={`Търси ${[c.code, make, model].filter(Boolean).join(" ")} в Google`}
                        aria-label={`Търси ${c.code} в интернет`}
                        onClick={() => open(faultSearchUrl(c.code, make, model))}
                      >
                        <Icon name="search" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
