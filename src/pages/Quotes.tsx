import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, QuoteSummary } from "../api";
import { Icon, Loading, Plate, useLoad } from "../components/ui";
import { date, euro, matches } from "../lib/format";

export const KIND_LABEL: Record<string, string> = { оферта: "Оферта", доклад: "Доклад за ремонт", диагностика: "Доклад от диагностика" };
export const QUOTE_STATUS: Record<string, { label: string; tone: string }> = {
  чернова: { label: "Чернова", tone: "muted" },
  изпратена: { label: "Изпратена", tone: "info" },
  приета: { label: "Приета", tone: "ok" },
  отказана: { label: "Отказана", tone: "bad" },
};

type Filter = "all" | "оферта" | "reports" | "open";

export function Quotes() {
  const { data, error } = useLoad(() => api.listQuotes(), []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => {
      if (filter === "оферта" && r.quote.kind !== "оферта") return false;
      if (filter === "reports" && r.quote.kind === "оферта") return false;
      if (filter === "open" && !(r.quote.kind === "оферта" && (r.quote.status === "чернова" || r.quote.status === "изпратена"))) return false;
      return matches(q, [r.plate], [r.quote.number, r.quote.title, r.clientName, r.carName]);
    });
  }, [data, q, filter]);
  if (!data) return <Loading error={error} />;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Оферти и доклади</h1>
          <div className="muted">{data.length} общо · нова оферта или доклад се прави от страницата на автомобила или от работната карта</div>
        </div>
        <Link className="btn primary" to="/cars"><Icon name="plus" />Нова оферта</Link>
      </div>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="search">
          <Icon name="search" color="var(--muted)" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер, рег. номер, клиент, заглавие" aria-label="Търси оферта или доклад" />
        </label>
        <div className="chips">
          {([["all", "Всички"], ["open", "Чакащи отговор"], ["оферта", "Оферти"], ["reports", "Доклади"]] as [Filter, string][]).map(([f, l]) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>
          ))}
        </div>
      </section>
      <section className="card">
        <QuoteList rows={rows} showCar empty={data.length === 0 ? "Още няма оферти и доклади." : "Няма съвпадения."} />
      </section>
    </div>
  );
}

export function QuoteList({ rows, showCar, empty = "Още няма оферти и доклади." }: { rows: QuoteSummary[]; showCar: boolean; empty?: string }) {
  const nav = useNavigate();
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr><th>Номер</th><th>Дата</th><th>Вид</th>{showCar && <th>Автомобил</th>}{showCar && <th>Клиент</th>}<th>Заглавие</th><th className="right">Сума</th><th>Статус</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = QUOTE_STATUS[r.quote.status];
            const total = Number(r.totals.total);
            return (
              <tr key={r.quote.id} className="link" onClick={() => nav(`/quotes/${r.quote.id}`)}>
                <td className="mono small">{r.quote.number}</td>
                <td className="mono small">{date(r.quote.date)}</td>
                <td className="small">{KIND_LABEL[r.quote.kind] ?? r.quote.kind}</td>
                {showCar && <td><Plate value={r.plate} /><div className="small muted">{r.carName}</div></td>}
                {showCar && <td>{r.clientName}</td>}
                <td>{r.quote.title || "—"}{r.orderNumber && <div className="small muted">{r.orderNumber}</div>}</td>
                <td className="mono small right">{total ? euro(r.totals.total) : ""}</td>
                <td>{r.quote.kind === "оферта" && st ? <span className={`badge ${st.tone}`}>{st.label}</span> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
