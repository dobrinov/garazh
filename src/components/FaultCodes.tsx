import { useState } from "react";
import { api, errorMessage, FaultScan, FileInfo } from "../api";
import { Icon, useToast } from "./ui";

/** Reads fault codes from the PDF files of a repair or report. */
export function FaultCodes({ files, onCodes }: { files: FileInfo[]; onCodes?: (codes: FaultScan["codes"]) => void }) {
  const toast = useToast();
  const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  const [scans, setScans] = useState<FaultScan[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (pdfs.length === 0) return null;

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
                    <td>
                      <button className="btn small icon-btn" title="Търси в интернет" aria-label={`Търси ${c.code} в интернет`} onClick={() => api.openUrl(`https://www.google.com/search?q=${encodeURIComponent(c.code)}`)}>
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
