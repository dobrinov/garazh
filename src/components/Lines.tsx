import { useEffect, useState } from "react";
import { LaborLine, Money, PartLine, StockItem } from "../api";
import { euro } from "../lib/format";
import { lineCents } from "../lib/totals";
import { formatQty } from "../lib/stock";
import { RealOemPartLinks } from "./RealOem";
import { Icon, Menu } from "./ui";

export function NumInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text.replace(",", ".")) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="mono right"
      inputMode="decimal"
      value={text}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function LaborTable({ title, lines, onChange, rate, mechanic = "" }: { title: string; lines: LaborLine[]; onChange: (l: LaborLine[]) => void; rate: Money; mechanic?: string }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <button className="btn small" onClick={() => onChange([...lines, { description: "", mechanic, hours: 1, rate }])}>+ Дейност</button>
      </div>
      <div className="table-wrap">
        <table className="tbl edit">
          <thead><tr><th style={{ width: "46%" }}>Дейност</th><th>Механик</th><th className="right">Часове</th><th className="right">Ставка €</th><th className="right">Сума</th><th /></tr></thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={6} className="muted small" style={{ padding: 14 }}>Няма добавени дейности.</td></tr>}
            {lines.map((l, i) => {
              const set = (p: Partial<LaborLine>) => onChange(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <tr key={i}>
                  <td><input value={l.description} onChange={(e) => set({ description: e.target.value })} aria-label="Дейност" /></td>
                  <td><input value={l.mechanic} onChange={(e) => set({ mechanic: e.target.value })} aria-label="Механик" /></td>
                  <td><NumInput value={l.hours} onChange={(v) => set({ hours: v })} label="Часове" /></td>
                  <td><input className="mono right" value={l.rate} onChange={(e) => set({ rate: e.target.value })} aria-label="Ставка" /></td>
                  <td className="mono right nowrap">{euro(lineCents(l.rate, l.hours))}</td>
                  <td><button className="btn small icon-btn danger" aria-label="Премахни дейността" onClick={() => onChange(lines.filter((_, j) => j !== i))}><Icon name="trash" size={15} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PartsTable({
  title,
  hint,
  lines,
  onChange,
  make,
  stock,
}: {
  title: string;
  hint?: string;
  lines: PartLine[];
  onChange: (l: PartLine[]) => void;
  /** The car's make: BMW part numbers then link to RealOEM. */
  make?: string;
  /** When stock is on: parts can be picked from it. */
  stock?: StockItem[];
}) {
  const [picking, setPicking] = useState(false);
  const byCode = new Map((stock ?? []).map((s) => [s.code, s]));
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {hint && <div className="small muted">{hint}</div>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {stock && <button className="btn small" onClick={() => setPicking(!picking)}><Icon name="box" size={14} />От склада</button>}
          <button className="btn small" onClick={() => onChange([...lines, { part: "", partNumber: "", quantity: 1, unit: "бр.", price: "0.00" }])}>+ Част</button>
        </div>
      </div>
      {stock && picking && (
        <StockPicker
          stock={stock}
          onPick={(s) => {
            onChange([...lines, { part: s.part, partNumber: s.partNumber, quantity: 1, unit: s.unit || "бр.", price: s.sellPrice, stockCode: s.code }]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <div className="table-wrap">
        <table className="tbl edit">
          <thead><tr><th style={{ width: "32%" }}>Част</th><th>Марка / кат. №</th><th className="right">К-во</th><th>Мярка</th><th className="right">Ед. цена €</th><th className="right">Сума</th><th /></tr></thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={7} className="muted small" style={{ padding: 14 }}>Няма добавени части.</td></tr>}
            {lines.map((p, i) => {
              const set = (patch: Partial<PartLine>) => onChange(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={i}>
                  <td>
                    <input value={p.part} onChange={(e) => set({ part: e.target.value })} aria-label="Част" />
                    {p.stockCode && <StockNote line={p} item={byCode.get(p.stockCode)} known={!!stock} />}
                  </td>
                  <td><div className="cell-with-action"><input value={p.partNumber} onChange={(e) => set({ partNumber: e.target.value })} aria-label="Марка или каталожен номер" /><RealOemPartLinks make={make} text={p.partNumber} /></div></td>
                  <td style={{ width: 90 }}><NumInput value={p.quantity} onChange={(v) => set({ quantity: v })} label="Количество" /></td>
                  <td style={{ width: 80 }}><input value={p.unit} onChange={(e) => set({ unit: e.target.value })} aria-label="Мярка" list="units" /></td>
                  <td style={{ width: 110 }}><input className="mono right" value={p.price} onChange={(e) => set({ price: e.target.value })} aria-label="Единична цена" /></td>
                  <td className="mono right nowrap">{euro(lineCents(p.price, p.quantity))}</td>
                  <td><button className="btn small icon-btn danger" aria-label="Премахни частта" onClick={() => onChange(lines.filter((_, j) => j !== i))}><Icon name="trash" size={15} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id="units"><option value="бр." /><option value="л" /><option value="к-т" /><option value="м" /></datalist>
    </section>
  );
}

function StockNote({ line, item, known }: { line: PartLine; item?: StockItem; known: boolean }) {
  if (!known) return <div className="small muted stock-note">от склада, {line.stockCode}</div>;
  if (!item) return <div className="small stock-note" style={{ color: "var(--bad)" }}>{line.stockCode} – вече не е в склада</div>;
  const short = line.quantity > item.quantity;
  return (
    <div className="small stock-note" style={{ color: short ? "var(--bad)" : undefined }}>
      {item.code} · в склада {formatQty(item.quantity)}&nbsp;{item.unit}{short && " – не стига"}
    </div>
  );
}

function StockPicker({ stock, onPick, onClose }: { stock: StockItem[]; onPick: (s: StockItem) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const found = stock.filter((s) => !t || `${s.code} ${s.part} ${s.partNumber}`.toLowerCase().includes(t)).slice(0, 12);
  return (
    <div className="stock-picker">
      <label className="search">
        <Icon name="search" color="var(--muted)" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && found[0]) {
              e.preventDefault();
              onPick(found[0]);
            }
          }}
          placeholder="Търси в склада: част, кат. №, код"
          aria-label="Търси в склада"
        />
      </label>
      {stock.length === 0 ? (
        <div className="small muted">Складът е празен.</div>
      ) : found.length === 0 ? (
        <div className="small muted">Няма съвпадения.</div>
      ) : (
        <div className="stock-picker-list">
          {found.map((s) => (
            <button key={s.code} type="button" className="stock-picker-row" onClick={() => onPick(s)}>
              <span><strong>{s.part}</strong> <span className="small muted">{s.partNumber}</span></span>
              <span className="small mono nowrap" style={{ color: s.quantity <= 0 ? "var(--bad)" : undefined }}>{formatQty(s.quantity)} {s.unit}</span>
              <span className="small mono nowrap right">{euro(s.sellPrice)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lines as printed on a customer document. */
export function PrintLines({ labor, parts }: { labor: LaborLine[]; parts: PartLine[] }) {
  return (
    <table>
      <thead><tr><th>Позиция</th><th style={{ textAlign: "right" }}>К-во</th><th style={{ textAlign: "right" }}>Цена</th><th style={{ textAlign: "right" }}>Сума</th></tr></thead>
      <tbody>
        {labor.filter((l) => l.description).map((l, i) => (
          <tr key={`l${i}`}><td>{l.description}</td><td style={{ textAlign: "right" }}>{l.hours} ч</td><td style={{ textAlign: "right" }}>{euro(l.rate)}</td><td style={{ textAlign: "right" }}>{euro(lineCents(l.rate, l.hours))}</td></tr>
        ))}
        {parts.filter((p) => p.part).map((p, i) => (
          <tr key={`p${i}`}><td>{p.part}{p.partNumber && <span> · {p.partNumber}</span>}</td><td style={{ textAlign: "right" }}>{p.quantity} {p.unit}</td><td style={{ textAlign: "right" }}>{euro(p.price)}</td><td style={{ textAlign: "right" }}>{euro(lineCents(p.price, p.quantity))}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Labour and parts in one table: one place to read the job and one row of
 * buttons to add to it. The work order keeps them as two lists.
 */
export function WorkLines({
  labor,
  parts,
  onChange,
  rate,
  mechanic = "",
  make,
  stock,
  jobs,
  hint,
}: {
  labor: LaborLine[];
  parts: PartLine[];
  onChange: (labor: LaborLine[], parts: PartLine[]) => void;
  rate: Money;
  mechanic?: string;
  make?: string;
  stock?: StockItem[];
  /** Usual jobs: picking one adds its lines. */
  jobs?: { name: string; labor: LaborLine[]; parts: PartLine[] }[];
  hint?: string;
}) {
  const [picking, setPicking] = useState(false);
  const byCode = new Map((stock ?? []).map((s) => [s.code, s]));
  const setL = (i: number, p: Partial<LaborLine>) => onChange(labor.map((x, j) => (j === i ? { ...x, ...p } : x)), parts);
  const setP = (i: number, p: Partial<PartLine>) => onChange(labor, parts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const isZero = (m: Money) => !Number(String(m).replace(",", "."));
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Работа и части</h2>
          {hint && <div className="small muted">{hint}</div>}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {jobs && jobs.length > 0 && (
            <Menu
              small
              label="Обичайна работа"
              items={jobs.map((j) => ({
                label: j.name,
                onSelect: () =>
                  onChange(
                    [...labor.filter((l) => l.description.trim()), ...j.labor.map((l) => ({ ...l, mechanic: l.mechanic || mechanic, rate: isZero(l.rate) ? rate : l.rate }))],
                    [...parts, ...j.parts.map((p) => ({ ...p }))],
                  ),
              }))}
            />
          )}
          {stock && <button className="btn small" onClick={() => setPicking(!picking)}><Icon name="box" size={14} />От склада</button>}
          <button className="btn small" onClick={() => onChange([...labor, { description: "", mechanic, hours: 1, rate }], parts)}>+ Труд</button>
          <button className="btn small dark" onClick={() => onChange(labor, [...parts, { part: "", partNumber: "", quantity: 1, unit: "бр.", price: "0.00" }])}>+ Част</button>
        </div>
      </div>
      {stock && picking && (
        <StockPicker
          stock={stock}
          onPick={(s) => {
            onChange(labor, [...parts, { part: s.part, partNumber: s.partNumber, quantity: 1, unit: s.unit || "бр.", price: s.sellPrice, stockCode: s.code }]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <div className="table-wrap">
        <table className="tbl edit work-lines">
          <thead>
            <tr>
              <th style={{ width: 62 }}>Вид</th>
              <th style={{ width: "34%" }}>Описание</th>
              <th>Механик / кат. №</th>
              <th className="right" style={{ width: 80 }}>К-во</th>
              <th style={{ width: 70 }}>Мярка</th>
              <th className="right" style={{ width: 100 }}>Цена €</th>
              <th className="right">Сума</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {labor.length === 0 && parts.length === 0 && (
              <tr><td colSpan={8} className="muted small" style={{ padding: 14 }}>Още няма редове. Добавете труд и части{jobs && jobs.length ? " или изберете обичайна работа" : ""}.</td></tr>
            )}
            {labor.map((l, i) => (
              <tr key={`l${i}`}>
                <td><span className="kind labor">Труд</span></td>
                <td><input value={l.description} onChange={(e) => setL(i, { description: e.target.value })} aria-label="Дейност" placeholder="Дейност" /></td>
                <td><input value={l.mechanic} onChange={(e) => setL(i, { mechanic: e.target.value })} aria-label="Механик" placeholder="Механик" /></td>
                <td><NumInput value={l.hours} onChange={(v) => setL(i, { hours: v })} label="Часове" /></td>
                <td className="muted small">ч</td>
                <td><input className="mono right" value={l.rate} onChange={(e) => setL(i, { rate: e.target.value })} aria-label="Ставка на час" /></td>
                <td className="mono right nowrap">{euro(lineCents(l.rate, l.hours))}</td>
                <td><button className="btn small icon-btn danger" aria-label="Премахни реда" onClick={() => onChange(labor.filter((_, j) => j !== i), parts)}><Icon name="trash" size={15} /></button></td>
              </tr>
            ))}
            {parts.map((p, i) => (
              <tr key={`p${i}`}>
                <td><span className="kind part">Част</span></td>
                <td>
                  <input value={p.part} onChange={(e) => setP(i, { part: e.target.value })} aria-label="Част" placeholder="Част" />
                  {p.stockCode && <StockNote line={p} item={byCode.get(p.stockCode)} known={!!stock} />}
                </td>
                <td><div className="cell-with-action"><input value={p.partNumber} onChange={(e) => setP(i, { partNumber: e.target.value })} aria-label="Марка или каталожен номер" placeholder="Марка / кат. №" /><RealOemPartLinks make={make} text={p.partNumber} /></div></td>
                <td><NumInput value={p.quantity} onChange={(v) => setP(i, { quantity: v })} label="Количество" /></td>
                <td><input value={p.unit} onChange={(e) => setP(i, { unit: e.target.value })} aria-label="Мярка" list="units" /></td>
                <td><input className="mono right" value={p.price} onChange={(e) => setP(i, { price: e.target.value })} aria-label="Единична цена" /></td>
                <td className="mono right nowrap">{euro(lineCents(p.price, p.quantity))}</td>
                <td><button className="btn small icon-btn danger" aria-label="Премахни реда" onClick={() => onChange(labor, parts.filter((_, j) => j !== i))}><Icon name="trash" size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="units"><option value="бр." /><option value="л" /><option value="к-т" /><option value="м" /></datalist>
    </section>
  );
}
