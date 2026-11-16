// "Днес": everything on it is something to do – hand a car over, stop a
// timer, call a client, receive an expected car, order stock.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Dashboard as DashboardData, errorMessage, ExpectedRow, notifyChanged, OrderSummary } from "../api";
import { Icon, Loading, Plate, useLoad, useNow, useToast } from "../components/ui";
import { date, euro, int, STATUS_LABEL, toCents, todayIso } from "../lib/format";
import { formatQty } from "../lib/stock";
import { BOARD_STAGES, formatDuration, isStaleReady, stageOf, timeInStage } from "../lib/stages";
import { entryMinutes, formatMinutes } from "../lib/time";
import { receiveExpected } from "./Orders";
import { BusinessQuestion } from "../components/BusinessQuestion";

type Dashboard = DashboardData;

/** A timer this long was probably left running by mistake. */
const FORGOTTEN_MINUTES = 10 * 60;

export function Dashboard() {
  const { data, error, reload } = useLoad(() => api.dashboard(), []);
  if (!data) return <Loading error={error} />;
  // Ready cars older than a month were most likely collected (see isStaleReady).
  const inShop = data.inShop.filter((o) => !isStaleReady(o.order, todayIso()));

  const today = new Date().toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const byStage = (s: string) => inShop.filter((o) => stageOf(o.order.status) === s);
  const ready = byStage("готова");
  const waiting = byStage("чака_части");
  const reminders = reminderRows(data);
  const toCall = reminders.filter((r) => !r.calledOn).length;
  const now = new Date();
  const forgotten = data.timers.filter((t) => entryMinutes(t, now) >= FORGOTTEN_MINUTES);
  const expectedSoon = data.expected.filter((e) => !e.date || e.date <= addDays(todayIso(), 1));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="muted">{today}</div>
          <h1>Днес</h1>
        </div>
        <div className="muted small">
          {inShop.length} {inShop.length === 1 ? "кола" : "коли"} в сервиза
          {data.expected.length > 0 && ` · ${data.expected.length} очаквани`}
        </div>
      </div>
      <BusinessQuestion />

      {data.problems.length > 0 && (
        <div className="note bad">
          <strong>{data.problems.length} файла не могат да бъдат прочетени</strong> и не са заредени. Отворете ги и
          поправете реда, който е посочен:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {data.problems.slice(0, 5).map((p) => (
              <li key={p.path}>
                <button className="btn ghost small" style={{ padding: 0, minHeight: 0 }} onClick={() => api.revealPath(p.path)}>{p.path}</button>
                {" – "}{p.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="tiles">
        <Link className="tile" to="/orders">
          <span className="label">Готови за предаване</span>
          <span className="value" style={{ color: ready.length ? "var(--ok)" : undefined }}>{ready.length}</span>
          <span className="sub">{ready.length ? "обадете се на клиента" : "няма"}</span>
        </Link>
        <Link className="tile" to="/orders">
          <span className="label">Чакат части</span>
          <span className="value">{waiting.length}</span>
          <span className="sub">{waiting.length ? `най-старата от ${date(waiting[0].order.date)}` : "няма"}</span>
        </Link>
        <Link className="tile" to="/orders?tab=unpaid">
          <span className="label">Неплатено</span>
          <span className="value" style={{ color: toCents(data.unpaid) ? "var(--bad)" : undefined }}>{euro(data.unpaid)}</span>
          <span className="sub">по приключени карти</span>
        </Link>
        <a className="tile" href="#reminders">
          <span className="label">За напомняне</span>
          <span className="value">{toCall}</span>
          <span className="sub">срокове и обслужване до 30 дни</span>
        </a>
      </section>

      <div className="cols">
        <div className="wide stack-18">
          <InShop rows={inShop} timers={data.timers} />
          {expectedSoon.length > 0 && <ExpectedSoon rows={expectedSoon} total={data.expected.length} />}
        </div>

        <aside className="narrow stack-18">
          {(forgotten.length > 0 || data.lowStock.length > 0) && (
            <section className="card">
              <div className="card-head"><h2>Изисква внимание</h2></div>
              {forgotten.map((t) => (
                <div className="attn" key={`${t.orderId} ${t.date} ${t.start} ${t.mechanic}`}>
                  <span className="badge bad">Таймер</span>
                  <div className="grow">
                    <strong>Тече {formatMinutes(entryMinutes(t, now))} ч – вероятно е забравен</strong>
                    <div className="small muted">{t.mechanic || "без механик"} · {t.plate} · от {t.start}{t.date !== todayIso() ? ` на ${date(t.date)}` : ""}</div>
                  </div>
                  <Link className="btn small" to={`/orders/${t.orderId}`}>Спри</Link>
                </div>
              ))}
              {data.lowStock.length > 0 && (
                <div className="attn">
                  <span className="badge warn">Склад</span>
                  <div className="grow">
                    <strong>{data.lowStock.length} {data.lowStock.length === 1 ? "артикул" : "артикула"} за поръчка</strong>
                    <div className="small muted">
                      {data.lowStock.slice(0, 4).map((i) => `${i.part} (${formatQty(i.quantity)} ${i.unit})`).join(", ")}
                      {data.lowStock.length > 4 && " и още"}
                    </div>
                  </div>
                  <Link className="btn small" to="/stock">Склад</Link>
                </div>
              )}
            </section>
          )}
          <Reminders rows={reminders} onChange={reload} />
        </aside>
      </div>

      <p className="muted small">{data.clients} клиенти · {data.cars} автомобила · <Link to="/reports">Оборот и отчети</Link></p>
    </div>
  );
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Ready cars first: those are the ones to act on.
const SHOP_ORDER = ["готова", "в_ремонт", "чака_части", "диагностика", "приета"];

function InShop({ rows, timers }: { rows: OrderSummary[]; timers: Dashboard["timers"] }) {
  const nav = useNavigate();
  const now = useNow();
  if (rows.length === 0) {
    return (
      <section className="card">
        <div className="card-head"><h2>В сервиза</h2></div>
        <div className="empty">Няма коли в сервиза. <Link to="/orders">Работни карти</Link></div>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>В сервиза</h2>
        <Link to="/orders">Табло на работните карти</Link>
      </div>
      {SHOP_ORDER.filter((s) => BOARD_STAGES.includes(s as never)).map((s) => {
        const group = rows.filter((o) => stageOf(o.order.status) === s);
        if (group.length === 0) return null;
        return (
          <div key={s}>
            <div className={`stage-head stage-${s}`}>
              <span className="dot" />
              {s === "готова" ? "Готова – чака клиента" : STATUS_LABEL[s]} · {group.length}
            </div>
            {group.map((o) => {
              const running = timers.filter((t) => t.orderId === o.order.id);
              return (
                <div key={o.order.id} className="shop-row" onClick={() => nav(`/orders/${o.order.id}`)}>
                  <div><Plate value={o.plate} /><div className="small muted">{o.carName}</div></div>
                  <div className="grow">
                    <Link to={`/orders/${o.order.id}`} className="row-title" onClick={(e) => e.stopPropagation()}>{o.order.title || o.order.complaint || "Работна карта"}</Link>
                    <div className="small muted">{o.clientName} · <span className="mono">{o.order.number}</span></div>
                  </div>
                  <div className="small nowrap">
                    {running.length > 0 ? (
                      <span className="timer-chip"><span className="time-dot" />{running.map((t) => `${t.mechanic || "—"} ${formatMinutes(entryMinutes(t, now))}`).join(", ")}</span>
                    ) : (
                      <span className="muted">{o.order.mechanic}</span>
                    )}
                  </div>
                  <div className="small nowrap right">
                    {s === "готова" && o.clientPhone ? (
                      <a href={`tel:${o.clientPhone}`} onClick={(e) => e.stopPropagation()}><Icon name="phone" size={14} /> {o.clientPhone}</a>
                    ) : (
                      <span className="muted">
                        {(() => {
                          const t = timeInStage(o.order, now);
                          return t ? `${t.approx ? "≈ " : ""}${formatDuration(t.minutes)} на етапа` : `от ${date(o.order.date)}`;
                        })()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

function ExpectedSoon({ rows, total }: { rows: ExpectedRow[]; total: number }) {
  const nav = useNavigate();
  const toast = useToast();
  return (
    <section className="card">
      <div className="card-head">
        <h2>Очаквани днес и утре</h2>
        <Link to="/orders">Всички очаквани ({total})</Link>
      </div>
      {rows.map((e) => (
        <div key={e.id} className="shop-row">
          <div><Plate value={e.plate} /><div className="small muted">{e.car}</div></div>
          <div className="grow">
            <strong>{e.complaint || "—"}</strong>
            <div className="small muted">{e.client}{e.phone && <> · <a href={`tel:${e.phone}`}>{e.phone}</a></>}</div>
          </div>
          <div className="small nowrap">{e.date ? `${e.date === todayIso() ? "днес" : date(e.date)} ${e.time}` : <span className="muted">без ден</span>}</div>
          <div className="right">
            <button type="button" className="btn small" onClick={() => receiveExpected(e, nav).catch((err) => toast(errorMessage(err), true))}>Приеми</button>
          </div>
        </div>
      ))}
    </section>
  );
}

interface Reminder {
  carId: string;
  plate: string;
  carName: string;
  clientName: string;
  clientPhone: string;
  items: { reason: string; due: string; text: string; bad: boolean; calledOn: string | null }[];
  calledOn: string | null;
  urgency: number;
}

/** Deadlines and maintenance, one row per car, so one call covers everything due. */
function reminderRows(data: Dashboard): Reminder[] {
  const by = new Map<string, Reminder>();
  const get = (carId: string, plate: string, carName: string, clientName: string, clientPhone: string) => {
    let r = by.get(carId);
    if (!r) {
      r = { carId, plate, carName, clientName, clientPhone, items: [], calledOn: null, urgency: 9999 };
      by.set(carId, r);
    }
    return r;
  };
  for (const d of data.deadlines) {
    const r = get(d.carId, d.plate, d.carName, d.clientName, d.clientPhone ?? "");
    const days = d.deadline.days;
    const label = d.deadline.kind === "го" ? "ГО" : d.deadline.label;
    r.items.push({
      reason: d.deadline.label,
      due: d.deadline.date,
      text: days < 0 ? `${label} изтекла преди ${-days} дни` : days === 0 ? `${label} изтича днес` : `${label} след ${days} дни`,
      bad: days < 0,
      calledOn: d.calledOn ?? null,
    });
    r.urgency = Math.min(r.urgency, days);
  }
  for (const m of data.maintenance) {
    const r = get(m.carId, m.plate, m.carName, m.clientName, m.clientPhone ?? "");
    const late = m.status === "просрочено";
    const when = m.kmLeft !== null ? (m.kmLeft < 0 ? `с ${int(-m.kmLeft)} км над срока` : `след ${int(m.kmLeft)} км`) : m.nextDate ? date(m.nextDate) : "";
    r.items.push({ reason: m.operation, due: m.nextDate ?? "", text: `${m.operation}${when ? ` · ${when}` : late ? " · просрочено" : ""}`, bad: late, calledOn: m.calledOn ?? null });
    r.urgency = Math.min(r.urgency, late ? -1 : 15);
  }
  const rows = [...by.values()];
  for (const r of rows) r.calledOn = r.items.every((i) => i.calledOn) ? r.items.map((i) => i.calledOn!).sort().reverse()[0] : null;
  // Not yet called first, then the most urgent.
  return rows.sort((a, b) => Number(!!a.calledOn) - Number(!!b.calledOn) || a.urgency - b.urgency);
}

function Reminders({ rows, onChange }: { rows: Reminder[]; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 8);

  async function toggle(r: Reminder) {
    setBusy(r.carId);
    const on = !r.calledOn;
    try {
      for (const i of r.items) {
        if (on ? !i.calledOn : true) await api.setCalled(r.carId, i.reason, i.due, on);
      }
      notifyChanged();
      onChange();
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card" id="reminders">
      <div className="card-head" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
        <h2>Напомняния за клиенти</h2>
        <span className="small muted">ГТП, ГО, винетка и обслужване до 30 дни</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">Няма какво да се напомня.</div>
      ) : (
        <>
          {shown.map((r) => (
            <div key={r.carId} className={`reminder ${r.calledOn ? "done" : ""}`}>
              <div className="grow">
                <div className="row" style={{ gap: 6 }}>
                  <Link to={`/cars/${r.carId}`}><Plate value={r.plate} /></Link>
                  {r.items.map((i) => <span key={i.reason + i.due} className={`badge ${i.calledOn ? "ok" : i.bad ? "bad" : "warn"}`}>{i.text}</span>)}
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {r.clientName}
                  {r.clientPhone && <> · <a href={`tel:${r.clientPhone}`}>{r.clientPhone}</a></>}
                  {r.calledOn && ` · обадено ${date(r.calledOn)}`}
                </div>
              </div>
              <button type="button" className="btn small" aria-pressed={!!r.calledOn} disabled={busy === r.carId} onClick={() => toggle(r)}>
                {r.calledOn ? <><Icon name="check" size={14} />Обадено</> : "Обадих се"}
              </button>
            </div>
          ))}
          {rows.length > 8 && (
            <div className="card-foot">
              <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? "Покажи по-малко" : `Всички напомняния (${rows.length})`}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

