import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { api, AppConfig, errorMessage } from "../api";
import { Icon } from "../components/ui";

export function Setup({ onDone }: { onDone: (c: AppConfig) => void }) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const chosen = await open({ directory: true, title: "Изберете папка за данните" });
    if (typeof chosen === "string") setPath(chosen);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.setDataDir(path));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card pad" style={{ maxWidth: 620, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="row">
          <div className="brand-mark"><Icon name="wrench" color="#fff" size={20} /></div>
          <h1>Добре дошли</h1>
        </div>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Изберете папка, в която програмата да пази данните. Всичко се записва като обикновени папки и текстови
          файлове, които можете да разглеждате с Explorer и Notepad. Препоръка: папка в OneDrive или на друг диск,
          например <span className="mono">D:\Сервиз\Данни</span>.
        </p>
        <div className="row">
          <input className="input grow mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="D:\Сервиз\Данни" aria-label="Папка за данните" />
          <button className="btn" onClick={pick}><Icon name="folder" />Избери…</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Ако папката вече съдържа данни от програмата, те ще бъдат заредени. Нищо съществуващо не се изтрива.
        </p>
        {error && <div className="note bad">{error}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" disabled={!path.trim() || busy} onClick={save}>Започни</button>
        </div>
      </div>
    </div>
  );
}
