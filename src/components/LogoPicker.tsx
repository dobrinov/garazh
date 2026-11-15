import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { api, errorMessage } from "../api";
import { LOGO_PRESETS, svgDataUrl } from "../lib/logos";
import { Icon, useToast } from "./ui";

/**
 * Upload a logo or pick a built-in one. Saves immediately: the logo is a
 * file in the data folder (лого.png / лого.svg …).
 */
export function LogoPicker({ shopName, logo, onChange }: { shopName: string; logo: string | null; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      onChange();
      toast(done);
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    const chosen = await open({ title: "Лого на сервиза", filters: [{ name: "Изображения", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }] });
    if (typeof chosen === "string") await run(() => api.setLogoFile(chosen), "Логото е запазено");
  }

  return (
    <div className="logo-picker">
      <div className="logo-current">
        <div className="logo-preview">{logo ? <img src={logo} alt="Текущо лого" /> : <span className="muted small">Без лого</span>}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="btn" onClick={upload} disabled={busy}><Icon name="upload" />Качи лого…</button>
          {logo && <button type="button" className="btn small danger" onClick={() => run(() => api.clearLogo(), "Логото е премахнато")} disabled={busy}>Премахни</button>}
          <span className="small muted">PNG, JPG, SVG или WEBP до 5 MB.<br />Записва се в папката с данни като „лого“.</span>
        </div>
      </div>
      <div className="small muted">Нямате лого? Изберете едно от тези:</div>
      <div className="logo-grid" role="list">
        {LOGO_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="listitem"
            className="logo-option"
            disabled={busy}
            title={p.label}
            aria-label={`Използвай лого: ${p.label}`}
            onClick={() => run(() => api.setLogoSvg(p.svg(shopName)), `Избрано лого: ${p.label}`)}
          >
            <img src={svgDataUrl(p.svg(shopName))} alt="" />
            <span className="small">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
