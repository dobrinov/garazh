import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Car, Client, emptyOrder, errorMessage, FileInfo, isConflict, Shop, Usage, WorkOrder } from "../api";
import { FaultCodes } from "../components/FaultCodes";
import { useBrand } from "../components/brand";
import { useFeatures } from "../components/features";
import { Files } from "../components/Files";
import { LaborTable, PartsTable, PrintLines } from "../components/Lines";
import { Icon, Loading, Plate, TextField, useToast } from "../components/ui";
import { date, euro, int, km, STATUS_LABEL, STATUS_ORDER, todayIso } from "../lib/format";
import { computeTotals } from "../lib/totals";

interface Ctx {
  car: Car;
  client: Client;
  carKm: number | null;
  usage: Usage;
  files: FileInfo[];
  shop: Shop;
}

export function WorkOrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [notes, setNotes] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [dir, setDir] = useState("");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const features = useFeatures();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const shop = (await api.getShop()).data;
        if (id) {
          const d = await api.getOrder(id);
          if (!alive) return;
          setOrder(d.order.data);
          setNotes(d.order.notes);
          setHash(d.order.hash);
          setDir(d.order.dir);
          setCtx({ car: d.car, client: d.client, carKm: d.carKm, usage: d.carUsage, files: d.files, shop });
        } else {
          const carId = params.get("car") ?? "";
          if (!carId) throw new Error("Изберете автомобил, за който е работната карта.");
          const d = await api.getCar(carId);
          if (!alive) return;
          const o = emptyOrder(carId);
          o.date = todayIso();
          o.discountPercent = d.owner.discountPercent;
          o.vatPercent = shop.vatRegistered ? shop.vatPercent : 0;
          o.labor = [{ description: "", mechanic: "", hours: 1, rate: shop.laborRate }];
          setOrder(o);
          setCtx({ car: d.car.data, client: d.owner, carKm: d.usage.lastKm, usage: d.usage, files: [], shop });
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

  const totals = useMemo(
    () => (order ? computeTotals(order.labor, order.parts, order.discountPercent, order.vatPercent) : null),
    [order],
  );

  if (!order || !ctx || !totals) return <Loading error={error} />;

  const update = (patch: Partial<WorkOrder>) => {
    setOrder({ ...order, ...patch });
    setDirty(true);
  };

  async function save(): Promise<WorkOrder | null> {
    if (!order) return null;
    setBusy(true);
    try {
      const saved = await api.saveOrder({ data: order, notes, baseHash: hash });
      setOrder(saved.data);
      setHash(saved.hash);
      setDir(saved.dir);
      setDirty(false);
      toast(`Запазена ${saved.data.number}`);
      if (!id) nav(`/orders/${saved.data.id}`, { replace: true });
      return saved.data;
    } catch (e) {
      toast(isConflict(e) ? "Работната карта е променена извън програмата. Презаредете страницата и повторете промените." : errorMessage(e), true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    const saved = dirty || !id ? await save() : order;
    if (!saved) return;
    setBusy(true);
    try {
      await api.closeOrder(saved.id);
      toast("Приключена – частите и пробегът са записани в историята на колата");
      setTick((t) => t + 1);
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  // Mileage sanity check against the car's history.
  let kmNote: { text: string; bad?: boolean } | null = null;
  if (order.mileage && ctx.carKm && !order.historyWritten) {
    const diff = order.mileage - ctx.carKm;
    if (diff < 0) kmNote = { text: `По-малко от последния записан пробег (${km(ctx.carKm)}). Проверете числото.`, bad: true };
    else if (ctx.usage.lastDate) {
      const days = Math.max(1, Math.round((Date.parse(order.date) - Date.parse(ctx.usage.lastDate)) / 86400000));
      const perDay = diff / days;
      const usual = ctx.usage.recentPerDay;
      const unusual = usual && (perDay > usual * 2.5 || perDay < usual / 4);
      kmNote = { text: `+${int(diff)} км за ${days} дни от последното отчитане (${perDay.toFixed(0)} км/ден)${usual ? `; обичайно ${usual.toFixed(0)} км/ден` : ""}.${unusual ? " Необичайно – проверете." : ""}`, bad: !!unusual };
    }
  }

  const statusIdx = STATUS_ORDER.indexOf(order.status);
  const closed = order.historyWritten;

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="crumbs">
            <Link to="/orders">Работни карти</Link><span>/</span><Link to={`/cars/${ctx.car.id}`}>{ctx.car.plate}</Link><span>/</span><span>{order.number || "Нова"}</span>
          </div>
          <h1>Работна карта <span className="mono" style={{ fontSize: 22 }}>{order.number || "(нова)"}</span></h1>
          <div className="muted">
            {ctx.client.name} · <Plate value={ctx.car.plate} /> {ctx.car.make} {ctx.car.model}
            {closed && order.closedOn && ` · приключена ${date(order.closedOn)}`}
          </div>
        </div>
        <div className="row">
          {dir && <button className="btn" onClick={() => api.openPath(dir)}><Icon name="folder" />Папка</button>}
          {features.quotes && id && (
            <>
              <Link className="btn" to={`/quotes/new?order=${id}&kind=диагностика`}>Доклад от диагностика</Link>
              <Link className="btn" to={`/quotes/new?order=${id}&kind=доклад`}>Доклад за ремонта</Link>
            </>
          )}
          <button className="btn" onClick={() => window.print()} disabled={!id}><Icon name="print" />Печат / PDF</button>
          <button className="btn" onClick={save} disabled={busy || (!dirty && !!id)}>{dirty || !id ? "Запази" : "Запазено"}</button>
          {!closed && <button className="btn primary" onClick={close} disabled={busy}><Icon name="check" />Приключи</button>}
        </div>
      </div>

      <div className="steps no-print" role="group" aria-label="Етап">
        {STATUS_ORDER.map((s, i) => (
          <button key={s} className={i < statusIdx ? "done" : i === statusIdx ? "now" : ""} aria-pressed={i === statusIdx} onClick={() => update({ status: s })}>
            {i + 1}. {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="cols no-print">
        <div className="wide" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2>Приемане</h2>
            <div className="grid">
              <TextField label="Заглавие" value={order.title} onChange={(v) => update({ title: v })} placeholder="напр. Обслужване 15 000 км" />
              <TextField label="Дата на приемане" type="date" value={order.date} onChange={(v) => update({ date: v })} />
              <TextField label="Пробег при приемане (км)" value={order.mileage ?? ""} mono onChange={(v) => { const n = Number(v.replace(/\D/g, "")); update({ mileage: n || null }); }} hint={ctx.carKm ? `Последно записан: ${km(ctx.carKm)}` : undefined} />
              <label className="field">
                Ниво гориво
                <select value={order.fuelLevel} onChange={(e) => update({ fuelLevel: e.target.value })}>
                  <option value="">—</option>
                  {["резерва", "1/4", "1/2", "3/4", "пълен"].map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <TextField label="Механик" value={order.mechanic} onChange={(v) => update({ mechanic: v })} />
            </div>
            {kmNote && <div className={`note ${kmNote.bad ? "warn" : "info"}`}>{kmNote.text}</div>}
            <label className="field">
              Оплакване на клиента
              <textarea value={order.complaint} onChange={(e) => update({ complaint: e.target.value })} />
            </label>
          </section>

          <LaborTable title="Извършени дейности (труд)" lines={order.labor} onChange={(labor) => update({ labor })} rate={ctx.shop.laborRate} mechanic={order.mechanic} />

          <PartsTable title="Части и консумативи" hint="При приключване се записват в историята на колата с пробега от приемането." lines={order.parts} onChange={(parts) => update({ parts })} />

          <section className="card pad">
            <h2 style={{ marginBottom: 12 }}>Диагностика и файлове</h2>
            {id ? (
              <>
                <Files files={ctx.files} target="order" id={id} onChange={() => setTick((t) => t + 1)} hint="Файловете се записват в папката на този ремонт" />
                {features.faultCodes && <FaultCodes files={ctx.files} />}
              </>
            ) : (
              <div className="muted">Запазете картата, за да прикачите файлове.</div>
            )}
          </section>
        </div>

        <aside className="narrow" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="card pad totals">
            <h2 style={{ marginBottom: 6 }}>Сметка</h2>
            <div><span>Труд</span><span className="mono">{euro(totals.labor)}</span></div>
            <div><span>Части</span><span className="mono">{euro(totals.parts)}</span></div>
            <div className="muted">
              <span>Отстъпка <input className="input" type="number" min={0} max={100} value={order.discountPercent} onChange={(e) => update({ discountPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} style={{ width: 64, minHeight: 30, padding: "2px 6px", display: "inline-block" }} aria-label="Отстъпка в проценти" /> %</span>
              <span className="mono">−{euro(totals.discount)}</span>
            </div>
            <div className="muted"><span>ДДС {order.vatPercent}%</span><span className="mono">{euro(totals.vat)}</span></div>
            <div className="sum"><span>Общо</span><span className="mono">{euro(totals.total)}</span></div>
            <label className="field" style={{ marginTop: 8 }}>
              Начин на плащане
              <select value={order.payment} onChange={(e) => update({ payment: e.target.value })}>
                <option value="">—</option><option>В брой</option><option>Карта</option><option>Банков превод</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={order.paid} onChange={(e) => update({ paid: e.target.checked })} />Платено</label>
          </section>
          <section className="card pad">
            <label className="field">
              Бележки (виждат се в работната карта)
              <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} placeholder="Препоръки за следващо посещение…" />
            </label>
          </section>
          {closed && <div className="note info">Частите и пробегът от тази карта са записани в историята на колата. Последващи промени по картата не променят историята.</div>}
        </aside>
      </div>

      <PrintSheet order={order} ctx={ctx} notes={notes} totals={totals} />
    </div>
  );
}

function PrintSheet({ order, ctx, notes, totals }: { order: WorkOrder; ctx: Ctx; notes: string; totals: ReturnType<typeof computeTotals> }) {
  const s = ctx.shop;
  const { logo } = useBrand();
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
          <div style={{ fontSize: 18, fontWeight: 800, textTransform: "uppercase" }}>Работна карта</div>
          <div>{order.number} · {date(order.date)}</div>
        </div>
      </div>
      <table style={{ marginBottom: 12 }}>
        <tbody>
          <tr>
            <td><strong>Клиент:</strong> {ctx.client.name}<br />{ctx.client.phone}</td>
            <td><strong>Автомобил:</strong> {ctx.car.make} {ctx.car.model} · {ctx.car.plate}<br />VIN {ctx.car.vin || "—"} · пробег {km(order.mileage)}</td>
          </tr>
        </tbody>
      </table>
      {order.complaint && <p><strong>Оплакване:</strong> {order.complaint}</p>}
      <PrintLines labor={order.labor} parts={order.parts} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <div style={{ width: 260 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Сума</span><span>{euro(totals.labor + totals.parts)}</span></div>
          {totals.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Отстъпка {order.discountPercent}%</span><span>−{euro(totals.discount)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>ДДС {order.vatPercent}%</span><span>{euro(totals.vat)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, borderTop: "1.5px solid #000", marginTop: 4, paddingTop: 4 }}><span>Общо</span><span>{euro(totals.total)}</span></div>
        </div>
      </div>
      {notes.trim() && <p style={{ whiteSpace: "pre-wrap" }}><strong>Бележки:</strong> {notes.trim()}</p>}
      <div style={{ display: "flex", gap: 40, marginTop: 40 }}>
        <div style={{ flex: 1, borderTop: "1px solid #000", paddingTop: 4 }}>За сервиза: {order.mechanic}</div>
        <div style={{ flex: 1, borderTop: "1px solid #000", paddingTop: 4 }}>Клиент</div>
      </div>
    </div>
  );
}
