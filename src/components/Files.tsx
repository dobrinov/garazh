import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { api, errorMessage, FileInfo } from "../api";
import { bytes } from "../lib/format";
import { Icon, useToast } from "./ui";

/** Drop zone + list. Files are copied as-is into the record's folder. */
export function Files({
  files,
  target,
  id,
  onChange,
  hint,
}: {
  files: FileInfo[];
  target: "car" | "order";
  id: string;
  onChange: () => void;
  hint?: string;
}) {
  const toast = useToast();
  const [over, setOver] = useState(false);

  async function attach(paths: string[]) {
    if (!paths.length) return;
    try {
      const added = await api.attachFiles(target, id, paths);
      toast(added.length === 1 ? `Добавен: ${added[0].name}` : `Добавени ${added.length} файла`);
      onChange();
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") setOver(true);
        else if (p.type === "leave") setOver(false);
        else if (p.type === "drop") {
          setOver(false);
          attach(p.paths);
        }
      })
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, id]);

  async function pick() {
    const chosen = await open({ multiple: true, title: "Изберете файлове", filters: [{ name: "Документи", extensions: ["pdf", "jpg", "jpeg", "png", "heic", "txt", "csv", "xlsx", "docx"] }, { name: "Всички", extensions: ["*"] }] });
    if (Array.isArray(chosen)) attach(chosen);
    else if (typeof chosen === "string") attach([chosen]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className={`drop ${over ? "over" : ""}`}>
        <Icon name="upload" size={26} color="var(--muted)" />
        <div style={{ fontWeight: 600, color: "var(--ink)", marginTop: 6 }}>Пуснете файлове тук или <button className="btn ghost small" style={{ padding: 0, minHeight: 0 }} onClick={pick}>изберете от компютъра</button></div>
        <div className="small">{hint ?? "PDF от диагностика, снимки, документи – пазят се в оригиналния си вид"}</div>
      </div>
      {files.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {files.map((f) => {
            const ext = (f.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
            return (
              <div key={f.path} className="file">
                <div className="ext" style={ext === "PDF" ? undefined : { background: "var(--info-bg)", color: "var(--info)" }}>{ext}</div>
                <div className="grow">
                  <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{f.name}</div>
                  <div className="small muted">{f.modified ?? ""} · {bytes(f.size)}</div>
                </div>
                <button className="btn small" onClick={() => api.openPath(f.path)}>Отвори</button>
                <button className="btn small icon-btn" aria-label={`Покажи ${f.name} в папката`} title="Покажи в папката" onClick={() => api.revealPath(f.path)}><Icon name="folder" size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
