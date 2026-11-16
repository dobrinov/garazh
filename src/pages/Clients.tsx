import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, CarSummary } from "../api";
import { DirectoryHead } from "../components/DirectoryHead";
import { DeadlineBadge, Icon, Loading, Plate, useLoad } from "../components/ui";
import { date, euro, km, matches, toCents } from "../lib/format";

type Kind = "all" | "частно" | "фирма";
type Sort = "recent" | "name" | "turnover" | "unpaid";

export function Clients() {
  const nav = useNavigate();
  const { data, error } = useLoad(() => api.listClients(), []);
  const carsLoad = useLoad(() => api.listCars(), []);
  const carInfo = useMemo(() => new Map<string, CarSummary>((carsLoad.data ?? []).map((c) => [c.car.id, c])), [carsLoad.data]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  const rows = useMemo(() => {
    if (!data) return [];
    const r = data.filter((c) => {
      if (kind !== "all" && c.client.kind !== kind) return false;
      if (unpaidOnly && toCents(c.unpaid) === 0) return false;
      if (openOnly && c.openOrders === 0) return false;
      return matches(
        q,
        c.cars.map((k) => k.plate),
        [c.client.name, c.client.phone, c.client.email, c.client.eik, String(c.client.number), ...c.cars.map((k) => `${k.make} ${k.model}`)],
      );
    });
    const by: Record<Sort, (a: (typeof r)[0], b: (typeof r)[0]) => number> = {
      recent: (a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""),
      name: (a, b) => a.client.name.localeCompare(b.client.name, "bg"),
      turnover: (a, b) => toCents(b.turnover) - toCents(a.turnover),
      unpaid: (a, b) => toCents(b.unpaid) - toCents(a.unpaid),
    };
    return [...r].sort(by[sort]);
  }, [data, q, kind, unpaidOnly, openOnly, sort]);

  if (!data) return <Loading error={error} />;
  const anyFilter = q || kind !== "all" || unpaidOnly || openOnly;

  return (
    <div className="page">
      <DirectoryHead sub={`${data.length} клиенти · ${data.reduce((s, c) => s + c.cars.length, 0)} автомобила`} />

      <section className="card pad stack" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row">
          <label className="search grow">
            <Icon name="search" color="var(--muted)" />
            <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Име, телефон, имейл, ЕИК или рег. номер на кола" aria-label="Търси клиент" />
          </label>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            Подреди
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: "auto" }}>
              <option value="recent">Последно посещение</option>
              <option value="name">Име (А–Я)</option>
              <option value="turnover">Оборот</option>
              <option value="unpaid">Неплатено</option>
            </select>
          </label>
        </div>
        <div className="chips">
          {(["all", "частно", "фирма"] as Kind[]).map((k) => (
            <button key={k} className={`chip ${kind === k ? "on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "all" ? "Всички" : k === "частно" ? "Частни лица" : "Фирми"}
            </button>
          ))}
          <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 6px" }} />
          <button className={`chip ${unpaidOnly ? "on" : ""}`} aria-pressed={unpaidOnly} onClick={() => setUnpaidOnly(!unpaidOnly)}>С неплатени суми</button>
          <button className={`chip ${openOnly ? "on" : ""}`} aria-pressed={openOnly} onClick={() => setOpenOnly(!openOnly)}>С кола в сервиза</button>
          {anyFilter && (
            <button className="btn ghost small" onClick={() => { setQ(""); setKind("all"); setUnpaidOnly(false); setOpenOnly(false); }}>Изчисти филтрите</button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><span className="muted">Показани <strong style={{ color: "var(--ink)" }}>{rows.length}</strong> от {data.length}</span></div>
        {rows.length === 0 ? (
          <div className="empty">{data.length === 0 ? "Все още няма клиенти. Добавете първия." : "Няма клиенти, отговарящи на търсенето."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Клиент</th><th>Автомобили</th><th>Последно посещение</th><th className="right">Оборот</th><th className="right">Неплатено</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.client.id} className="link" onClick={() => nav(`/clients/${c.client.id}`)}>
                    <td>
                      <strong>{c.client.name}</strong>
                      <div className="small muted">
                        {c.client.kind === "фирма" ? "Фирма" : "Частно лице"} · №{String(c.client.number).padStart(4, "0")}
                        {c.client.phone && <> · <a href={`tel:${c.client.phone}`} onClick={(e) => e.stopPropagation()}>{c.client.phone}</a></>}
                      </div>
                    </td>
                    <td>
                      <div className="dir-cars">
                        {c.cars.length === 0 && <span className="muted small">няма коли</span>}
                        {c.cars.map((k) => {
                          const info = carInfo.get(k.id);
                          const soon = info?.deadlines[0] && info.deadlines[0].days <= 30 ? info.deadlines[0] : null;
                          return (
                            <Link key={k.id} to={`/cars/${k.id}`} className="dir-car" onClick={(e) => e.stopPropagation()}>
                              <Plate value={k.plate} />
                              <strong>{k.make} {k.model}</strong>
                              {info && <span className="small muted">{km(info.usage.lastKm)}</span>}
                              {info?.openOrder ? <span className="badge accent">В сервиза</span> : soon ? <DeadlineBadge label={soon.label} days={soon.days} /> : null}
                            </Link>
                          );
                        })}
                      </div>
                    </td>
                    <td className="mono small">{date(c.lastVisit)}</td>
                    <td className="mono small right nowrap">{euro(c.turnover)}</td>
                    <td className="mono small right nowrap" style={{ color: toCents(c.unpaid) ? "var(--bad)" : "var(--muted)", fontWeight: 600 }}>
                      {toCents(c.unpaid) ? euro(c.unpaid) : "—"}
                    </td>
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
