import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, AppConfig, errorMessage, Job, Loaded, Shop } from "../api";
import { useBrand } from "../components/brand";
import { BusinessIcon, businessLabel, ChangeBusinessDialog } from "../components/Business";
import { LogoPicker } from "../components/LogoPicker";
import { useUpdates } from "../components/updates";
import { Icon, Loading, TextField, useToast } from "../components/ui";
import { FEATURES, FeatureKey, resolveFeatures, toggle } from "../lib/features";
import { DEFAULT_STATUS_LABEL, OPTIONAL_STAGES, STATUS_LABEL, STATUS_ORDER } from "../lib/format";
import { jobStage } from "../lib/jobs";

export function Settings({
  config,
  onConfig,
  onFeatures,
  onStages,
}: {
  config: AppConfig;
  onConfig: (c: AppConfig) => void;
  onFeatures: (f: Record<string, boolean>) => void;
  onStages: (names: Record<string, string>, hidden: string[]) => void;
}) {
  const toast = useToast();
  const brand = useBrand();
  const updates = useUpdates();
  const [shop, setShop] = useState<Loaded<Shop> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupDir, setBackupDir] = useState(config.backupDir ?? "");
  const [daily, setDaily] = useState(config.backupDaily);
  const [keep, setKeep] = useState(config.backupKeep || 30);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const sec: Section = SECTIONS.some((x) => x.id === params.get("s")) ? (params.get("s") as Section) : "shop";
  const setSec = (s: Section) => setParams(s === "shop" ? {} : { s }, { replace: true });

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
      brand.refresh();
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

  async function openReference(kind: "schedules" | "links" | "jobs") {
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
    <div className="page settings-page">
      <h1>Настройки</h1>
      <div className="settings">
        <nav className="settings-nav" aria-label="Раздели на настройките">
          {SECTIONS.map((x) => (
            <button key={x.id} type="button" aria-current={sec === x.id ? "page" : undefined} className={sec === x.id ? "on" : ""} onClick={() => setSec(x.id)}>
              <span>{x.name}</span>
              <span className="small muted">{x.sub}</span>
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {sec === "shop" && (
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
        <div className="field">
          Лого (в менюто и на отпечатаните документи)
          <LogoPicker shopName={s.name} logo={brand.logo} onChange={brand.refresh} />
        </div>
        <label className="check"><input type="checkbox" checked={s.vatRegistered} onChange={(e) => set("vatRegistered", e.target.checked)} />Регистриран по ДДС (начислява се ДДС в работните карти)</label>
        <div className="muted small">Следващ клиент №{s.counters.client + 1} · следваща работна карта №{s.counters.workOrder + 1}</div>
      </section>
          )}
          {sec === "work" && (
            <>
      <BusinessCard shop={s} onChanged={() => api.getShop().then(setShop)} />

      <StagesCard key={shop.hash} shop={s} onSaved={(names, hidden, hash) => { setShop({ ...shop, data: { ...shop.data, stageNames: names, hiddenStages: hidden }, hash }); onStages(names, hidden); }} />
              <JobsCard />
            </>
          )}
          {sec === "features" && (
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
          )}
          {sec === "ref" && (
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>Справочници</h2>
        <div className="muted">
          Обичайните работи, графиците за поддръжка и полезните връзки са обикновени файлове в папка „справочници“.
          Обичайната работа (например смяна на масло или боядисване на елемент) се избира при „Приеми кола“ и отваря
          работната карта направо в работа, с готовите редове – добавете свои файлове, а ненужните изтрийте. Програмата идва с
          примерни графици за често срещани двигатели и кутии – <strong>те не са проверени</strong>. Сверете ги с данните на
          производителя и във всеки проверен файл сменете <span className="mono">проверено: false</span> на <span className="mono">true</span>.
        </div>
        <div className="row">
          <button className="btn" onClick={() => openReference("jobs")}><Icon name="folder" />Обичайни работи</button>
          <button className="btn" onClick={() => openReference("schedules")}><Icon name="folder" />Графици</button>
          <button className="btn" onClick={() => openReference("links")}><Icon name="folder" />Полезни връзки</button>
          <button className="btn" onClick={() => installReference(false)}>Добави липсващите примерни файлове</button>
          <button className="btn danger" onClick={() => installReference(true)}>Възстанови примерните файлове</button>
        </div>
      </section>
          )}
          {sec === "data" && (
            <>
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
            </>
          )}
          {sec === "updates" && (
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>Обновяване</h2>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <span>Версия <strong className="mono">{updates.current || "—"}</strong></span>
          <button className="btn" onClick={updates.checkNow} disabled={updates.status === "checking" || updates.status === "downloading"}>
            {updates.status === "checking" ? "Проверка…" : "Провери за нова версия"}
          </button>
          {updates.status === "available" && updates.update && (
            <button className="btn primary" onClick={updates.install}>Обнови до {updates.update.version}</button>
          )}
          <span className="muted small">
            {updates.status === "none" && "Използвате последната версия."}
            {updates.status === "unconfigured" && "Тази версия е компилирана локално и не проверява за обновления. Обновяването работи в инсталираната версия."}
            {updates.status === "error" && `Проверката не успя: ${updates.error}`}
            {updates.status === "downloading" && "Изтегляне…"}
          </span>
        </div>
        {updates.status === "available" && updates.update?.body && <div className="note info" style={{ whiteSpace: "pre-wrap" }}>{updates.update.body}</div>}
        <label className="check">
          <input
            type="checkbox"
            checked={!config.noAutoUpdate}
            onChange={async (e) => {
              try {
                onConfig(await api.setAutoUpdate(e.target.checked));
              } catch (err) {
                toast(errorMessage(err), true);
              }
            }}
          />
          Проверявай автоматично (при стартиране и на всеки 6 часа)
        </label>
        <div className="muted small">
          Обновяването сменя само програмата – папката с данни не се променя. Ако е избрана папка за архиви, преди обновяване
          се прави резервно копие. Новата версия се проверява с подпис, преди да бъде инсталирана.
        </div>
      </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The board's stages under the shop's own names. A paint shop may call
 * "Диагностика" "Оглед" and switch off "Чака части". Work order files keep
 * the stage values, so nothing in the data changes.
 */
function StagesCard({ shop, onSaved }: { shop: Shop; onSaved: (names: Record<string, string>, hidden: string[], hash: string) => void }) {
  const toast = useToast();
  const [names, setNames] = useState<Record<string, string>>(shop.stageNames ?? {});
  const [hidden, setHidden] = useState<string[]>(shop.hiddenStages ?? []);
  const [busy, setBusy] = useState(false);
  const clean = (n: Record<string, string>) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => v && v !== DEFAULT_STATUS_LABEL[k]));
  const dirty = JSON.stringify(clean(names)) !== JSON.stringify(clean(shop.stageNames ?? {})) || [...hidden].sort().join() !== [...(shop.hiddenStages ?? [])].sort().join();

  async function save() {
    setBusy(true);
    try {
      const n = clean(names);
      // On top of the file as it is on disk now, like the feature switches.
      const current = await api.getShop();
      const saved = await api.saveShop({ data: { ...current.data, stageNames: n, hiddenStages: hidden }, notes: current.notes, baseHash: current.hash });
      onSaved(saved.data.stageNames ?? {}, saved.data.hiddenStages ?? [], saved.hash);
      toast("Етапите са запазени");
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2>Етапи на работните карти</h2>
        <div className="muted small">
          Колоните на таблото и бутоните в работната карта. Кръстете ги, както се казват при вас (например „Оглед“ вместо „Диагностика“
          в бояджийски сервиз), а ненужните скрийте. В работните карти се пази същият етап, затова данните не се променят.
        </div>
      </div>
      <div className="stage-names">
        {STATUS_ORDER.map((k, i) => {
          const optional = OPTIONAL_STAGES.includes(k);
          const off = hidden.includes(k);
          return (
            <div key={k} className={`stage-name ${off ? "off" : ""}`}>
              <span className="muted small mono">{i + 1}.</span>
              <input className="input" value={names[k] ?? ""} placeholder={DEFAULT_STATUS_LABEL[k]} disabled={off} onChange={(e) => setNames({ ...names, [k]: e.target.value })} aria-label={`Име на етап „${DEFAULT_STATUS_LABEL[k]}“`} />
              {optional ? (
                <label className="check small">
                  <input type="checkbox" checked={!off} onChange={(e) => setHidden(e.target.checked ? hidden.filter((h) => h !== k) : [...hidden, k])} />
                  ползва се
                </label>
              ) : (
                <span className="small muted">задължителен</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => { setNames({}); setHidden([]); }} disabled={busy}>Както в началото</button>
        <button className="btn primary" onClick={save} disabled={busy || !dirty}>Запази етапите</button>
      </div>
    </section>
  );
}

/** Вид дейност: where the stage names, usual jobs and features came from. */
function BusinessCard({ shop, onChanged }: { shop: Shop; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>Вид дейност</h2>
          <div className="muted small">От него идват имената на колоните, примерните обичайни работи и кои функции са включени. Смяната показва какво ще се промени и нищо не трие.</div>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>Смени…</button>
      </div>
      <div className="biz-current">
        <span className="biz-icon on"><BusinessIcon id={shop.businessType || "автосервиз"} /></span>
        <div>
          <strong>{businessLabel(shop)}</strong>
          {!shop.businessType && <div className="small muted">Не е избран – програмата е подредена за автосервиз, както досега.</div>}
        </div>
      </div>
      {open && <ChangeBusinessDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </section>
  );
}

type Section = "shop" | "work" | "features" | "ref" | "data" | "updates";
const SECTIONS: { id: Section; name: string; sub: string }[] = [
  { id: "shop", name: "Сервиз", sub: "име, лого, ставка, ДДС" },
  { id: "work", name: "Работа", sub: "вид дейност, етапи, обичайни работи" },
  { id: "features", name: "Функции", sub: "оферти, склад, време…" },
  { id: "ref", name: "Справочници", sub: "графици, полезни връзки" },
  { id: "data", name: "Данни и архив", sub: "папка, резервни копия" },
  { id: "updates", name: "Обновяване", sub: "версия и ново" },
];

/** The usual jobs as a list, each opened in the text editor. */
function JobsCard() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const load = () => api.listJobs().then(setJobs).catch(() => setJobs([]));
  useEffect(() => {
    load();
  }, []);
  async function open(file?: string) {
    try {
      const dir = await api.referenceDir("jobs");
      await api.openPath(file ? `${dir}${dir.includes("\\") ? "\\" : "/"}${file}` : dir);
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Обичайни работи</h2>
          <div className="small muted">Избират се при „Приеми кола“ и в работната карта. Всяка е файл в „справочници\\работи“.</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn small" onClick={load}>Обнови</button>
          <button type="button" className="btn small" onClick={() => open()}><Icon name="folder" size={14} />Папката</button>
        </div>
      </div>
      {!jobs ? (
        <div className="empty">Зареждане…</div>
      ) : jobs.length === 0 ? (
        <div className="empty">Няма обичайни работи. Копирайте файл в папката или сменете вида дейност, за да получите примерите.</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Работа</th><th>Започва в</th><th>Редове</th><th /></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.file}>
                  <td><strong>{j.name}</strong></td>
                  <td>{STATUS_LABEL[jobStage(j)]}</td>
                  <td className="small muted">{j.labor.length} труд · {j.parts.length} {j.parts.length === 1 ? "част" : "части"}</td>
                  <td className="right"><button type="button" className="btn small" onClick={() => open(j.file)}>Отвори</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
