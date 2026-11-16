import { Link, useNavigate } from "react-router-dom";
import { api, Dashboard as DashboardData } from "../api";
type Dashboard = DashboardData;
import { DeadlineBadge, Icon, Loading, Plate, StatusBadge, useLoad } from "../components/ui";
import { date, euro, int, todayIso } from "../lib/format";
import { entryMinutes, formatMinutes } from "../lib/time";

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

      {data.timers.length > 0 && <RunningTimers rows={data.timers} />}

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

      {data.maintenance.length > 0 && <Maintenance rows={data.maintenance} />}

      <p className="muted small">{data.clients} клиенти · {data.cars} автомобила</p>
    </div>
  );
}

function Maintenance({ rows }: { rows: Dashboard["maintenance"] }) {
  const nav = useNavigate();
  // One line per car: its most urgent item, plus how many more are due.
  const byCar = new Map<string, Dashboard["maintenance"]>();
  for (const r of rows) byCar.set(r.carId, [...(byCar.get(r.carId) ?? []), r]);
  const cars = [...byCar.values()].sort((a, b) => (a[0].nextDate ?? "").localeCompare(b[0].nextDate ?? ""));
  return (
    <section className="card">
      <div className="card-head">
        <h2>Предстоящо обслужване</h2>
        <span className="muted small">по графика и натоварването на колата · за напомняне на клиента</span>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Автомобил</th><th>Клиент</th><th>Обслужване</th><th>Кога</th><th /></tr></thead>
          <tbody>
            {cars.map((items) => {
              const r = items[0];
              return (
                <tr key={r.carId} className="link" onClick={() => nav(`/cars/${r.carId}`)}>
                  <td><Plate value={r.plate} /><div className="small muted">{r.carName}</div></td>
                  <td>{r.clientName}</td>
                  <td>{r.operation}{items.length > 1 && <span className="small muted"> и още {items.length - 1}</span>}</td>
                  <td className="mono small">{date(r.nextDate)}{r.kmLeft !== null && <div className="muted">{r.kmLeft < 0 ? `${int(-r.kmLeft)} км след срока` : `след ${int(r.kmLeft)} км`}</div>}</td>
                  <td><span className={`badge ${r.status === "просрочено" ? "bad" : "warn"}`}>{r.status === "просрочено" ? "Просрочено" : "Скоро"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A timer this long was probably left running by mistake. */
const FORGOTTEN_MINUTES = 10 * 60;

function RunningTimers({ rows }: { rows: Dashboard["timers"] }) {
  const nav = useNavigate();
  const now = new Date();
  return (
    <section className="card">
      <div className="card-head">
        <h2><span className="time-dot" aria-hidden style={{ display: "inline-block", marginRight: 8 }} />Таймери, които текат</h2>
        <span className="muted small">спрете ги от работната карта</span>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <tbody>
            {rows.map((r) => {
              const m = entryMinutes(r, now);
              const forgotten = m >= FORGOTTEN_MINUTES;
              return (
                <tr key={`${r.orderId} ${r.date} ${r.start} ${r.mechanic}`} className="link" onClick={() => nav(`/orders/${r.orderId}`)}>
                  <td><Plate value={r.plate} /><div className="small muted">{r.carName}</div></td>
                  <td className="mono small">{r.orderNumber}</td>
                  <td>{r.mechanic || <span className="muted">—</span>}</td>
                  <td className="small muted">от {r.start}{r.date !== todayIso() ? ` на ${date(r.date)}` : ""}</td>
                  <td className="right">
                    <strong className="mono">{formatMinutes(m)}</strong>
                    {forgotten && <div><span className="badge bad">Вероятно е забравен</span></div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
