import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, CarDetail, errorMessage } from "../api";
import { Files } from "../components/Files";
import { DeadlineBadge, Icon, Loading, Plate, StatusBadge, useLoad, useToast } from "../components/ui";
import { date, euro, int, km, todayIso } from "../lib/format";

type Tab = "usage" | "orders" | "parts" | "docs";

export function CarPage() {
  const { id = "" } = useParams();
  const { data, error, reload } = useLoad(() => api.getCar(id), [id]);
  const [tab, setTab] = useState<Tab>("orders");
  if (!data) return <Loading error={error} />;
  const c = data.car.data;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link to="/clients">Клиенти</Link><span>/</span><Link to={`/clients/${c.clientId}`}>{data.owner.name}</Link><span>/</span><span>{c.plate}</span>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <Plate value={c.plate} big />
            <div>
              <h1>{c.make} {c.model}</h1>
              <div className="muted">{[c.year, c.fuel, c.color].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => api.openPath(data.car.dir)}><Icon name="folder" />Отвори папката</button>
          <Link className="btn" to={`/cars/${id}/edit`}>Редактирай</Link>
          <Link className="btn primary" to={`/orders/new?car=${id}`}><Icon name="plus" />Нова работна карта</Link>
        </div>
      </div>

      <div className="cols">
        <section className="card pad wide" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <dl className="facts">
            <div><dt>VIN</dt><dd className="mono">{c.vin || "—"}</dd></div>
            <div><dt>Двигател</dt><dd>{[c.engine, c.engineCode].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt>Скоростна кутия</dt><dd>{[c.gearbox, c.gearboxCode].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt>Текущ пробег</dt><dd><span className="mono">{km(data.usage.lastKm)}</span> <span className="muted small">{date(data.usage.lastDate)}</span></dd></div>
            <div><dt>Натоварване</dt><dd>{data.usage.recentPerMonth ? `≈ ${int(data.usage.recentPerMonth)} км / месец` : "—"}</dd></div>
            <div><dt>Код боя · гуми</dt><dd>{[c.paintCode, c.tyres].filter(Boolean).join(" · ") || "—"}</dd></div>
          </dl>
          {data.car.notes.trim() && <div className="note warn" style={{ whiteSpace: "pre-wrap" }}>{data.car.notes.trim()}</div>}
        </section>
        <aside className="narrow" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card pad">
            <div className="small muted">Собственик</div>
            <Link to={`/clients/${c.clientId}`} style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", textDecoration: "none" }}>{data.owner.name}</Link>
            <div>{data.owner.phone}</div>
            {c.pastOwners.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>Предишни: {c.pastOwners.join(", ")}</div>}
          </div>
          <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="small muted">Срокове</div>
            {data.deadlines.length === 0 ? <span className="muted">Не са въведени</span> : data.deadlines.map((d) => (
              <div key={d.kind} className="row" style={{ justifyContent: "space-between" }}>
                <span>{d.label} <span className="mono small muted">{date(d.date)}</span></span>
                <DeadlineBadge label="" days={d.days} />
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="tabs" role="tablist">
        {([["orders", `Ремонти (${data.orders.length})`], ["parts", `Части и консумативи (${data.parts.length})`], ["usage", "Пробег и натоварване"], ["docs", `Документи (${data.documents.length})`]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === "orders" && <OrdersTab data={data} />}
      {tab === "parts" && <PartsTab data={data} onChange={reload} />}
      {tab === "usage" && <UsageTab data={data} onChange={reload} />}
      {tab === "docs" && (
        <section className="card pad">
          <Files files={data.documents} target="car" id={id} onChange={reload} hint="Файловете се записват в папка „документи“ на колата. Тук се показват и файловете от ремонтите." />
        </section>
      )}
    </div>
  );
}

function OrdersTab({ data }: { data: CarDetail }) {
  const nav = useNavigate();
  if (data.orders.length === 0) return <div className="card empty">Няма ремонти. <Link to={`/orders/new?car=${data.car.data.id}`}>Нова работна карта</Link></div>;
  return (
    <section className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Дата</th><th className="right">Пробег</th><th>Номер</th><th>Работа</th><th className="right">Сума</th><th>Статус</th></tr></thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.order.id} className="link" onClick={() => nav(`/orders/${o.order.id}`)}>
                <td className="mono small">{date(o.order.date)}</td>
                <td className="mono small right">{km(o.order.mileage)}</td>
                <td className="mono small">{o.order.number}</td>
                <td><strong>{o.order.title || "—"}</strong><div className="small muted">{o.order.labor.map((l) => l.description).filter(Boolean).join(", ")}</div></td>
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
                  <td className="small">{p.brand}</td>
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
