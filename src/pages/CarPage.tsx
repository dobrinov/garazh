import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, CarEvent, CarPage as CarData, errorMessage } from "../api";
import { EventForm } from "../components/EventForm";
import { useFeatures } from "../components/features";
import { Files } from "../components/Files";
import { LinksCard } from "../components/Links";
import { RealOemPartLinks } from "../components/RealOem";
import { QuoteList } from "./Quotes";
import { ScheduleTab } from "../components/Schedule";
import { Icon, Loading, Menu, Plate, StatusBadge, useLoad, useToast } from "../components/ui";
import { date, euro, int, km, STATUS_LABEL, todayIso } from "../lib/format";
import { buildHistory, HistoryEntry, HistoryKind } from "../lib/history";
import { stageOf } from "../lib/stages";
import { formatMinutes } from "../lib/time";

type Tab = "all" | "orders" | "parts" | "usage" | "schedule" | "quotes" | "docs";
type CarDetail = CarData;

const KIND_LABEL: Record<HistoryKind, string> = { order: "Ремонт", event: "Минало събитие", parts: "Части", km: "Пробег", quote: "Оферта / доклад", doc: "Документ" };
const QUOTE_TONE: Record<string, string> = { чернова: "muted", изпратена: "info", приета: "ok", отказана: "bad" };
const QUOTE_LABEL: Record<string, string> = { чернова: "Чернова", изпратена: "Чака отговор", приета: "Приета", отказана: "Отказана" };

