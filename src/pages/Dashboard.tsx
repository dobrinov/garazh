import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { DeadlineBadge, Icon, Loading, Plate, StatusBadge, useLoad } from "../components/ui";
import { date, euro } from "../lib/format";

export function Dashboard() {
  const nav = useNavigate();
  const { data, error } = useLoad(() => api.dashboard(), []);
  if (!data) return <Loading error={error} />;

  const today = new Date().toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="muted">{today}</div>
          <h1>Табло</h1>
        </div>
        <div className="row">
          <Link className="btn" to="/cars"><Icon name="search" />Намери кола</Link>
          <Link className="btn primary" to="/cars"><Icon name="plus" />Нова работна карта</Link>
        </div>
      </div>

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

      <section className="stats">
        <div className="card stat"><div className="label">В сервиза сега</div><div className="value">{data.inShop.length}</div></div>
        <div className="card stat"><div className="label">Срокове до 30 дни</div><div className="value">{data.deadlines.length}</div></div>
        <div className="card stat"><div className="label">Оборот този месец</div><div className="value">{euro(data.monthTurnover)}</div></div>
        <div className="card stat"><div className="label">Неплатено</div><div className="value" style={{ color: data.unpaid !== "0.00" ? "var(--bad)" : undefined }}>{euro(data.unpaid)}</div></div>
      </section>

      <div className="cols">
        <section className="card wide">
          <div className="card-head">
            <h2>В сервиза сега</h2>
            <Link to="/orders">Всички работни карти</Link>
          </div>
          {data.inShop.length === 0 ? (
            <div className="empty">Няма отворени работни карти.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Автомобил</th><th>Клиент</th><th>Работа</th><th>Приета</th><th>Статус</th></tr></thead>
                <tbody>
                  {data.inShop.map((o) => (
                    <tr key={o.order.id} className="link" onClick={() => nav(`/orders/${o.order.id}`)}>
                      <td><Plate value={o.plate} /><div className="small muted">{o.carName}</div></td>
                      <td>{o.clientName}</td>
                      <td>{o.order.title || o.order.complaint || "—"}</td>
                      <td className="mono small">{date(o.order.date)}</td>
                      <td><StatusBadge status={o.order.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card narrow">
          <div className="card-head"><h2>Срокове</h2><span className="muted small">ГТП, ГО, винетка</span></div>
          {data.deadlines.length === 0 ? (
            <div className="empty">Няма срокове в следващите 30 дни.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <tbody>
                  {data.deadlines.map((d) => (
                    <tr key={d.carId + d.deadline.kind} className="link" onClick={() => nav(`/cars/${d.carId}`)}>
                      <td><Plate value={d.plate} /><div className="small muted">{d.clientName}</div></td>
                      <td><DeadlineBadge label={d.deadline.label} days={d.deadline.days} /><div className="small muted mono">{date(d.deadline.date)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="muted small">{data.clients} клиенти · {data.cars} автомобила</p>
    </div>
  );
}
