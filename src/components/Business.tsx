// Business type: the picker with a preview of what it sets up (first start
// and Настройки), and the review of changes for a shop that already has data.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, errorMessage, Job, notifyChanged, Shop } from "../api";
import { applyPlan, Business, BUSINESSES, businessOf, Choices, countChanges, defaultChoices, HIDDEN, jobsFor, Plan, planChange, stageTarget } from "../lib/business";
import { resolveFeatures, FEATURES } from "../lib/features";
import { STATUS_ORDER } from "../lib/format";
import { Dialog, Loading, useToast } from "./ui";

/** Re-reads сервиз.md and applies stage names and features everywhere. */
export const ShopReloadCtx = createContext<() => Promise<void>>(async () => {});
export const useShopReload = () => useContext(ShopReloadCtx);

const ICON: Record<string, string> = {
  автосервиз: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  бояджийски: "M4 21h8v-9H4zM6 12V8h4v4M8 8V5h3M16 5h1M19 3h1M19 7h1M16 9h1",
  гуми: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  автоелектрика: "M13 2L4 14h7l-1 8 9-12h-7z",
  детайлинг: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  друго: "M4 6h16M4 12h16M4 18h10",
};

export function BusinessIcon({ id, size = 20 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[id] ?? ICON.друго} />
    </svg>
  );
}

/** "Тенекеджийски и бояджийски · също: Гуми" */
export function businessLabel(shop: Pick<Shop, "businessType" | "businessExtras">): string {
  const extras = (shop.businessExtras ?? []).map((x) => businessOf(x).name);
  return `${businessOf(shop.businessType).name}${extras.length ? ` · също: ${extras.join(", ")}` : ""}`;
}

