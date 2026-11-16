import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, CarSummary } from "../api";
import { DirectoryHead } from "../components/DirectoryHead";
import { DeadlineBadge, Icon, Loading, Plate, useLoad } from "../components/ui";
import { date, int, km, matches } from "../lib/format";

type Sort = "recent" | "plate" | "make" | "usage" | "deadline";

export function Cars() {
  const nav = useNavigate();
  const { data, error } = useLoad(() => api.listCars(), []);
  const [q, setQ] = useState("");
  const [make, setMake] = useState("all");
  const [soon, setSoon] = useState(false);
  const [inShop, setInShop] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  const makes = useMemo(() => {
    const counts = new Map<string, number>();
    (data ?? []).forEach((c) => c.car.make && counts.set(c.car.make, (counts.get(c.car.make) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const firstDeadline = (c: CarSummary) => c.deadlines[0]?.days ?? 99999;
    const r = data.filter((c) => {
      if (make !== "all" && c.car.make !== make) return false;
      if (soon && firstDeadline(c) > 30) return false;
      if (inShop && !c.openOrder) return false;
      const k = c.car;
      return matches(q, [k.plate], [k.vin, `${k.make} ${k.model}`, k.model, k.engine, k.engineCode, k.gearbox, k.gearboxCode, c.ownerName, String(k.year ?? "")]);
    });
    const by: Record<Sort, (a: CarSummary, b: CarSummary) => number> = {
      recent: (a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""),
      plate: (a, b) => a.car.plate.localeCompare(b.car.plate, "bg"),
      make: (a, b) => `${a.car.make} ${a.car.model}`.localeCompare(`${b.car.make} ${b.car.model}`),
      usage: (a, b) => (b.usage.recentPerMonth ?? 0) - (a.usage.recentPerMonth ?? 0),
      deadline: (a, b) => firstDeadline(a) - firstDeadline(b),
    };
    return [...r].sort(by[sort]);
  }, [data, q, make, soon, inShop, sort]);

  if (!data) return <Loading error={error} />;

  return (
    <div className="page">
      <DirectoryHead sub={`${data.length} автомобила · ${makes.length} марки`} />

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row">
          <label className="search grow">
            <Icon name="search" color="var(--muted)" />
            <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Рег. номер, VIN, марка и модел, двигател или собственик" aria-label="Търси автомобил" />
          </label>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            Подреди
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: "auto" }}>
              <option value="recent">Последно посещение</option>
              <option value="deadline">Най-близък срок</option>
              <option value="plate">Рег. номер</option>
              <option value="make">Марка и модел</option>
              <option value="usage">Най-много км/месец</option>
            </select>
          </label>
        </div>
        {makes.length > 0 && (
          <div className="chips">
            <button className={`chip ${make === "all" ? "on" : ""}`} onClick={() => setMake("all")}>Всички</button>
            {makes.map(([m, n]) => (
              <button key={m} className={`chip ${make === m ? "on" : ""}`} aria-pressed={make === m} onClick={() => setMake(make === m ? "all" : m)}>
                {m} · {n}
              </button>
            ))}
          </div>
        )}
        <div className="chips">
          <button className={`chip ${soon ? "on" : ""}`} aria-pressed={soon} onClick={() => setSoon(!soon)}>Срок до 30 дни</button>
          <button className={`chip ${inShop ? "on" : ""}`} aria-pressed={inShop} onClick={() => setInShop(!inShop)}>В сервиза сега</button>
        </div>
        <span className="muted small">Номерът може да се пише с латиница и без интервали – „ca4821“ намира „СА 4821 КН“. VIN се търси и по част.</span>
      </section>

      <section className="card">
        <div className="card-head"><span className="muted">Показани <strong style={{ color: "var(--ink)" }}>{rows.length}</strong> от {data.length}</span></div>
        {rows.length === 0 ? (
          <div className="empty">{data.length === 0 ? "Все още няма автомобили. Добавете ги от страницата на клиента." : "Няма автомобил с такъв номер, VIN или модел."}</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Рег. номер</th><th>Автомобил</th><th>VIN</th><th>Двигател · кутия</th><th className="right">Пробег</th><th className="right">км/мес.</th><th>Собственик</th><th>Срок / статус</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.car.id} className="link" onClick={() => nav(`/cars/${c.car.id}`)}>
                    <td><Plate value={c.car.plate} /></td>
                    <td><strong>{c.car.make} {c.car.model}</strong><div className="small muted">{[c.car.year, c.car.fuel].filter(Boolean).join(" · ")}</div></td>
                    <td className="mono small">{c.car.vin || "—"}</td>
                    <td className="small">{[c.car.engine, c.car.engineCode].filter(Boolean).join(" ") || "—"}<div className="muted">{[c.car.gearbox, c.car.gearboxCode].filter(Boolean).join(" ")}</div></td>
                    <td className="mono small right nowrap">{km(c.usage.lastKm)}</td>
                    <td className="mono small right">{int(c.usage.recentPerMonth)}</td>
                    <td className="small">{c.ownerName}</td>
                    <td>
                      {c.openOrder ? <span className="badge accent">В сервиза</span> : c.deadlines[0] && c.deadlines[0].days <= 60 ? <DeadlineBadge label={c.deadlines[0].label} days={c.deadlines[0].days} /> : <span className="muted small">{c.lastVisit ? `посещение ${date(c.lastVisit)}` : "—"}</span>}
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
