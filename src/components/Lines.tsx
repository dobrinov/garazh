import { useEffect, useState } from "react";
import { LaborLine, Money, PartLine } from "../api";
import { euro } from "../lib/format";
import { lineCents } from "../lib/totals";
import { RealOemPartLinks } from "./RealOem";
import { Icon } from "./ui";

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

export function PartsTable({ title, hint, lines, onChange, make }: { title: string; hint?: string; lines: PartLine[]; onChange: (l: PartLine[]) => void; /** The car's make: BMW part numbers then link to RealOEM. */ make?: string }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {hint && <div className="small muted">{hint}</div>}
        </div>
        <button className="btn small" onClick={() => onChange([...lines, { part: "", partNumber: "", quantity: 1, unit: "бр.", price: "0.00" }])}>+ Част</button>
      </div>
      <div className="table-wrap">
        <table className="tbl edit">
          <thead><tr><th style={{ width: "32%" }}>Част</th><th>Марка / кат. №</th><th className="right">К-во</th><th>Мярка</th><th className="right">Ед. цена €</th><th className="right">Сума</th><th /></tr></thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={7} className="muted small" style={{ padding: 14 }}>Няма добавени части.</td></tr>}
            {lines.map((p, i) => {
              const set = (patch: Partial<PartLine>) => onChange(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={i}>
                  <td><input value={p.part} onChange={(e) => set({ part: e.target.value })} aria-label="Част" /></td>
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
