import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { DeadlineBadge, Icon, Loading, Plate, StatusBadge, useLoad } from "../components/ui";
import { date, euro, int, km, toCents } from "../lib/format";

export function ClientPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data, error } = useLoad(() => api.getClient(id), [id]);
  if (!data) return <Loading error={error} />;
  const c = data.client.data;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/clients">Клиенти</Link><span>/</span><span>{c.name}</span></div>
          <h1>{c.name}</h1>
          <div className="muted">
            {c.kind === "фирма" ? "Фирма" : "Частно лице"} · №{String(c.number).padStart(4, "0")}
            {c.created && ` · клиент от ${date(c.created)}`}
            {c.discountPercent > 0 && ` · отстъпка ${c.discountPercent}%`}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => api.openPath(data.client.dir)}><Icon name="folder" />Отвори папката</button>
          <Link className="btn" to={`/clients/${id}/edit`}>Редактирай</Link>
          <Link className="btn primary" to={`/cars/new?client=${id}`}><Icon name="plus" />Добави автомобил</Link>
        </div>
      </div>

      <div className="cols">
        <section className="card pad wide">
          <dl className="facts">
            <div><dt>Телефон</dt><dd>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "—"}{c.viber && c.phone ? " · Viber" : ""}</dd></div>
            <div><dt>Имейл</dt><dd>{c.email || "—"}</dd></div>
            {c.kind === "фирма" && <div><dt>ЕИК</dt><dd className="mono">{c.eik || "—"}</dd></div>}
            <div><dt>Адрес</dt><dd>{c.address || "—"}</dd></div>
            <div><dt>Съгласие за лични данни</dt><dd>{c.gdprConsent ? `подписано ${date(c.gdprConsent)}` : <span style={{ color: "var(--warn)" }}>няма</span>}</dd></div>
          </dl>
          {data.client.notes.trim() && <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{data.client.notes.trim()}</p>}
        </section>
        <section className="narrow stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="card stat"><div className="label">Оборот</div><div className="value" style={{ fontSize: 22 }}>{euro(data.turnover)}</div></div>
          <div className="card stat"><div className="label">Неплатено</div><div className="value" style={{ fontSize: 22, color: toCents(data.unpaid) ? "var(--bad)" : undefined }}>{euro(data.unpaid)}</div></div>
        </section>
      </div>

      <h2>Автомобили</h2>
      {data.cars.length === 0 ? (
        <div className="card empty">Няма добавени автомобили. <Link to={`/cars/new?client=${id}`}>Добави автомобил</Link></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {data.cars.map((k) => (
            <Link key={k.car.id} to={`/cars/${k.car.id}`} className="card pad" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="row">
                <Plate value={k.car.plate} />
                <strong className="grow">{k.car.make} {k.car.model}</strong>
                {k.openOrder && <span className="badge info">В сервиза</span>}
              </div>
              <div className="row" style={{ gap: 20 }}>
                <div><div className="small muted">Пробег</div><div className="mono">{km(k.usage.lastKm)}</div></div>
                <div><div className="small muted">км / месец</div><div className="mono">{int(k.usage.recentPerMonth)}</div></div>
                <div><div className="small muted">Последно посещение</div><div className="mono">{date(k.lastVisit)}</div></div>
              </div>
              {k.deadlines.filter((d) => d.days <= 30).map((d) => <DeadlineBadge key={d.kind} label={d.label} days={d.days} />)}
            </Link>
          ))}
        </div>
      )}

      <section className="card">
        <div className="card-head"><h2>Посещения</h2></div>
        {data.orders.length === 0 ? (
          <div className="empty">Няма работни карти.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Дата</th><th>Номер</th><th>Автомобил</th><th>Работа</th><th className="right">Сума</th><th>Плащане</th><th>Статус</th></tr></thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.order.id} className="link" onClick={() => nav(`/orders/${o.order.id}`)}>
                    <td className="mono small">{date(o.order.date)}</td>
                    <td className="mono small">{o.order.number}</td>
                    <td><Plate value={o.plate} /></td>
                    <td>{o.order.title || o.order.complaint || "—"}</td>
                    <td className="mono small right">{euro(o.totals.total)}</td>
                    <td>{o.order.closedOn ? <span className={`badge ${o.order.paid ? "ok" : "bad"}`}>{o.order.paid ? "Платено" : "Неплатено"}</span> : "—"}</td>
                    <td><StatusBadge status={o.order.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
