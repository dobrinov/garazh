import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Car, Client, emptyQuote, errorMessage, FileInfo, isConflict, Quote, QuoteKind, Shop } from "../api";
import { FaultCodes } from "../components/FaultCodes";
import { useBrand } from "../components/brand";
import { useFeatures } from "../components/features";
import { Files } from "../components/Files";
import { LaborTable, PartsTable, PrintLines } from "../components/Lines";
import { Icon, Loading, Plate, TextField, useToast } from "../components/ui";
import { date, euro, km, todayIso } from "../lib/format";
import { computeTotals } from "../lib/totals";
import { KIND_LABEL, QUOTE_STATUS } from "./Quotes";

interface Ctx {
  car: Car;
  client: Client;
  shop: Shop;
  files: FileInfo[];
  orderNumber: string;
}

const PRINT_TITLE: Record<string, string> = { оферта: "Оферта", доклад: "Доклад за извършен ремонт", диагностика: "Доклад от диагностика" };

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function QuotePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const features = useFeatures();
  const [q, setQ] = useState<Quote | null>(null);
  const [notes, setNotes] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [dir, setDir] = useState("");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const shop = (await api.getShop()).data;
        if (id) {
          const d = await api.getQuote(id);
          if (!alive) return;
          setQ(d.quote.data);
          setNotes(d.quote.notes);
          setHash(d.quote.hash);
          setDir(d.quote.dir);
          setCtx({ car: d.car, client: d.client, shop, files: d.files, orderNumber: d.orderNumber });
        } else {
          const kind = (params.get("kind") ?? "оферта") as QuoteKind;
          const orderId = params.get("order");
          const today = todayIso();
          if (orderId) {
            // A report made from a work order starts with its content.
            const o = await api.getOrder(orderId);
            if (!alive) return;
            const w = o.order.data;
            const draft = emptyQuote(w.carId, kind);
            Object.assign(draft, {
              date: today,
              orderId,
              mileage: w.mileage,
              title: w.title,
              findings: w.complaint,
              recommendations: kind === "доклад" ? o.order.notes.trim() : "",
              labor: w.labor.filter((l) => l.description.trim()),
              parts: kind === "доклад" ? w.parts.filter((p) => p.part.trim()) : [],
              discountPercent: w.discountPercent,
              vatPercent: w.vatPercent,
            });
            if (kind === "диагностика") draft.labor = [];
            setQ(draft);
            setCtx({ car: o.car, client: o.client, shop, files: o.files, orderNumber: w.number });
          } else {
            const carId = params.get("car") ?? "";
            if (!carId) throw new Error("Изберете автомобил, за който е документът.");
            const c = await api.getCar(carId);
            if (!alive) return;
            const draft = emptyQuote(carId, kind);
            draft.date = today;
            draft.mileage = c.usage.lastKm;
            draft.discountPercent = c.owner.discountPercent;
            if (kind === "оферта") {
              draft.validUntil = addDays(today, 14);
              draft.vatPercent = shop.vatRegistered ? shop.vatPercent : 0;
              draft.labor = [{ description: "", mechanic: "", hours: 1, rate: shop.laborRate }];
            }
            setQ(draft);
            setCtx({ car: c.car.data, client: c.owner, shop, files: [], orderNumber: "" });
          }
        }
        setDirty(false);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, tick, params]);

  const totals = useMemo(() => (q ? computeTotals(q.labor, q.parts, q.discountPercent, q.vatPercent) : null), [q]);
  if (!q || !ctx || !totals) return <Loading error={error} />;

  const update = (patch: Partial<Quote>) => {
    setQ({ ...q, ...patch });
    setDirty(true);
  };
  const isQuote = q.kind === "оферта";
  const hasLines = q.labor.length > 0 || q.parts.length > 0;

  async function save(): Promise<Quote | null> {
    if (!q) return null;
    setBusy(true);
    try {
      const saved = await api.saveQuote({ data: q, notes, baseHash: hash });
      setQ(saved.data);
      setHash(saved.hash);
      setDir(saved.dir);
      setDirty(false);
      toast(`Запазен ${saved.data.number}`);
      if (!id) nav(`/quotes/${saved.data.id}`, { replace: true });
      return saved.data;
    } catch (e) {
      toast(isConflict(e) ? "Документът е променен извън програмата. Презаредете страницата и повторете промените." : errorMessage(e), true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    const saved = dirty || !id ? await save() : q;
    if (!saved) return;
    try {
      const order = await api.acceptQuote(saved.id);
      toast(`Офертата е приета – отворена е ${order.data.number}`);
      nav(`/orders/${order.data.id}`);
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }

  async function print() {
    if (dirty || !id) {
      const saved = await save();
      if (!saved) return;
    }
    // Let the saved number render before the print dialog opens.
    setTimeout(() => window.print(), 50);
  }

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="crumbs">
            <Link to="/quotes">Оферти и доклади</Link><span>/</span><Link to={`/cars/${ctx.car.id}`}>{ctx.car.plate}</Link><span>/</span><span>{q.number || "Нов"}</span>
          </div>
          <h1>{KIND_LABEL[q.kind]} <span className="mono" style={{ fontSize: 22 }}>{q.number || "(нов)"}</span></h1>
          <div className="muted">
            {ctx.client.name} · <Plate value={ctx.car.plate} /> {ctx.car.make} {ctx.car.model}
            {q.orderId && ctx.orderNumber && <> · <Link to={`/orders/${q.orderId}`}>{ctx.orderNumber}</Link></>}
          </div>
        </div>
        <div className="row">
          {dir && <button className="btn" onClick={() => api.openPath(dir)}><Icon name="folder" />Папка</button>}
          <button className="btn" onClick={print} disabled={busy}><Icon name="print" />Печат / PDF</button>
          <button className="btn" onClick={save} disabled={busy || (!dirty && !!id)}>{dirty || !id ? "Запази" : "Запазено"}</button>
          {isQuote && !q.orderId && <button className="btn primary" onClick={accept} disabled={busy}><Icon name="check" />Клиентът прие – работна карта</button>}
        </div>
      </div>

      <div className="cols no-print">
        <div className="wide" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="grid">
              <TextField label="Заглавие" value={q.title} onChange={(v) => update({ title: v })} placeholder={isQuote ? "напр. Смяна на съединител" : "напр. Диагностика – двигател"} />
              <TextField label="Дата" type="date" value={q.date} onChange={(v) => update({ date: v })} />
              <TextField label="Пробег (км)" value={q.mileage ?? ""} mono onChange={(v) => update({ mileage: Number(v.replace(/\D/g, "")) || null })} />
              {isQuote && <TextField label="Валидна до" type="date" value={q.validUntil ?? ""} onChange={(v) => update({ validUntil: v || null })} />}
              {isQuote && (
                <label className="field">
                  Статус
                  <select value={q.status} onChange={(e) => update({ status: e.target.value })}>
                    {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            <label className="field">
              {isQuote ? "Описание / констатации" : q.kind === "диагностика" ? "Констатации" : "Причина за ремонта"}
              <textarea value={q.findings} onChange={(e) => update({ findings: e.target.value })} placeholder={q.kind === "диагностика" ? "Какво е проверено и какво е установено" : ""} />
            </label>
          </section>

          {q.kind === "диагностика" && (
            <section className="card">
              <div className="card-head">
                <h2>Кодове за грешки</h2>
                <button className="btn small" onClick={() => update({ faultCodes: [...q.faultCodes, { code: "", text: "" }] })}>+ Код</button>
              </div>
              <div className="table-wrap">
                <table className="tbl edit">
                  <thead><tr><th style={{ width: 120 }}>Код</th><th>Описание</th><th /></tr></thead>
                  <tbody>
                    {q.faultCodes.length === 0 && <tr><td colSpan={3} className="muted small" style={{ padding: 14 }}>Няма кодове. Добавете ги ръчно или ги прочетете от PDF отчета на уреда.</td></tr>}
                    {q.faultCodes.map((c, i) => {
                      const set = (p: Partial<typeof c>) => update({ faultCodes: q.faultCodes.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                      return (
                        <tr key={i}>
                          <td><input className="mono" value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} aria-label="Код" /></td>
                          <td><input value={c.text} onChange={(e) => set({ text: e.target.value })} aria-label="Описание" /></td>
                          <td><button className="btn small icon-btn danger" aria-label="Премахни кода" onClick={() => update({ faultCodes: q.faultCodes.filter((_, j) => j !== i) })}><Icon name="trash" size={15} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {features.faultCodes && (
                <div style={{ padding: "0 18px 14px" }}>
                  <FaultCodes
                    files={ctx.files}
                    onCodes={(codes) => {
                      const known = new Set(q.faultCodes.map((c) => c.code));
                      const add = codes.filter((c) => !known.has(c.code)).map((c) => ({ code: c.code, text: c.text.replace(c.code, "").trim() }));
                      if (add.length) {
                        update({ faultCodes: [...q.faultCodes, ...add] });
                        toast(`Добавени кодове: ${add.length}`);
                      }
                    }}
                  />
                  {ctx.files.filter((f) => f.name.toLowerCase().endsWith(".pdf")).length === 0 && (
                    <div className="small muted">Прикачете PDF отчета на уреда {id ? "долу" : "след като запазите"}, за да прочетете кодовете от него.</div>
                  )}
                </div>
              )}
            </section>
          )}

          <LaborTable
            title={isQuote ? "Труд" : q.kind === "доклад" ? "Извършени дейности" : "Препоръчани ремонти (труд)"}
            lines={q.labor}
            onChange={(labor) => update({ labor })}
            rate={ctx.shop.laborRate}
          />
          <PartsTable title={isQuote ? "Части" : q.kind === "доклад" ? "Сменени части" : "Препоръчани части"} lines={q.parts} onChange={(parts) => update({ parts })} make={ctx.car.make} />

          <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="field">
              Препоръки към клиента
              <textarea value={q.recommendations} onChange={(e) => update({ recommendations: e.target.value })} placeholder="напр. Смяна на предни накладки до 3 000 км" />
            </label>
            <label className="field">
              Вътрешни бележки (не се печатат)
              <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
            </label>
          </section>

          <section className="card pad">
            <h2 style={{ marginBottom: 12 }}>Файлове</h2>
            {id ? (
              <Files files={ctx.files} target="quote" id={id} onChange={() => setTick((t) => t + 1)} hint="Файловете се записват в папката на документа. Запазеният PDF също може да се сложи тук." />
            ) : (
              <div className="muted">Запазете документа, за да прикачите файлове.</div>
            )}
          </section>
        </div>

        <aside className="narrow" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {(isQuote || hasLines) && (
            <section className="card pad totals">
              <h2 style={{ marginBottom: 6 }}>{isQuote ? "Стойност" : "Ориентировъчна стойност"}</h2>
              <div><span>Труд</span><span className="mono">{euro(totals.labor)}</span></div>
              <div><span>Части</span><span className="mono">{euro(totals.parts)}</span></div>
              <div className="muted">
                <span>Отстъпка <input className="input" type="number" min={0} max={100} value={q.discountPercent} onChange={(e) => update({ discountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} style={{ width: 64, minHeight: 30, padding: "2px 6px", display: "inline-block" }} aria-label="Отстъпка в проценти" /> %</span>
                <span className="mono">−{euro(totals.discount)}</span>
              </div>
              <div className="muted">
                <span>ДДС <input className="input" type="number" min={0} max={100} value={q.vatPercent} onChange={(e) => update({ vatPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} style={{ width: 64, minHeight: 30, padding: "2px 6px", display: "inline-block" }} aria-label="ДДС в проценти" /> %</span>
                <span className="mono">{euro(totals.vat)}</span>
              </div>
              <div className="sum"><span>Общо</span><span className="mono">{euro(totals.total)}</span></div>
            </section>
          )}
          <div className="note info small">
            „Печат / PDF“ отваря прозореца за печат. За PDF изберете принтер „Microsoft Print to PDF“ или „Запиши като PDF“ и запазете файла в папката на документа, за да го изпратите на клиента.
          </div>
        </aside>
      </div>

      <PrintSheet q={q} ctx={ctx} totals={totals} />
    </div>
  );
}

function PrintSheet({ q, ctx, totals }: { q: Quote; ctx: Ctx; totals: ReturnType<typeof computeTotals> }) {
  const s = ctx.shop;
  const { logo } = useBrand();
  const hasLines = q.labor.some((l) => l.description) || q.parts.some((p) => p.part);
  const row = { display: "flex", justifyContent: "space-between" } as const;
  return (
    <div className="print-only sheet">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {logo && <img className="print-logo" src={logo} alt="" />}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{s.name}</div>
            <div>{[s.address, s.phone, s.eik && `ЕИК ${s.eik}`].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 800, textTransform: "uppercase" }}>{PRINT_TITLE[q.kind]}</div>
          <div>{q.number} · {date(q.date)}</div>
          {q.kind === "оферта" && q.validUntil && <div>Валидна до {date(q.validUntil)}</div>}
        </div>
      </div>
      <table style={{ marginBottom: 12 }}>
        <tbody>
          <tr>
            <td><strong>Клиент:</strong> {ctx.client.name}<br />{ctx.client.phone}</td>
            <td><strong>Автомобил:</strong> {ctx.car.make} {ctx.car.model} · {ctx.car.plate}<br />VIN {ctx.car.vin || "—"} · пробег {km(q.mileage)}</td>
          </tr>
        </tbody>
      </table>
      {q.title && <p style={{ fontWeight: 700, fontSize: 14 }}>{q.title}</p>}
      {q.findings.trim() && <p style={{ whiteSpace: "pre-wrap" }}><strong>{q.kind === "доклад" ? "Причина за ремонта:" : "Констатации:"}</strong> {q.findings.trim()}</p>}
      {q.kind === "диагностика" && q.faultCodes.some((c) => c.code) && (
        <>
          <p><strong>Кодове за грешки</strong></p>
          <table style={{ marginBottom: 12 }}>
            <tbody>
              {q.faultCodes.filter((c) => c.code).map((c) => (
                <tr key={c.code}><td style={{ width: 80, fontFamily: "monospace" }}>{c.code}</td><td>{c.text}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {hasLines && (
        <>
          {q.kind === "диагностика" && <p><strong>Препоръчан ремонт</strong></p>}
          {q.kind === "доклад" && <p><strong>Извършени дейности и сменени части</strong></p>}
          <PrintLines labor={q.labor} parts={q.parts} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <div style={{ width: 260 }}>
              <div style={row}><span>Сума</span><span>{euro(totals.labor + totals.parts)}</span></div>
              {totals.discount > 0 && <div style={row}><span>Отстъпка {q.discountPercent}%</span><span>−{euro(totals.discount)}</span></div>}
              <div style={row}><span>ДДС {q.vatPercent}%</span><span>{euro(totals.vat)}</span></div>
              <div style={{ ...row, fontWeight: 800, borderTop: "1.5px solid #000", marginTop: 4, paddingTop: 4 }}><span>Общо</span><span>{euro(totals.total)}</span></div>
            </div>
          </div>
        </>
      )}
      {q.recommendations.trim() && <p style={{ whiteSpace: "pre-wrap" }}><strong>Препоръки:</strong> {q.recommendations.trim()}</p>}
      {q.kind === "оферта" && <p style={{ fontSize: 11 }}>Цените са ориентировъчни и могат да се променят, ако при ремонта се установят допълнителни неизправности. Допълнителна работа се извършва само след съгласие на клиента.</p>}
      <div style={{ display: "flex", gap: 40, marginTop: 40 }}>
        <div style={{ flex: 1, borderTop: "1px solid #000", paddingTop: 4 }}>За сервиза</div>
        <div style={{ flex: 1, borderTop: "1px solid #000", paddingTop: 4 }}>Клиент</div>
      </div>
    </div>
  );
}
