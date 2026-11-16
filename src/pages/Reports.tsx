// Отчети: the numbers that used to sit on the dashboard (turnover, unpaid)
// time in each stage and the time report, in one place.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, OrderSummary } from "../api";
import { useFeatures } from "../components/features";
import { Loading, Plate, useLoad, useNow } from "../components/ui";
import { date, euro, STATUS_LABEL, toCents } from "../lib/format";
import { formatDuration, stageReport } from "../lib/stages";
import { TimeReport } from "./TimeReport";

type Tab = "money" | "stages" | "time";

const MONTHS = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];

function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ym} ${y}`;
}

export function Reports() {
  const features = useFeatures();
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab: Tab = asked === "time" && features.timeTracking ? "time" : asked === "stages" ? "stages" : "money";
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Отчети</h1>
          <div className="muted">Оборот по месеци, неплатени карти, време по етапи{features.timeTracking ? " и отработено време" : ""}.</div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "money"} className={tab === "money" ? "on" : ""} onClick={() => setParams({}, { replace: true })}>Оборот</button>
        <button role="tab" aria-selected={tab === "stages"} className={tab === "stages" ? "on" : ""} onClick={() => setParams({ tab: "stages" }, { replace: true })}>Време по етапи</button>
        {features.timeTracking && (
          <button role="tab" aria-selected={tab === "time"} className={tab === "time" ? "on" : ""} onClick={() => setParams({ tab: "time" }, { replace: true })}>Отработено време</button>
        )}
      </div>
      {tab === "time" ? <TimeReport embedded /> : tab === "stages" ? <Stages /> : <Money />}
    </div>
  );
}

function Money() {
  const { data, error } = useLoad(() => api.listOrders(), []);
  const months = useMemo(() => {
    const by = new Map<string, { total: number; count: number; unpaid: number }>();
    for (const o of data ?? []) {
      const d = o.order.closedOn;
      if (!d) continue;
      const ym = d.slice(0, 7);
      const m = by.get(ym) ?? { total: 0, count: 0, unpaid: 0 };
      m.total += toCents(o.totals.total);
      m.count += 1;
      if (!o.order.paid) m.unpaid += toCents(o.totals.total);
      by.set(ym, m);
    }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [data]);
  if (!data) return <Loading error={error} />;
  const unpaid: OrderSummary[] = data.filter((o) => o.order.closedOn && !o.order.paid).sort((a, b) => (a.order.closedOn ?? "").localeCompare(b.order.closedOn ?? ""));
  const max = Math.max(1, ...months.map(([, m]) => m.total));
  const thisMonth = months[0]?.[1];
  return (
    <>
      <section className="stats">
        <div className="card stat"><div className="label">Оборот {months[0] ? monthName(months[0][0]) : "този месец"}</div><div className="value">{euro(thisMonth?.total ?? 0)}</div></div>
        <div className="card stat"><div className="label">Приключени карти</div><div className="value">{thisMonth?.count ?? 0}</div></div>
        <div className="card stat"><div className="label">Неплатено общо</div><div className="value" style={{ color: unpaid.length ? "var(--bad)" : undefined }}>{euro(unpaid.reduce((s, o) => s + toCents(o.totals.total), 0))}</div></div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Оборот по месеци</h2><span className="small muted">по датата на приключване, с ДДС</span></div>
        {months.length === 0 ? (
          <div className="empty">Още няма приключени работни карти.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Месец</th><th style={{ width: "40%" }} /><th className="right">Карти</th><th className="right">Оборот</th><th className="right">Неплатено</th></tr></thead>
              <tbody>
                {months.map(([ym, m]) => (
                  <tr key={ym}>
                    <td>{monthName(ym)}</td>
                    <td><div className="meter" aria-hidden="true"><div style={{ width: `${Math.round((m.total / max) * 100)}%` }} /></div></td>
                    <td className="mono small right">{m.count}</td>
                    <td className="mono small right">{euro(m.total)}</td>
                    <td className="mono small right" style={{ color: m.unpaid ? "var(--bad)" : "var(--muted)" }}>{m.unpaid ? euro(m.unpaid) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-head"><h2>Неплатени карти</h2><Link to="/orders?tab=unpaid">Към работните карти</Link></div>
        {unpaid.length === 0 ? (
          <div className="empty">Всичко е платено.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Приключена</th><th>Номер</th><th>Автомобил</th><th>Клиент</th><th className="right">Сума</th></tr></thead>
              <tbody>
                {unpaid.map((o) => (
                  <tr key={o.order.id}>
                    <td className="mono small">{date(o.order.closedOn)}</td>
                    <td className="mono small"><Link to={`/orders/${o.order.id}`}>{o.order.number}</Link></td>
                    <td><Plate value={o.plate} /></td>
                    <td>{o.clientName}{o.clientPhone && <div className="small"><a href={`tel:${o.clientPhone}`}>{o.clientPhone}</a></div>}</td>
                    <td className="mono small right">{euro(o.totals.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/**
 * How long cars spend in each board column, from the times the program
 * writes when a card changes column. Counted by the month a car came in.
 */
function Stages() {
  const { data, error } = useLoad(() => api.listOrders(), []);
  const now = useNow();
  const months = useMemo(() => [...new Set((data ?? []).filter((o) => o.order.stages?.length).map((o) => o.order.date.slice(0, 7)))].sort().reverse(), [data]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? months[0] ?? "all";
  const inMonth = useMemo(() => (data ?? []).filter((o) => month === "all" || o.order.date.startsWith(month)), [data, month]);
  const report = useMemo(() => stageReport(inMonth.map((o) => ({ id: o.order.id, status: o.order.status, stages: o.order.stages })), now), [inMonth, now]);
  if (!data) return <Loading error={error} />;
  const byId = new Map(data.map((o) => [o.order.id, o]));
  const max = Math.max(1, ...report.stages.map((s) => s.average));
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <label className="field" style={{ minWidth: 220 }}>
          Приети през
          <select value={month} onChange={(e) => setPicked(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            <option value="all">всички месеци</option>
          </select>
        </label>
        <div className="small muted" style={{ maxWidth: 520 }}>
          Часовниково време, откакто картата влезе в колоната, докато я напусне – с нощите и почивните дни. Не е отработено време.
        </div>
      </div>
      {report.orders === 0 ? (
        <section className="card">
          <div className="empty">
            Още няма карти с отчетено време по етапи. Времето се записва, когато картата смени колона – в таблото или с бутоните в самата карта.
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Средно време по етапи</h2>
              <span className="small muted">{report.orders} {report.orders === 1 ? "карта" : "карти"}</span>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Етап</th><th style={{ width: "30%" }} /><th className="right">Карти</th><th className="right">Средно</th><th className="right">Обичайно</th><th className="right">Общо</th></tr></thead>
                <tbody>
                  {report.stages.map((s) => (
                    <tr key={s.status}>
                      <td>{STATUS_LABEL[s.status]}</td>
                      <td><div className="meter" aria-hidden="true"><div style={{ width: `${Math.round((s.average / max) * 100)}%` }} /></div></td>
                      <td className="mono small right">{s.count || "—"}</td>
                      <td className="mono small right">{s.count ? formatDuration(s.average) : "—"}</td>
                      <td className="mono small right" title="Половината коли са били по-малко от това">{s.count ? formatDuration(s.median) : "—"}</td>
                      <td className="mono small right">{s.count ? formatDuration(s.total) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="small muted" style={{ padding: "10px 16px 14px" }}>
              „Обичайно“: половината коли са били по-кратко от това, така една закъсняла кола не го разваля.
              {report.unknown > 0 && ` ${report.unknown} ${report.unknown === 1 ? "карта е приета" : "карти са приети"} преди тази версия и нямат точни времена – не са включени.`}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Най-дълго по етап</h2></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Етап</th><th>Карта</th><th>Автомобил</th><th>Клиент</th><th className="right">Време</th></tr></thead>
                <tbody>
                  {report.stages.flatMap((s) =>
                    s.slowest.map((x, i) => {
                      const o = byId.get(x.id);
                      return (
                        <tr key={`${s.status}-${x.id}`}>
                          <td>{i === 0 ? STATUS_LABEL[s.status] : ""}</td>
                          <td className="mono small">{o ? <Link to={`/orders/${x.id}`}>{o.order.number}</Link> : x.id}</td>
                          <td>{o && <Plate value={o.plate} />}</td>
                          <td>{o?.clientName}</td>
                          <td className="mono small right">{formatDuration(x.minutes)}{x.current && <span className="badge accent" style={{ marginLeft: 6 }}>още е там</span>}</td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