export function CarPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data, error, reload } = useLoad(() => api.getCar(id), [id]);
  const [tab, setTab] = useState<Tab>("all");
  /** undefined: closed; null: a new event; else the event being edited. */
  const [eventForm, setEventForm] = useState<CarEvent | null | undefined>(undefined);
  const features = useFeatures();
  const toast = useToast();
  const history = useMemo(
    () => (data ? buildHistory({ orders: data.orders, parts: data.parts, events: data.events, readings: data.readings, quotes: features.quotes ? data.quotes : [], documents: data.documents }) : []),
    [data, features.quotes],
  );
  if (!data) return <Loading error={error} />;
  const dueItems = data.schedule?.items.filter((i) => i.status === "просрочено" || i.status === "скоро") ?? [];
  const tabs: [Tab, string, number | null][] = [
    ["all", "Всичко", null],
    ["orders", "Ремонти", data.orders.length],
    ["parts", "Части", data.parts.length],
    ["usage", "Пробег", data.readings.length],
    ...(data.schedule ? [["schedule", "Поддръжка", dueItems.length || null] as [Tab, string, number | null]] : []),
    ...(features.quotes ? [["quotes", "Оферти и доклади", data.quotes.length] as [Tab, string, number | null]] : []),
    ["docs", "Документи", data.documents.length],
  ];
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} е копиран`);
    } catch {
      toast("Копирането не успя", true);
    }
  };
  const c = data.car.data;
  const open = data.orders.find((o) => stageOf(o.order.status) !== "предадена");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link to="/clients">Клиенти и коли</Link><span>/</span><Link to={`/clients/${c.clientId}`}>{data.owner.name}</Link><span>/</span><span>{c.plate}</span>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <Plate value={c.plate} big />
            <div>
              <h1>{c.make} {c.model}</h1>
              <div className="muted">
                {[c.year, [c.engine, c.engineCode].filter(Boolean).join(" "), [c.gearbox, c.gearboxCode].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                {" · "}<Link to={`/clients/${c.clientId}`}>{data.owner.name}</Link>
                {data.owner.phone && <> · <a href={`tel:${data.owner.phone}`}>{data.owner.phone}</a></>}
              </div>
            </div>
          </div>
        </div>
        <div className="row">
          <Menu
            items={[
              { label: "Редактирай колата", onSelect: () => nav(`/cars/${id}/edit`) },
              { label: "Добави минало събитие", onSelect: () => setEventForm(null) },
              { label: "Отвори папката", onSelect: () => api.openPath(data.car.dir) },
              features.quotes && { label: "Доклад от диагностика", onSelect: () => nav(`/quotes/new?car=${id}&kind=диагностика`) },
            ]}
          />
          {features.quotes && <Link className="btn" to={`/quotes/new?car=${id}&kind=оферта`}><Icon name="quote" />Оферта</Link>}
          {open ? (
            <Link className="btn primary" to={`/orders/${open.order.id}`}>Отвори работната карта</Link>
          ) : (
            <Link className="btn primary" to={`/orders/new?car=${id}`}><Icon name="plus" />Нова работна карта</Link>
          )}
        </div>
      </div>

      {open && (
        <Link to={`/orders/${open.order.id}`} className="in-shop-banner">
          <span className="badge" style={{ background: "var(--accent)", color: "#fff" }}>В сервиза</span>
          <strong>{open.order.number} · {open.order.title || open.order.complaint || "Работна карта"}</strong>
          <span>{STATUS_LABEL[stageOf(open.order.status)]}{open.order.mechanic && ` · ${open.order.mechanic}`}{data.time?.running.includes(open.order.id) && " · таймерът тече"}</span>
          <span className="grow" />
          <span style={{ fontWeight: 600 }}>Отвори картата →</span>
        </Link>
      )}
      {data.car.notes.trim() && <div className="note warn" style={{ whiteSpace: "pre-wrap" }}>{data.car.notes.trim()}</div>}

      <section className="card car-summary" aria-label="Колата накратко">
        <div className="car-chips">
          {data.deadlines.map((d) => (
            <span key={d.kind} className={`badge ${d.days < 0 ? "bad" : d.days <= 30 ? "warn" : "ok"}`} title={date(d.date)}>
              {d.label} {d.days < 0 ? `изтекла ${date(d.date)}` : `до ${date(d.date)}`}
            </span>
          ))}
          {dueItems.slice(0, 3).map((i) => (
            <button key={i.schedule + i.operation} type="button" className={`badge ${i.status === "просрочено" ? "bad" : "info"} as-button`} onClick={() => setTab("schedule")}>
              {i.operation} {i.kmLeft !== null ? (i.kmLeft < 0 ? `· с ${int(-i.kmLeft)} км над` : `· след ${int(i.kmLeft)} км`) : i.status === "просрочено" ? "· просрочено" : `· ${date(i.nextDate)}`}
            </button>
          ))}
          {data.deadlines.length === 0 && <Link className="small" to={`/cars/${id}/edit`}>Добави ГТП, ГО и винетка</Link>}
        </div>
        <dl className="car-facts">
          <div>
            <dt>Пробег</dt>
            <dd><strong>{km(data.usage.lastKm)}</strong> <button type="button" className="link-btn small" onClick={() => setTab("usage")}>запиши</button></dd>
            {data.usage.recentPerMonth ? <dd className="small muted">≈ {int(data.usage.recentPerMonth)} км/месец</dd> : null}
          </div>
          <div><dt>Последно тук</dt><dd>{date(data.usage.lastDate)}</dd></div>
          <div>
            <dt>VIN</dt>
            <dd className="mono small row" style={{ gap: 4 }}>
              {c.vin || "—"}
              {c.vin && <button className="btn small icon-btn" onClick={() => copy(c.vin, "VIN")} aria-label="Копирай VIN" title="Копирай VIN"><Icon name="copy" size={14} /></button>}
            </dd>
          </div>
          {(c.paintCode || c.tyres) && <div><dt>Код боя · гуми</dt><dd>{[c.paintCode, c.tyres].filter(Boolean).join(" · ")}</dd></div>}
          {(c.fuel || c.color) && <div><dt>Гориво · цвят</dt><dd>{[c.fuel, c.color].filter(Boolean).join(" · ")}</dd></div>}
          {data.time && data.time.totalMinutes > 0 && <div><dt>Отработено</dt><dd>{formatMinutes(data.time.totalMinutes)} ч</dd></div>}
          {c.pastOwners.length > 0 && <div><dt>Предишни собственици</dt><dd>{c.pastOwners.join(", ")}</dd></div>}
        </dl>
      </section>

      <div className="cols">
        <div className="wide stack-14">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div className="pill-tabs" role="tablist" aria-label="Раздели">
              {tabs.map(([t, label, n]) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                  {label}{n ? ` ${n}` : ""}
                </button>
              ))}
            </div>
            {tab === "all" && <button type="button" className="btn small" onClick={() => setEventForm(null)}><Icon name="plus" size={14} />Минало събитие</button>}
          </div>
          {tab === "all" && <Timeline entries={history} carId={id} onAddEvent={() => setEventForm(null)} onEditEvent={setEventForm} />}
          {tab === "orders" && <OrdersTab data={data} />}
          {tab === "parts" && <PartsTab data={data} onChange={reload} />}
          {tab === "schedule" && data.schedule && <ScheduleTab data={data} schedule={data.schedule} onChange={reload} />}
          {tab === "quotes" && (
            <section className="card">
              <div className="card-head">
                <h2>Оферти и доклади</h2>
                <div className="row">
                  <Link className="btn small" to={`/quotes/new?car=${id}&kind=диагностика`}>+ Доклад от диагностика</Link>
                  <Link className="btn small primary" to={`/quotes/new?car=${id}&kind=оферта`}>+ Оферта</Link>
                </div>
              </div>
              <QuoteList rows={data.quotes} showCar={false} />
            </section>
          )}
          {tab === "usage" && <UsageTab data={data} onChange={reload} />}
          {tab === "docs" && (
            <section className="card pad">
              <Files files={data.documents} target="car" id={id} onChange={reload} hint="Файловете се записват в папка „документи“ на колата. Тук се показват и файловете от ремонтите." />
            </section>
          )}
        </div>

        <aside className="narrow stack-14">
          {features.links && <LinksCard links={data.links} car={c} onCopy={copy} />}
        </aside>
      </div>
      {eventForm !== undefined && (
        <EventForm
          carId={id}
          original={eventForm}
          onClose={() => setEventForm(undefined)}
          onSaved={() => {
            setEventForm(undefined);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Timeline({ entries, carId, onAddEvent, onEditEvent }: { entries: HistoryEntry[]; carId: string; onAddEvent: () => void; onEditEvent: (e: CarEvent) => void }) {
  const [all, setAll] = useState(false);
  if (entries.length === 0) {
    return (
      <div className="card empty">
        Още няма история. <Link to={`/orders/new?car=${carId}`}>Нова работна карта</Link> или <button type="button" className="link-btn" onClick={onAddEvent}>добавете минало събитие</button> – ремонт другаде, катастрофа и др.
      </div>
    );
  }
  const shown = all ? entries : entries.slice(0, 12);
  return (
    <section className="card timeline">
      {shown.map((e) => {
        const title = e.kind === "order" ? <Link to={`/orders/${e.id}`}>{e.title}</Link> : e.kind === "quote" ? <Link to={`/quotes/${e.id}`}>{e.title}</Link> : e.kind === "doc" ? <button type="button" className="link-btn" onClick={() => api.openPath(e.path)}>{e.title}</button> : e.event ? <button type="button" className="link-btn" onClick={() => onEditEvent(e.event!)} title="Промени или изтрий">{e.title}</button> : e.title;
        return (
          <div key={e.key} className={`tl-row tl-${e.kind}`}>
            <div className="tl-when">
              <div className="mono small" style={{ fontWeight: 600 }}>{date(e.date)}</div>
              {e.km !== null && <div className="mono small muted">{km(e.km)}</div>}
            </div>
            <div className="tl-dot" aria-hidden="true" />
            <div className="tl-body">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="grow">
                  <div className="tl-kind">{KIND_LABEL[e.kind]} {e.number && <span className="mono">{e.number}</span>}</div>
                  <div className="tl-title">{title}</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {e.total && <span className="mono small" style={{ fontWeight: 600 }}>{e.kind === "event" ? e.total : euro(e.total)}</span>}
                  {e.kind === "order" && <StatusBadge status={stageOf(e.status)} />}
                  {e.kind === "quote" && e.status && <span className={`badge ${QUOTE_TONE[e.status] ?? "muted"}`}>{QUOTE_LABEL[e.status] ?? e.status}</span>}
                </div>
              </div>
              {e.sub && <div className="small muted">{e.sub}</div>}
              {e.parts.length > 0 && <div className="tl-parts">{e.parts.map((p, i) => <span key={i}>{p}</span>)}</div>}
            </div>
          </div>
        );
      })}
      {entries.length > 12 && (
        <div className="card-foot">
          <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? "Покажи по-малко" : `Покажи по-старите (${entries.length - 12})`}</button>
        </div>
      )}
    </section>
  );
}

function OrdersTab({ data }: { data: CarData }) {
  const nav = useNavigate();
  if (data.orders.length === 0) return <div className="card empty">Няма ремонти. <Link to={`/orders/new?car=${data.car.data.id}`}>Нова работна карта</Link></div>;
  return (
    <section className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Дата</th><th className="right">Пробег</th><th>Номер</th><th>Работа</th>{data.time && <th className="right">Време</th>}<th className="right">Сума</th><th>Статус</th></tr></thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.order.id} className="link" onClick={() => nav(`/orders/${o.order.id}`)}>
                <td className="mono small">{date(o.order.date)}</td>
                <td className="mono small right">{km(o.order.mileage)}</td>
                <td className="mono small">{o.order.number}</td>
                <td><strong>{o.order.title || "—"}</strong><div className="small muted">{o.order.labor.map((l) => l.description).filter(Boolean).join(", ")}</div></td>
                {data.time && <td className="mono small right">{data.time.orders[o.order.id] ? formatMinutes(data.time.orders[o.order.id]) : ""}{data.time.running.includes(o.order.id) && " ⏱"}</td>}
                <td className="mono small right">{euro(o.totals.total)}</td>
                <td><StatusBadge status={o.order.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PartsTab({ data, onChange }: { data: CarDetail; onChange: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [row, setRow] = useState({ date: todayIso(), km: "", part: "", brand: "", quantity: "", price: "" });
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? data.parts.filter((p) => `${p.part} ${p.brand} ${p.order}`.toLowerCase().includes(t)) : data.parts;
  }, [data.parts, q]);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api.addParts(data.car.data.id, [{ ...row, km: row.km ? Number(row.km.replace(/\D/g, "")) : null, order: "ръчно" }]);
      toast("Записано в части.md");
      setAdding(false);
      setRow({ ...row, part: "", brand: "", quantity: "", price: "" });
      onChange();
    } catch (err) {
      toast(errorMessage(err), true);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <label className="search" style={{ flex: "0 1 360px" }}>
          <Icon name="search" color="var(--muted)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси част, марка, кат. №" aria-label="Търси част" />
        </label>
        <button className="btn small" onClick={() => setAdding(!adding)}>+ Добави ръчно</button>
      </div>
      {adding && (
        <form onSubmit={add} className="row" style={{ padding: "0 18px 14px" }}>
          <input className="input" type="date" style={{ width: 150 }} value={row.date} onChange={(e) => setRow({ ...row, date: e.target.value })} aria-label="Дата" />
          <input className="input mono" style={{ width: 110 }} placeholder="Км" value={row.km} onChange={(e) => setRow({ ...row, km: e.target.value })} aria-label="Пробег" />
          <input className="input grow" placeholder="Част / консуматив" value={row.part} onChange={(e) => setRow({ ...row, part: e.target.value })} aria-label="Част" required />
          <input className="input" style={{ width: 180 }} placeholder="Марка / кат. №" value={row.brand} onChange={(e) => setRow({ ...row, brand: e.target.value })} aria-label="Марка" />
          <input className="input" style={{ width: 90 }} placeholder="К-во" value={row.quantity} onChange={(e) => setRow({ ...row, quantity: e.target.value })} aria-label="Количество" />
          <input className="input" style={{ width: 90 }} placeholder="Цена" value={row.price} onChange={(e) => setRow({ ...row, price: e.target.value })} aria-label="Цена" />
          <button className="btn primary small" type="submit">Запиши</button>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="empty">{data.parts.length === 0 ? "Още няма записани части. Попълват се автоматично при приключване на работна карта." : "Няма съвпадения."}</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Дата</th><th className="right">Пробег</th><th>Част / консуматив</th><th>Марка · кат. №</th><th className="right">К-во</th><th className="right">Цена</th><th>Карта</th></tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i}>
                  <td className="mono small">{date(p.date)}</td>
                  <td className="mono small right"><strong>{int(p.km)}</strong></td>
                  <td><strong>{p.part}</strong></td>
                  <td className="small"><div className="cell-with-action">{p.brand}<RealOemPartLinks make={data.car.data.make} text={`${p.brand} ${p.part}`} /></div></td>
                  <td className="right nowrap">{p.quantity}</td>
                  <td className="right nowrap mono small">{p.price ? euro(p.price) : ""}</td>
                  <td className="mono small">{p.order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UsageTab({ data, onChange }: { data: CarDetail; onChange: () => void }) {
  const toast = useToast();
  const u = data.usage;
  const [d, setD] = useState(todayIso());
  const [k, setK] = useState("");
  const maxPerDay = Math.max(1, ...u.periods.map((p) => p.perDay));

  async function add(e: FormEvent) {
    e.preventDefault();
    const value = Number(k.replace(/\D/g, ""));
    if (!value) return;
    try {
      await api.addReading(data.car.data.id, { date: d, km: value, source: "ръчно" });
      toast("Пробегът е записан");
      setK("");
      onChange();
    } catch (err) {
      toast(errorMessage(err), true);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {u.warnings.map((w) => <div key={w} className="note bad">{w}</div>)}
      <section className="stats">
        <div className="card stat"><div className="label">На ден (последен период)</div><div className="value mono" style={{ fontSize: 22 }}>{u.recentPerDay ? `${u.recentPerDay.toFixed(1)} км` : "—"}</div></div>
        <div className="card stat"><div className="label">На месец (последен период)</div><div className="value mono" style={{ fontSize: 22 }}>{u.recentPerMonth ? `${int(u.recentPerMonth)} км` : "—"}</div></div>
        <div className="card stat"><div className="label">Годишно (прогноза)</div><div className="value mono" style={{ fontSize: 22 }}>{u.recentPerYear ? `${int(u.recentPerYear)} км` : "—"}</div></div>
        <div className="card stat">
          <div className="label">Средно за целия период</div>
          <div className="value mono" style={{ fontSize: 22 }}>{u.averagePerMonth ? `${int(u.averagePerMonth)} км/мес.` : "—"}</div>
          {u.changePercent !== null && <div className="small" style={{ color: u.changePercent >= 0 ? "var(--warn)" : "var(--info)" }}>{u.changePercent >= 0 ? "↑" : "↓"} {Math.abs(u.changePercent)}% спрямо средното</div>}
        </div>
      </section>
      <div className="cols">
        <section className="card pad wide">
          <h3 style={{ marginBottom: 12 }}>Изминати км на месец между посещенията</h3>
          {u.periods.length === 0 ? (
            <div className="empty">Нужни са поне две отчитания на километража на различни дати.</div>
          ) : (
            <>
              <div className="bars" role="img" aria-label={u.periods.map((p) => `${date(p.from)}–${date(p.to)}: ${int(p.perDay * 30.44)} км/мес.`).join("; ")}>
                {u.periods.map((p, i) => (
                  <div key={p.from} className={`bar ${i === u.periods.length - 1 ? "last" : ""}`}>
                    <span className="mono small">{int(p.perDay * 30.44)}</span>
                    <div style={{ height: `${Math.round((p.perDay / maxPerDay) * 120)}px` }} />
                  </div>
                ))}
              </div>
              <div className="bar-labels">{u.periods.map((p) => <span key={p.from}>{date(p.from).slice(3)} – {date(p.to).slice(3)}</span>)}</div>
            </>
          )}
        </section>
        <section className="card narrow">
          <form className="card-head" onSubmit={add}>
            <input className="input" type="date" style={{ width: 150 }} value={d} onChange={(e) => setD(e.target.value)} aria-label="Дата на отчитане" />
            <input className="input mono grow" placeholder="Км" value={k} onChange={(e) => setK(e.target.value)} aria-label="Пробег в км" />
            <button className="btn primary small" type="submit">Запиши</button>
          </form>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Дата</th><th className="right">Км</th><th>Източник</th></tr></thead>
              <tbody>
                {[...data.readings].reverse().map((r, i) => (
                  <tr key={i}><td className="mono small">{date(r.date)}</td><td className="mono small right"><strong>{int(r.km)}</strong></td><td className="small muted">{r.source}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