/** Choose the business and the other work the shop also does, with a preview. */
export function BusinessPicker({ value, extras, onChange }: { value: string; extras: string[]; onChange: (value: string, extras: string[]) => void }) {
  const b = businessOf(value);
  const others = BUSINESSES.filter((x) => x.id !== b.id && x.jobs.length > 0);
  return (
    <div className="biz">
      <div className="biz-main">
        <div className="biz-grid" role="radiogroup" aria-label="Основна дейност">
          {BUSINESSES.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === b.id} className={`biz-card ${x.id === b.id ? "on" : ""}`} onClick={() => onChange(x.id, extras.filter((e) => e !== x.id))}>
              <span className="biz-icon"><BusinessIcon id={x.id} /></span>
              <span className="biz-text">
                <strong>{x.name}</strong>
                <span className="small muted">{x.sub}</span>
              </span>
            </button>
          ))}
        </div>
        {others.length > 0 && (
          <div className="stack-8">
            <div className="small"><strong>Правите ли още нещо?</strong> <span className="muted">– добавя само обичайните работи</span></div>
            <div className="job-chips">
              {others.map((x) => {
                const on = extras.includes(x.id);
                return (
                  <button key={x.id} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => onChange(b.id, on ? extras.filter((e) => e !== x.id) : [...extras, x.id])}>
                    {on ? "✓ " : "+ "}{x.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <BusinessPreview b={b} extras={extras} />
    </div>
  );
}

function BusinessPreview({ b, extras }: { b: Business; extras: string[] }) {
  const jobs = jobsFor(b.id, extras);
  const features = resolveFeatures(b.features as Record<string, boolean>);
  return (
    <aside className="biz-preview" aria-label="Какво ще настроим">
      <div className="biz-kicker">Ще настроим</div>
      <section>
        <h3>Колони на таблото</h3>
        <div className="biz-stages">
          {STATUS_ORDER.filter((k) => k !== "предадена" && stageTarget(b, k) !== HIDDEN).map((k) => (
            <span key={k} className={`biz-stage stage-${k}`}><span className="dot" />{stageTarget(b, k)}</span>
          ))}
        </div>
      </section>
      <section>
        <h3>Обичайни работи <span className="muted small">– отварят картата направо в работа</span></h3>
        {jobs.length === 0 ? (
          <div className="small muted">Без примери. Добавяте свои от Настройки → Обичайни работи.</div>
        ) : (
          <ul className="biz-jobs">{jobs.map((j) => <li key={j.name}>{j.name}</li>)}</ul>
        )}
      </section>
      <section>
        <h3>Функции</h3>
        <ul className="biz-features">
          {FEATURES.filter((f) => !f.later && !f.requires && f.default).map((f) => (
            <li key={f.key} className={features[f.key] ? "" : "off"}>
              <span>{f.label}</span>
              <span className={`badge ${features[f.key] ? "ok" : "muted"}`}>{features[f.key] ? "включено" : "изключено"}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

/** What changes for a shop that already has data; every change has its own tick. */
export function BusinessReview({ plan, choices, onChange }: { plan: Plan; choices: Choices; onChange: (c: Choices) => void }) {
  const nothing = plan.stages.length + plan.features.length + plan.addJobs.length + plan.removable.length === 0;
  const own = (r: { own: boolean; from: string }) => r.own && <span className="biz-own">ваша настройка: „{r.from}“ – остава, ако не отметнете</span>;
  return (
    <div className="stack-12">
      {nothing && <div className="note info">Нищо не се променя – само се записва видът дейност.</div>}
      {plan.stages.length > 0 && (
        <section className="stack-8">
          <h3 className="biz-h">Колони на таблото</h3>
          {plan.stages.map((r) => (
            <label key={r.key} className={`biz-row ${r.own ? "own" : ""}`}>
              <input type="checkbox" checked={!!choices.stages[r.key]} onChange={(e) => onChange({ ...choices, stages: { ...choices.stages, [r.key]: e.target.checked } })} />
              <span className="grow">
                {r.to === HIDDEN ? <>Скрий „{r.from}“</> : r.from === HIDDEN ? <>Покажи „{r.to}“</> : <>„{r.from}“ <span className="muted">→</span> <strong>„{r.to}“</strong></>}
                {own(r)}
              </span>
            </label>
          ))}
        </section>
      )}
      {(plan.addJobs.length > 0 || plan.removable.length > 0) && (
        <section className="stack-8">
          <h3 className="biz-h">Обичайни работи</h3>
          {plan.addJobs.length > 0 && (
            <label className="biz-row">
              <input type="checkbox" checked={choices.addJobs} onChange={(e) => onChange({ ...choices, addJobs: e.target.checked })} />
              <span className="grow">Добави {plan.addJobs.length}: {plan.addJobs.map((j) => j.name).join(", ")}</span>
            </label>
          )}
          {plan.removable.length > 0 && (
            <label className="biz-row">
              <input type="checkbox" checked={choices.removeExamples} onChange={(e) => onChange({ ...choices, removeExamples: e.target.checked })} />
              <span className="grow">
                Махни примерите за автосервиз ({plan.removable.map((j) => j.name).join(", ")})
                <span className="small muted biz-sub">Работните карти, правени с тях, не се засягат. Променени от вас примери и ваши собствени работи не се пипат.</span>
              </span>
            </label>
          )}
        </section>
      )}
      {plan.features.length > 0 && (
        <section className="stack-8">
          <h3 className="biz-h">Функции</h3>
          {plan.features.map((r) => (
            <label key={r.key} className={`biz-row ${r.own ? "own" : ""}`}>
              <input type="checkbox" checked={!!choices.features[r.key]} onChange={(e) => onChange({ ...choices, features: { ...choices.features, [r.key]: e.target.checked } })} />
              <span className="grow">
                {r.to === "вкл." ? "Включи" : "Изключи"} „{r.label}“
                {r.to !== "вкл." && !r.own && <span className="small muted biz-sub">Скрива менютата ѝ. Файловете остават и се включва пак от Настройки.</span>}
                {own(r)}
              </span>
            </label>
          ))}
        </section>
      )}
      <section className="biz-same">
        <strong>Не се променят</strong>
        <span>работните карти и етапа им · клиентите и колите · офертите и докладите · склада · историята на колите · времето по етапи</span>
      </section>
    </div>
  );
}

/** Save the chosen changes on top of сервиз.md as it is on disk now. */
export async function applyBusiness(plan: Plan, choices: Choices): Promise<Shop> {
  const current = await api.getShop();
  const out = applyPlan(current.data, plan, choices);
  const saved = await api.saveShop({ data: out.shop, notes: current.notes, baseHash: current.hash });
  if (out.addJobs.length) await api.addJobs(out.addJobs);
  if (out.removeFiles.length) await api.removeJobs(out.removeFiles);
  notifyChanged();
  return saved.data;
}

/** Pick another business, then see and confirm what changes. */
export function ChangeBusinessDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const reload = useShopReload();
  const [shop, setShop] = useState<Shop | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [step, setStep] = useState<"pick" | "review">("pick");
  const [choices, setChoices] = useState<Choices | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api.getShop(), api.listJobs().catch(() => [] as Job[])])
      .then(([s, j]) => {
        setShop(s.data);
        setJobs(j);
        setValue(businessOf(s.data.businessType).id);
        setExtras(s.data.businessExtras ?? []);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const plan = useMemo(() => (shop ? planChange(shop, jobs, value, extras) : null), [shop, jobs, value, extras]);

  async function apply() {
    if (!plan || !choices) return;
    setBusy(true);
    try {
      await applyBusiness(plan, choices);
      await reload();
      toast("Видът дейност е записан");
      onDone();
    } catch (e) {
      toast(errorMessage(e), true);
      setBusy(false);
    }
  }

  const from = shop ? businessOf(shop.businessType) : null;
  return (
    <Dialog title="Вид дейност" onClose={onClose} wide>
      <div className="dialog-form">
        {!shop || !plan || !from ? (
          <Loading error={error} />
        ) : step === "pick" ? (
          <>
            <div>
              <h2 style={{ margin: 0 }}>С какво се занимава сервизът?</h2>
              <div className="muted small">Следващата стъпка показва какво ще се промени, преди да го приемете.</div>
            </div>
            <BusinessPicker value={value} extras={extras} onChange={(v, x) => { setValue(v); setExtras(x); }} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={onClose}>Отказ</button>
              <button type="button" className="btn primary" onClick={() => { setChoices(defaultChoices(plan)); setStep("review"); }}>Напред</button>
            </div>
          </>
        ) : (
          choices && (
            <>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="small muted">{shop.businessType ? from.name : "Досега: автосервиз"} → {plan.to.name}</div>
                  <h2 style={{ margin: 0 }}>Какво ще се промени</h2>
                </div>
                <button type="button" className="link-btn small" onClick={() => setStep("pick")}>Друга дейност</button>
              </div>
              <BusinessReview plan={plan} choices={choices} onChange={setChoices} />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="small muted">Записва се в сервиз.md – важи за всички компютри с тази папка. Връща се от Настройки.</span>
                <div className="row">
                  <button type="button" className="btn" onClick={onClose} disabled={busy}>Отказ</button>
                  <button type="button" className="btn primary" onClick={apply} disabled={busy}>
                    {countChanges(plan, choices) ? `Приложи ${countChanges(plan, choices)} ${countChanges(plan, choices) === 1 ? "промяна" : "промени"}` : "Запиши"}
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </Dialog>
  );
}
