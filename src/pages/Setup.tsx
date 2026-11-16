import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { api, AppConfig, errorMessage } from "../api";
import { BrandMark } from "../components/brand";
import { applyBusiness, BusinessPicker } from "../components/Business";
import { CAR, defaultChoices, planChange } from "../lib/business";
import { LogoPicker } from "../components/LogoPicker";
import { Icon } from "../components/ui";

/**
 * First start: 1) where to keep the data, 2) what the shop does, 3) its name
 * and logo. A folder that already has data (a second computer) skips 2: the
 * business is in its сервиз.md, or the "Днес" card asks about it.
 */
export function Setup({ onDone, missingDir = null }: { onDone: (c: AppConfig) => void; missingDir?: string | null }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [business, setBusiness] = useState(CAR);
  const [extras, setExtras] = useState<string[]>([]);
  const [hasData, setHasData] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [path, setPath] = useState(missingDir ?? "");
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const chosen = await open({ directory: true, title: "Изберете папка за данните" });
    if (typeof chosen === "string") setPath(chosen);
  }

  async function chooseFolder() {
    setBusy(true);
    setError(null);
    try {
      const c = await api.setDataDir(path);
      setConfig(c);
      // An existing data folder already has a name and maybe a logo.
      const shop = await api.getShop();
      setName(shop.data.name === "Автосервиз" ? "" : shop.data.name);
      setLogo(await api.getLogo());
      const c2 = shop.data.counters;
      const existing = !!shop.data.businessType || c2.client > 0 || c2.workOrder > 0 || c2.quote > 0;
      setHasData(existing);
      setStep(existing ? 3 : 2);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      const shop = await api.getShop();
      await api.saveShop({ data: { ...shop.data, name: name.trim() || "Автосервиз" }, notes: shop.notes, baseHash: shop.hash });
      if (!hasData) {
        // A new folder: everything the business sets up, nothing to keep.
        const plan = planChange(shop.data, [], business, extras);
        await applyBusiness(plan, defaultChoices(plan));
      }
      onDone(config);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card pad" style={{ maxWidth: step === 2 ? 1040 : 660, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            {step === 3 && logo ? <BrandMark logo={logo} /> : <div className="brand-mark"><Icon name="wrench" color="#fff" size={20} /></div>}
            <h1>{step === 1 ? "Добре дошли в Гараж" : step === 2 ? "С какво се занимава сервизът?" : "Вашият сервиз"}</h1>
          </div>
          <span className="muted small">Стъпка {hasData && step === 3 ? 2 : step} от {hasData ? 2 : 3}</span>
        </div>

        {step === 1 ? (
          <>
            {missingDir && (
              <div className="note bad">
                Папката с данни <span className="mono">{missingDir}</span> не е намерена. Ако е на външен диск или в
                OneDrive, свържете го и рестартирайте програмата. Иначе изберете друга папка или натиснете „Напред“,
                за да създадете нова празна папка на същото място.
              </div>
            )}
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
              <button className="btn primary" disabled={!path.trim() || busy} onClick={chooseFolder}>Напред</button>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Програмата ще кръсти колоните на таблото, ще предложи обичайните ви работи и ще включи нужните функции. Всичко се
              променя по-късно от Настройки.
            </p>
            <BusinessPicker value={business} extras={extras} onChange={(v, x) => { setBusiness(v); setExtras(x); }} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => setStep(1)}>Назад</button>
              <button className="btn primary" onClick={() => setStep(3)}>Напред</button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              Име на сервиза
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Автосервиз Петров" autoFocus />
              <span className="hint">Показва се в менюто и на работните карти, офертите и докладите.</span>
            </label>
            <div className="field">
              Лого
              <LogoPicker shopName={name || "Автосервиз"} logo={logo} onChange={() => api.getLogo().then(setLogo)} />
            </div>
            <p className="muted small" style={{ margin: 0 }}>Можете да промените името и логото по-късно от Настройки.</p>
            {error && <div className="note bad">{error}</div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => setStep(hasData ? 1 : 2)} disabled={busy}>Назад</button>
              <button className="btn primary" onClick={finish} disabled={busy}>Готово</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
