import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, Money, StockItem, StockMove } from "../api";
import { Icon, Loading, useToast } from "../components/ui";
import { date, euro } from "../lib/format";
import { formatQty, parseQty } from "../lib/stock";

const EMPTY: StockItem = { code: "", part: "", partNumber: "", quantity: 0, unit: "бр.", minimum: 0, buyPrice: "0.00", sellPrice: "0.00", place: "" };

type Change = { code: string; kind: "delivery" | "correction"; qty: string; reason: string; price: string };

export function Stock() {
  const toast = useToast();
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [moves, setMoves] = useState<StockMove[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<{ item: StockItem; original: string | null } | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [showMoves, setShowMoves] = useState(false);

  const reloadMoves = () => api.stockMoves().then(setMoves).catch(() => {});
  useEffect(() => {
    api.stockList().then(setItems).catch((e) => setError(errorMessage(e)));
    reloadMoves();
  }, []);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter(
      (i) => (!lowOnly || isLow(i)) && (!t || `${i.code} ${i.part} ${i.partNumber} ${i.place}`.toLowerCase().includes(t)),
    );
  }, [items, q, lowOnly]);

  if (!items) return <Loading error={error} />;
  const lowCount = items.filter(isLow).length;
  const value = items.reduce((s, i) => s + Math.max(0, i.quantity) * Number(i.buyPrice || 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      setItems(await api.stockSave(editing.item, editing.original));
      toast(editing.original ? "Артикулът е запазен" : "Артикулът е добавен");
      setEditing(null);
      reloadMoves();
    } catch (err) {
      toast(errorMessage(err), true);
    }
  }

  async function applyChange(e: FormEvent) {
    e.preventDefault();
    if (!change) return;
    const n = parseQty(change.qty);
    if (n === null || n === 0) {
      toast("Въведете количество", true);
      return;
    }
    const amount = change.kind === "delivery" ? Math.abs(n) : n;
    const reason = change.reason.trim() || (change.kind === "delivery" ? "доставка" : "корекция");
    const price: Money | null = change.kind === "delivery" && change.price.trim() ? change.price.trim().replace(",", ".") : null;
    try {
      setItems(await api.stockChange(change.code, amount, reason, price));
      toast(change.kind === "delivery" ? "Доставката е записана" : "Корекцията е записана");
      setChange(null);
      reloadMoves();
    } catch (err) {
      toast(errorMessage(err), true);
    }
  }

  async function remove(i: StockItem) {
    if (!window.confirm(`Да се премахне ли „${i.part}“ (${i.code}) от склада? Движенията остават в движения.md.`)) return;
    try {
      setItems(await api.stockRemove(i.code));
      setEditing(null);
    } catch (err) {
      toast(errorMessage(err), true);
    }
  }

  async function openFolder() {
    try {
      await api.openPath(await api.recordDir("stock"));
    } catch (err) {
      toast(errorMessage(err), true);
    }
  }

  const setItem = (p: Partial<StockItem>) => editing && setEditing({ ...editing, item: { ...editing.item, ...p } });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Склад</h1>
          <div className="muted">Части от склада се избират в работната карта и се изписват при приключването ѝ.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={openFolder}><Icon name="folder" />Отвори папката</button>
          <button className="btn primary" onClick={() => setEditing({ item: { ...EMPTY }, original: null })}><Icon name="plus" />Нов артикул</button>
        </div>
      </div>

      <section className="stats">
        <div className="card stat"><div className="label">Артикули</div><div className="value">{items.length}</div></div>
        <button className={`card stat stat-button${lowOnly ? " active" : ""}`} onClick={() => setLowOnly(!lowOnly)} disabled={lowCount === 0}>
          <div className="label">За поръчка</div>
          <div className="value" style={{ color: lowCount ? "var(--bad)" : undefined }}>{lowCount}</div>
        </button>
        <div className="card stat"><div className="label">Стойност по доставни цени</div><div className="value">{euro(value.toFixed(2))}</div></div>
      </section>

      {editing && (
        <form className="card pad" onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2>{editing.original ? `Артикул ${editing.original}` : "Нов артикул"}</h2>
          <div className="grid">
            <label className="field">Част / консуматив<input className="input" value={editing.item.part} onChange={(e) => setItem({ part: e.target.value })} required autoFocus /></label>
            <label className="field">Марка / кат. №<input className="input" value={editing.item.partNumber} onChange={(e) => setItem({ partNumber: e.target.value })} /></label>
            <label className="field">Код<input className="input mono" value={editing.item.code} onChange={(e) => setItem({ code: e.target.value })} placeholder="автоматично" /><span className="hint">Кратък и уникален, напр. С0012</span></label>
            {!editing.original && (
              <label className="field">Начална наличност<input className="input mono" inputMode="decimal" value={String(editing.item.quantity)} onChange={(e) => setItem({ quantity: parseQty(e.target.value) ?? 0 })} /></label>
            )}
            <label className="field">Мярка<input className="input" value={editing.item.unit} onChange={(e) => setItem({ unit: e.target.value })} list="stock-units" /></label>
            <label className="field">Минимално количество<input className="input mono" inputMode="decimal" value={editing.item.minimum ? String(editing.item.minimum) : ""} onChange={(e) => setItem({ minimum: parseQty(e.target.value) ?? 0 })} placeholder="без" /><span className="hint">Под него артикулът е „за поръчка“</span></label>
            <label className="field">Доставна цена €<input className="input mono" inputMode="decimal" value={editing.item.buyPrice} onChange={(e) => setItem({ buyPrice: e.target.value.replace(",", ".") })} /></label>
            <label className="field">Продажна цена €<input className="input mono" inputMode="decimal" value={editing.item.sellPrice} onChange={(e) => setItem({ sellPrice: e.target.value.replace(",", ".") })} /><span className="hint">Попълва се в работната карта</span></label>
            <label className="field">Място<input className="input" value={editing.item.place} onChange={(e) => setItem({ place: e.target.value })} placeholder="рафт, кутия" /></label>
          </div>
          {editing.original && <div className="small muted">Наличността се променя с „Доставка“ или „Корекция“, за да остане записана в движенията.</div>}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>{editing.original && <button type="button" className="btn danger" onClick={() => remove(editing.item.code === editing.original ? editing.item : { ...editing.item, code: editing.original! })}><Icon name="trash" size={15} />Премахни</button>}</div>
            <div className="row">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Отказ</button>
              <button type="submit" className="btn primary">Запази</button>
            </div>
          </div>
          <datalist id="stock-units"><option value="бр." /><option value="л" /><option value="к-т" /><option value="м" /><option value="кг" /></datalist>
        </form>
      )}

      {change && (
        <form className="card pad" onSubmit={applyChange} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>{change.kind === "delivery" ? "Доставка" : "Корекция"}: {items.find((i) => i.code === change.code)?.part} <span className="muted mono small">{change.code}</span></h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="field" style={{ width: 160 }}>
              {change.kind === "delivery" ? "Доставено количество" : "Промяна (+ или −)"}
              <input className="input mono" inputMode="decimal" value={change.qty} onChange={(e) => setChange({ ...change, qty: e.target.value })} placeholder={change.kind === "delivery" ? "10" : "-2"} autoFocus required />
            </label>
            {change.kind === "delivery" && (
              <label className="field" style={{ width: 170 }}>
                Нова доставна цена €
                <input className="input mono" inputMode="decimal" value={change.price} onChange={(e) => setChange({ ...change, price: e.target.value })} placeholder="без промяна" />
              </label>
            )}
            <label className="field grow">
              {change.kind === "delivery" ? "Доставчик / фактура" : "Причина"}
              <input className="input" value={change.reason} onChange={(e) => setChange({ ...change, reason: e.target.value })} placeholder={change.kind === "delivery" ? "напр. Авто Плюс, ф-ра 1234" : "напр. инвентаризация, повредена"} />
            </label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setChange(null)}>Отказ</button>
            <button type="submit" className="btn primary">Запиши</button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="card-head">
          <label className="search" style={{ flex: "0 1 360px" }}>
            <Icon name="search" color="var(--muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търси част, кат. №, код, място" aria-label="Търси в склада" />
          </label>
          {lowOnly && <button className="btn small" onClick={() => setLowOnly(false)}>Покажи всички</button>}
        </div>
        {items.length === 0 ? (
          <div className="empty">Складът е празен. Добавете първия артикул с „Нов артикул“.</div>
        ) : rows.length === 0 ? (
          <div className="empty">Няма съвпадения.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Код</th><th>Част</th><th>Марка / кат. №</th><th className="right">Наличност</th><th className="right">Мин.</th><th className="right">Доставна</th><th className="right">Продажна</th><th>Място</th><th /></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.code}>
                    <td className="mono small">{i.code}</td>
                    <td><strong>{i.part}</strong></td>
                    <td className="small">{i.partNumber}</td>
                    <td className="right nowrap">
                      <strong className="mono" style={{ color: i.quantity <= 0 ? "var(--bad)" : undefined }}>{formatQty(i.quantity)}</strong> <span className="small muted">{i.unit}</span>
                      {isLow(i) && <div><span className={`badge ${i.quantity <= 0 ? "bad" : "warn"}`}>{i.quantity <= 0 ? "Няма" : "За поръчка"}</span></div>}
                    </td>
                    <td className="mono small right">{i.minimum ? formatQty(i.minimum) : ""}</td>
                    <td className="mono small right">{euro(i.buyPrice)}</td>
                    <td className="mono small right">{euro(i.sellPrice)}</td>
                    <td className="small">{i.place}</td>
                    <td className="nowrap right">
                      <button className="btn small" onClick={() => setChange({ code: i.code, kind: "delivery", qty: "", reason: "", price: "" })}>+ Доставка</button>{" "}
                      <button className="btn small ghost" onClick={() => setChange({ code: i.code, kind: "correction", qty: "", reason: "", price: "" })}>Корекция</button>{" "}
                      <button className="btn small ghost" onClick={() => setEditing({ item: { ...i }, original: i.code })}>Редактирай</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Движения</h2>
          <button className="btn small" onClick={() => setShowMoves(!showMoves)}>{showMoves ? "Скрий" : `Покажи (${moves?.length ?? 0})`}</button>
        </div>
        {showMoves && (moves && moves.length > 0 ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Дата</th><th>Код</th><th>Част</th><th className="right">Промяна</th><th className="right">Остатък</th><th>Причина</th><th>Работна карта</th></tr></thead>
              <tbody>
                {moves.slice(0, 200).map((m, i) => (
                  <tr key={i}>
                    <td className="mono small">{date(m.date)}</td>
                    <td className="mono small">{m.code}</td>
                    <td>{m.part}</td>
                    <td className="mono right" style={{ color: m.change < 0 ? "var(--bad)" : "var(--good, #15803d)" }}>{m.change > 0 ? "+" : ""}{formatQty(m.change)}</td>
                    <td className="mono small right">{formatQty(m.balance)}</td>
                    <td className="small">{m.reason}</td>
                    <td className="mono small">{m.order && <Link to={`/orders?q=${encodeURIComponent(m.order)}`}>{m.order}</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Още няма движения.</div>
        ))}
      </section>
    </div>
  );
}

function isLow(i: StockItem): boolean {
  return i.minimum > 0 && i.quantity <= i.minimum;
}
