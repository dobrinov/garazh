import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, TimeRow } from "../api";
import { Loading, Plate, useLoad } from "../components/ui";
import { date } from "../lib/format";
import { formatMinutes } from "../lib/time";

function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`];
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Finished time for a month, by mechanic and by car. */
export function TimeReport({ embedded }: { embedded?: boolean } = {}) {
  const [month, setMonth] = useState(thisMonth());
  const [from, to] = monthRange(month);
  const { data, error } = useLoad(() => api.timeReport(from, to), [from, to]);
  const [who, setWho] = useState<string | null>(null);

  const byMechanic = useMemo(() => group(data ?? [], (r) => r.mechanic || "—"), [data]);
  const rows = (data ?? []).filter((r) => who === null || (r.mechanic || "—") === who);
  const byCar = useMemo(() => group(rows, (r) => r.carId), [rows]);
  const total = sum(data ?? []);

  return (
    <div className={embedded ? "stack-18" : "page"}>
      <div className="page-head">
        <div>
          {!embedded && <h1>Отработено време</h1>}
          <div className="muted">По механици и по коли, само спрените таймери и ръчно добавеното време.</div>
        </div>
        <label className="field" style={{ width: 180 }}>
          Месец
          <input className="input" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
      </div>
      {!data ? (
        <Loading error={error} />
      ) : data.length === 0 ? (
        <div className="card empty">Няма отчетено време за този месец.</div>
      ) : (
        <>
          <section className="stats">
            <button className={`card stat stat-button${who === null ? " active" : ""}`} onClick={() => setWho(null)}>
              <div className="label">Общо</div>
              <div className="value mono">{formatMinutes(total)}</div>
            </button>
            {byMechanic.map(([name, rs]) => (
              <button key={name} className={`card stat stat-button${who === name ? " active" : ""}`} onClick={() => setWho(who === name ? null : name)}>
                <div className="label">{name === "—" ? "Без механик" : name}</div>
                <div className="value mono">{formatMinutes(sum(rs))}</div>
              </button>
            ))}
          </section>

          <section className="card">
            <div className="card-head"><h2>По коли{who !== null && ` – ${who === "—" ? "без механик" : who}`}</h2></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Автомобил</th><th>Работни карти</th><th className="right">Време</th></tr></thead>
                <tbody>
                  {byCar.map(([carId, rs]) => (
                    <tr key={carId}>
                      <td><Link to={`/cars/${carId}`}><Plate value={rs[0].plate} /></Link><div className="small muted">{rs[0].carName}</div></td>
                      <td className="small">
                        {group(rs, (r) => r.orderId).map(([orderId, os], i) => (
                          <span key={orderId}>{i > 0 && ", "}<Link to={`/orders/${orderId}`} className="mono">{os[0].orderNumber || "карта"}</Link> ({formatMinutes(sum(os))})</span>
                        ))}
                      </td>
                      <td className="mono right"><strong>{formatMinutes(sum(rs))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Всички записи</h2></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Дата</th><th>От – до</th><th>Автомобил</th><th>Механик</th><th>Бележка</th><th className="right">Време</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="mono small">{date(r.date)}</td>
                      <td className="mono small">{r.start ? `${r.start} – ${r.end}` : <span className="muted">ръчно</span>}</td>
                      <td><Link to={`/orders/${r.orderId}`}>{r.plate}</Link> <span className="small muted">{r.carName}</span></td>
                      <td className="small">{r.mechanic}</td>
                      <td className="small">{r.note}</td>
                      <td className="mono right">{formatMinutes(r.minutes ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function sum(rows: TimeRow[]): number {
  return rows.reduce((s, r) => s + (r.minutes ?? 0), 0);
}

/** Groups in order of the largest total first. */
function group(rows: TimeRow[], key: (r: TimeRow) => string): [string, TimeRow[]][] {
  const m = new Map<string, TimeRow[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));
}
