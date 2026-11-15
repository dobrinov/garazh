import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Icon, Loading, Plate, StatusBadge, useLoad } from "../components/ui";
import { date, euro, matches } from "../lib/format";

type Filter = "open" | "unpaid" | "all";

export function Orders() {
  const nav = useNavigate();
  const { data, error } = useLoad(() => api.listOrders(), []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("open");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.filter((o) => {
      if (filter === "open" && o.order.status === "предадена") return false;
      if (filter === "unpaid" && !(o.order.closedOn && !o.order.paid)) return false;
      return matches(q, [o.plate], [o.order.number, o.order.title, o.order.complaint, o.clientName, o.carName]);
    });
  }, [data, q, filter]);

  if (!data) return <Loading error={error} />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Работни карти</h1>
          <div className="muted">{data.length} общо</div>
        </div>
        <Link className="btn primary" to="/cars"><Icon name="plus" />Нова работна карта</Link>
      </div>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="search">
          <Icon name="search" color="var(--muted)" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер, рег. номер, клиент, работа" aria-label="Търси работна карта" />
        </label>
        <div className="chips">
          {([["open", "Отворени"], ["unpaid", "Неплатени"], ["all", "Всички"]] as [Filter, string][]).map(([f, l]) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>
          ))}
        </div>
      </section>
      <section className="card">
        {rows.length === 0 ? (
          <div className="empty">{data.length === 0 ? "Още няма работни карти. Започнете от страницата на автомобила." : "Няма съвпадения."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Номер</th><th>Дата</th><th>Автомобил</th><th>Клиент</th><th>Работа</th><th className="right">Сума</th><th>Статус</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.order.id} className="link" onClick={() => nav(`/orders/${o.order.id}`)}>
                    <td className="mono small">{o.order.number}</td>
                    <td className="mono small">{date(o.order.date)}</td>
                    <td><Plate value={o.plate} /><div className="small muted">{o.carName}</div></td>
                    <td>{o.clientName}</td>
                    <td>{o.order.title || o.order.complaint || "—"}</td>
                    <td className="mono small right">{euro(o.totals.total)}</td>
                    <td><StatusBadge status={o.order.status} />{o.order.closedOn && !o.order.paid && <span className="badge bad" style={{ marginLeft: 6 }}>Неплатена</span>}</td>
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
