import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { api, AppConfig, errorMessage, Loaded, Shop } from "../api";
import { Icon, Loading, TextField, useToast } from "../components/ui";
import { FEATURES, FeatureKey, resolveFeatures, toggle } from "../lib/features";

export function Settings({
  config,
  onConfig,
  onShopName,
  onFeatures,
}: {
  config: AppConfig;
  onConfig: (c: AppConfig) => void;
  onShopName: (n: string) => void;
  onFeatures: (f: Record<string, boolean>) => void;
}) {
  const toast = useToast();
  const [shop, setShop] = useState<Loaded<Shop> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupDir, setBackupDir] = useState(config.backupDir ?? "");
  const [daily, setDaily] = useState(config.backupDaily);
  const [keep, setKeep] = useState(config.backupKeep || 30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getShop().then(setShop).catch((e) => setError(errorMessage(e)));
  }, []);

  if (!shop) return <Loading error={error} />;
  const s = shop.data;
  const set = <K extends keyof Shop>(k: K, v: Shop[K]) => setShop({ ...shop, data: { ...s, [k]: v } });

  async function saveShop() {
    if (!shop) return;
    try {
      const saved = await api.saveShop({ data: shop.data, notes: shop.notes, baseHash: shop.hash });
      setShop(saved);
      onShopName(saved.data.name);
      toast("Данните за сервиза са запазени");
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  async function setFeature(key: FeatureKey, on: boolean) {
    if (!shop) return;
    const features = toggle(shop.data.features ?? {}, key, on);
    try {
      // Save only the switches, on top of the file as it is on disk now.
      const current = await api.getShop();
      const saved = await api.saveShop({ data: { ...current.data, features }, notes: current.notes, baseHash: current.hash });
      setShop({ ...shop, data: { ...shop.data, features: saved.data.features }, hash: saved.hash });
      onFeatures(saved.data.features);
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  async function installReference(overwrite: boolean) {
    if (overwrite && !window.confirm("Примерните файлове ще заменят тези със същото име, включително вашите промени в тях. Продължаване?")) return;
    try {
      const n = await api.installReference(overwrite);
      toast(n ? `Записани файлове: ${n}` : "Всички примерни файлове вече са налице");
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  async function openReference(kind: "schedules" | "links") {
    try {
      await api.openPath(await api.referenceDir(kind));
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  async function changeDataDir() {
    const chosen = await open({ directory: true, title: "Папка с данни" });
    if (typeof chosen !== "string") return;
    try {
      onConfig(await api.setDataDir(chosen));
      toast("Папката с данни е сменена");
      window.location.hash = "#/";
      window.location.reload();
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  async function pickBackup() {
    const chosen = await open({ directory: true, title: "Папка за архиви" });
    if (typeof chosen === "string") setBackupDir(chosen);
  }

  async function saveBackup() {
    try {
      onConfig(await api.setBackup(backupDir || null, daily, keep));
      toast("Настройките за архив са запазени");
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  async function backupNow() {
    setBusy(true);
    try {
      onConfig(await api.setBackup(backupDir || null, daily, keep));
      const path = await api.backupNow();
      onConfig(await api.appConfig());
      toast(`Архивът е създаден: ${path}`);
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <h1>Настройки</h1>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Данни за сервиза</h2>
          <button className="btn primary" onClick={saveShop}>Запази</button>
        </div>
        <div className="grid">
          <TextField label="Име на сервиза" value={s.name} onChange={(v) => set("name", v)} />
          <TextField label="Телефон" value={s.phone} onChange={(v) => set("phone", v)} />
          <TextField label="Адрес" value={s.address} onChange={(v) => set("address", v)} />
          <TextField label="ЕИК" value={s.eik} onChange={(v) => set("eik", v)} mono />
          <TextField label="Цена на труда (€ / час)" value={s.laborRate} onChange={(v) => set("laborRate", v)} mono />
          <TextField label="ДДС (%)" type="number" value={s.vatPercent} onChange={(v) => set("vatPercent", Math.max(0, Number(v) || 0))} />
        </div>
        <label className="check"><input type="checkbox" checked={s.vatRegistered} onChange={(e) => set("vatRegistered", e.target.checked)} />Регистриран по ДДС (начислява се ДДС в работните карти)</label>
        <div className="muted small">Следващ клиент №{s.counters.client + 1} · следваща работна карта №{s.counters.workOrder + 1}</div>
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h2>Функции</h2>
          <div className="muted small">Изключената функция скрива менютата и секциите си. Файловете ѝ остават в папката с данни.</div>
        </div>
        <div className="switches">
          {FEATURES.map((f) => {
            const on = resolveFeatures(s.features)[f.key];
            return (
              <label key={f.key} className={`switch-row ${f.later ? "later" : ""}`}>
                <input type="checkbox" role="switch" checked={on} disabled={f.later} onChange={(e) => setFeature(f.key, e.target.checked)} />
                <span>
                  <strong>{f.label}</strong>
                  {f.later && <span className="badge">скоро</span>}
                  {f.online && <span className="badge warn">интернет</span>}
                  <span className="small muted" style={{ display: "block" }}>{f.description}</span>
                  {f.requires && <span className="small muted" style={{ display: "block" }}>Изисква: {f.requires.map((r) => FEATURES.find((x) => x.key === r)?.label).join(", ")}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>Справочници</h2>
        <div className="muted">
          Графиците за поддръжка и полезните връзки са обикновени файлове в папка „справочници“. Програмата идва с
          примерни графици за често срещани двигатели и кутии – <strong>те не са проверени</strong>. Сверете ги с данните на
          производителя и във всеки проверен файл сменете <span className="mono">проверено: false</span> на <span className="mono">true</span>.
        </div>
        <div className="row">
          <button className="btn" onClick={() => openReference("schedules")}><Icon name="folder" />Графици</button>
          <button className="btn" onClick={() => openReference("links")}><Icon name="folder" />Полезни връзки</button>
          <button className="btn" onClick={() => installReference(false)}>Добави липсващите примерни файлове</button>
          <button className="btn danger" onClick={() => installReference(true)}>Възстанови примерните файлове</button>
        </div>
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>Папка с данни</h2>
        <div className="row">
          <input className="input grow mono" readOnly value={config.dataDir ?? ""} aria-label="Папка с данни" />
          <button className="btn" onClick={() => config.dataDir && api.openPath(config.dataDir)}><Icon name="folder" />Отвори в Explorer</button>
          <button className="btn" onClick={changeDataDir}>Смени…</button>
        </div>
        <div className="note info">
          Всичко е в обикновени папки и текстови файлове. Можете да ги разглеждате и редактирате с Notepad и да копирате
          документи директно в папките – програмата ги вижда, когато прозорецът ѝ отново стане активен.
        </div>
      </section>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>Резервни копия</h2>
        <div className="row">
          <input className="input grow mono" value={backupDir} onChange={(e) => setBackupDir(e.target.value)} placeholder="напр. E:\Архив (друг диск или USB)" aria-label="Папка за архиви" />
          <button className="btn" onClick={pickBackup}>Избери…</button>
        </div>
        <div className="row" style={{ gap: 24 }}>
          <label className="check"><input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />Автоматичен архив веднъж дневно (при стартиране)</label>
          <label className="check">Пази последните <input className="input" type="number" min={1} max={365} value={keep} onChange={(e) => setKeep(Number(e.target.value) || 30)} style={{ width: 80 }} aria-label="Брой архиви" /> архива</label>
        </div>
        <div className="row">
          <button className="btn" onClick={saveBackup}>Запази</button>
          <button className="btn primary" onClick={backupNow} disabled={busy || !backupDir}>Направи копие сега</button>
          <span className="muted small">{config.lastBackup ? `Последен архив: ${config.lastBackup}` : "Още няма архив"}</span>
        </div>
      </section>
    </div>
  );
}
