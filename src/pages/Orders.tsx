import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavigateFunction, useNavigate, useSearchParams } from "react-router-dom";
import { api, emptyExpected, errorMessage, Expected, ExpectedRow, notifyChanged, OrderStatus, OrderSummary } from "../api";
import { ExpectedForm } from "../components/ExpectedForm";
import { fillBlanks, fillFromKnown, KnownPicked, KnownSuggestions, useKnownPick } from "../components/KnownCars";
import { useFeatures } from "../components/features";
import { useSearch } from "../components/Search";
import { Icon, Loading, Menu, Plate, StatusBadge, useLoad, useNow, useToast } from "../components/ui";
import { date, euro, matches, STATUS_LABEL, todayIso } from "../lib/format";
import { BOARD_STAGES, formatDuration, isStaleReady, shopStages, stageOf, timeInStage } from "../lib/stages";
import { QuotesPanel } from "./Quotes";

type Tab = "shop" | "unpaid" | "all" | "quotes";
type View = "board" | "list";

const VIEW_KEY = "garazh.ordersView";

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

/** Receive a car that was announced by phone, optionally straight into a later stage. */
export async function receiveExpected(e: ExpectedRow, nav: NavigateFunction, status?: OrderStatus) {
  if (e.openOrder) return nav(`/orders/${e.openOrder}`);
  const p = new URLSearchParams({ expected: e.id });
  if (status && status !== "приета") p.set("status", status);
  if (e.carId) {
    p.set("car", e.carId);
    p.set("received", "1");
    if (e.complaint) p.set("complaint", e.complaint);
    return nav(`/orders/new?${p}`);
  }
  // Not in the program yet: client, then car, then the work order.
  nav(`/clients/new?${p}`);
}

export function Orders() {
  const nav = useNavigate();
  const toast = useToast();
  const features = useFeatures();
  const [params, setParams] = useSearchParams();
  const { data, error, setData } = useLoad(() => api.listOrders(), []);
  const expectedLoad = useLoad(() => api.listExpected(), []);
  // ?q=РК-… (e.g. from the stock movements) searches all work orders.
  const [q, setQ] = useState(params.get("q") ?? "");
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && ["shop", "unpaid", "all", "quotes"].includes(tabParam) ? tabParam : params.get("q") ? "all" : "shop";
  const [view, setViewState] = useState<View>(savedView);
  const [editing, setEditing] = useState<Expected | null>(null);
  const [mechanic, setMechanic] = useState("");
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* the choice is only a convenience */
    }
  };
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set("tab", t);
    p.delete("q");
    setParams(p, { replace: true });
  };

  const today = todayIso();
  const rows = useMemo(() => {
    if (!data) return [];
    return data.filter((o) => {
      if (tab === "shop" && (stageOf(o.order.status) === "предадена" || isStaleReady(o.order, today))) return false;
      if (tab === "unpaid" && !(o.order.closedOn && !o.order.paid)) return false;
      if (mechanic && o.order.mechanic.trim() !== mechanic) return false;
      return matches(q, [o.plate], [o.order.number, o.order.title, o.order.complaint, o.clientName, o.carName]);
    });
  }, [data, q, tab, today, mechanic]);

  const expected = useMemo(
    () => (expectedLoad.data ?? []).filter((e) => matches(q, [e.plate], [e.client, e.phone, e.car, e.complaint])),
    [expectedLoad.data, q],
  );

  if (!data) return <Loading error={error} />;
  const open = data.filter((o) => stageOf(o.order.status) !== "предадена" && !isStaleReady(o.order, today)).length;
  const stale = data.filter((o) => isStaleReady(o.order, today)).length;
  const unpaid = data.filter((o) => o.order.closedOn && !o.order.paid).length;
  // Who works on the cars in the shop now: a filter when there is more than one.
  const mechanics = [...new Set(data.filter((o) => stageOf(o.order.status) !== "предадена" && !isStaleReady(o.order, today)).map((o) => o.order.mechanic.trim()).filter(Boolean))].sort();

  async function move(id: string, status: OrderStatus) {
    const before = data;
    // Show the move at once; put it back if the file could not be written.
    setData((before ?? []).map((o) => (o.order.id === id ? { ...o, order: { ...o.order, status } } : o)));
    try {
      const saved = await api.setOrderStatus(id, status);
      // Take the saved order, so the card shows the new time in its column.
      setData((cur) => (cur ?? []).map((o) => (o.order.id === id ? { ...o, order: saved.data } : o)));
      notifyChanged();
    } catch (e) {
      setData(before);
      toast(errorMessage(e), true);
    }
  }

  return (
    <div className="page">
      <div className="orders-bar">
        <div className="row" style={{ gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1>Работни карти</h1>
          <div className="pill-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "shop"} className={tab === "shop" ? "on" : ""} onClick={() => setTab("shop")}>В сервиза {open}</button>
            <button role="tab" aria-selected={tab === "unpaid"} className={tab === "unpaid" ? "on" : ""} onClick={() => setTab("unpaid")}>Неплатени {unpaid > 0 && <span className="bad-count">{unpaid}</span>}</button>
            <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Всички</button>
            {features.quotes && <button role="tab" aria-selected={tab === "quotes"} className={tab === "quotes" ? "on" : ""} onClick={() => setTab("quotes")}>Оферти</button>}
          </div>
        </div>
        {tab !== "quotes" && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="search compact">
              <Icon name="search" color="var(--muted)" size={16} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Рег. номер, клиент, работа" aria-label="Търси работна карта" />
            </label>
            {tab === "shop" && mechanics.length > 1 && (
              <div className="chip-group" role="group" aria-label="Механик">
                <button type="button" aria-pressed={!mechanic} onClick={() => setMechanic("")}>Всички</button>
                {mechanics.map((m) => <button key={m} type="button" aria-pressed={mechanic === m} onClick={() => setMechanic(mechanic === m ? "" : m)}>{m}</button>)}
              </div>
            )}
            {!(tab === "shop" && view === "board") && (
              <button type="button" className="btn" onClick={() => setEditing(emptyExpected())}><Icon name="phone" size={16} />Очакван</button>
            )}
            {tab === "shop" && (
              <div className="seg icons" role="group" aria-label="Изглед">
                <button type="button" aria-pressed={view === "board"} aria-label="Табло" title="Табло" onClick={() => setView("board")}><Icon name="board" size={16} /></button>
                <button type="button" aria-pressed={view === "list"} aria-label="Списък" title="Списък" onClick={() => setView("list")}><Icon name="list" size={16} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {tab === "quotes" ? (
        <QuotesPanel />
      ) : (
        <>
          {tab === "shop" && stale > 0 && (
            <div className="muted small">
              {stale} {stale === 1 ? "готова кола отпреди повече от месец не се показва" : "готови коли отпреди повече от месец не се показват"} тук – вероятно са взети.{" "}
              <button type="button" className="link-btn" onClick={() => setTab("all")}>Виж ги във „Всички“</button>
            </div>
          )}
          {tab === "shop" && view === "board" ? (
            <Board rows={rows} expected={expected} onMove={move} onEditExpected={setEditing} onAdded={expectedLoad.reload} />
          ) : (
            <>
              {tab === "shop" && expected.length > 0 && <ExpectedList rows={expected} onEdit={setEditing} />}
              <section className="card">
                {rows.length === 0 ? (
                  <div className="empty">{data.length === 0 ? "Още няма работни карти. Натиснете „Приеми кола“." : "Няма съвпадения."}</div>
                ) : (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th>Номер</th><th>Дата</th><th>Автомобил</th><th>Клиент</th><th>Работа</th><th className="right">Сума</th><th>Етап</th></tr></thead>
                      <tbody>
                        {rows.map((o) => (
                          <tr key={o.order.id} className="link" onClick={() => nav(`/orders/${o.order.id}`)}>
                            <td className="mono small"><Link to={`/orders/${o.order.id}`} onClick={(e) => e.stopPropagation()}>{o.order.number}</Link></td>
                            <td className="mono small">{date(o.order.date)}</td>
                            <td><Plate value={o.plate} /><div className="small muted">{o.carName}</div></td>
                            <td>{o.clientName}</td>
                            <td>{o.order.title || o.order.complaint || "—"}</td>
                            <td className="mono small right">{euro(o.totals.total)}</td>
                            <td><StatusBadge status={stageOf(o.order.status)} />{o.order.closedOn && !o.order.paid && <span className="badge bad" style={{ marginLeft: 6 }}>Неплатена</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {editing && (
        <ExpectedForm
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            expectedLoad.reload();
          }}
        />
      )}
    </div>
  );
}

function Board({
  rows,
  expected,
  onMove,
  onEditExpected,
  onAdded,
}: {
  rows: OrderSummary[];
  expected: ExpectedRow[];
  onMove: (id: string, status: OrderStatus) => void;
  onEditExpected: (e: Expected) => void;
  onAdded: () => void;
}) {
  const nav = useNavigate();
  const toast = useToast();
  const search = useSearch();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const drag = useCardDrag((what, stage) => {
    if (what.kind === "expected") {
      // An expected car dropped on a stage: receive it into that stage.
      const ex = expected.find((x) => x.id === what.id);
      if (ex) receiveExpected(ex, nav, stage).catch((err) => toast(errorMessage(err), true));
      return;
    }
    const card = rows.find((o) => o.order.id === what.id);
    if (card && stageOf(card.order.status) !== stage) onMove(what.id, stage);
  });
  const over = drag.over;
  // The shop's stages; one it switched off stays while a card is still in it.
  const stages = shopStages(BOARD_STAGES, (s) => rows.some((o) => stageOf(o.order.status) === s));
  return (
    <>
      <div className="board-wrap">
        <div className="board">
          <section className="board-col expected" aria-label="Очаквани">
            <div className="board-head">
              <span className="dot" />Очаквани<span className="muted">{expected.length}</span>
              <button type="button" className="col-add" onClick={() => setAdding(!adding)} aria-expanded={adding} aria-label="Нова очаквана кола" title="Обади се клиент – запиши го тук">+</button>
            </div>
            {adding && <QuickExpected onDone={() => { setAdding(false); onAdded(); }} onCancel={() => setAdding(false)} />}
            {expected.map((e) => (
              <div
                key={e.id}
                className={`kcard ${drag.dragging?.id === e.id ? "lifted" : ""}`}
                onPointerDown={e.openOrder ? undefined : (ev) => drag.start(ev, { kind: "expected", id: e.id, label: e.plate || e.client })}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Plate value={e.plate} />
                  <span className={`badge ${e.date ? "info" : "muted"}`}>{e.date ? `${e.date === todayIso() ? "днес" : date(e.date)} ${e.time}` : "без ден"}</span>
                </div>
                <div>
                  <strong>{e.complaint || "—"}</strong>
                  <div className="small muted">{[e.car, e.client].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="kcard-foot">
                  {e.phone ? <a href={`tel:${e.phone}`} className="small">{e.phone}</a> : <span className="small muted">обаждане {date(e.calledOn)}</span>}
                  <span className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn small" onClick={() => onEditExpected(e)} aria-label={`Промени очаквания ${e.plate || e.client}`}>Промени</button>
                    <button type="button" className="btn small primary" onClick={() => receiveExpected(e, nav).catch((err) => toast(errorMessage(err), true))}>{e.openOrder ? "Отвори" : "Приеми"}</button>
                  </span>
                </div>
              </div>
            ))}
            {expected.length === 0 && !adding && (
              <button type="button" className="board-empty link-btn" onClick={() => setAdding(true)}>Обадил се клиент? Натиснете +, за да го запишете.</button>
            )}
          </section>
          {stages.map((s) => {
            const cards = rows.filter((o) => stageOf(o.order.status) === s);
            return (
              <section key={s} data-stage={s} className={`board-col stage-${s} ${over === s ? "over" : ""}`} aria-label={STATUS_LABEL[s]}>
                <div className="board-head">
                  <span className="dot" />{STATUS_LABEL[s]}<span className="muted">{cards.length}</span>
                  <button type="button" className="col-add" onClick={() => search("intake", s)} aria-label={`Приеми кола направо в „${STATUS_LABEL[s]}“`} title={`Приеми кола направо в „${STATUS_LABEL[s]}“`}>+</button>
                </div>
                {cards.map((o) => (
                  <Link
                    key={o.order.id}
                    to={`/orders/${o.order.id}`}
                    className={`kcard ${drag.dragging?.id === o.order.id ? "lifted" : ""}`}
                    draggable={false}
                    onPointerDown={(e) => drag.start(e, { kind: "order", id: o.order.id, label: o.plate || o.order.number })}
                    onClick={(e) => drag.wasDrag() && e.preventDefault()}
                  >
                    <div className="kcard-top">
                      <Plate value={o.plate} />
                      {(() => {
                        const t = timeInStage(o.order, now);
                        const long = !!t && t.minutes >= LONG_IN_STAGE && s !== "готова";
                        return (
                          <span className={long ? "badge warn" : "small muted nowrap"} title="Откакто картата е в тази колона">
                            {t ? `${t.approx ? "≈ " : ""}${formatDuration(t.minutes)}` : `от ${date(o.order.date)}`}
                          </span>
                        );
                      })()}
                    </div>
                    <strong className="kcard-title" title={o.order.number}>{o.order.title || o.order.complaint || "Работна карта"}</strong>
                    <div className="kcard-foot small">
                      <span className="muted ellipsis">{[o.carName, o.clientName].filter(Boolean).join(" · ")}</span>
                      <span className="row" style={{ gap: 4, flex: "none" }}>
                        {o.order.mechanic && <span className="initials" title={o.order.mechanic}>{initials(o.order.mechanic)}</span>}
                        <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onPointerDown={(e) => e.stopPropagation()}>
                          <Menu
                            dots
                            label="Премести в друга колона"
                            items={stages.filter((x) => x !== s).map((x) => ({ label: `→ ${STATUS_LABEL[x]}`, onSelect: () => onMove(o.order.id, x) }))}
                          />
                        </span>
                      </span>
                    </div>
                    {s === "готова" && o.clientPhone && (
                      <a className="small kcard-call" href={`tel:${o.clientPhone}`} onClick={(e) => e.stopPropagation()}><Icon name="phone" size={13} /> {o.clientPhone}</a>
                    )}
                    {o.order.closedOn && !o.order.paid && <span className="badge bad" style={{ alignSelf: "flex-start" }}>Неплатена</span>}
                  </Link>
                ))}
                {cards.length === 0 && <div className="board-empty">{s === "приета" ? "Пуснете тук очаквана кола или натиснете +" : "Плъзнете карта тук"}</div>}
              </section>
            );
          })}
        </div>
      </div>
      {drag.dragging && drag.pos && (
        <div className="drag-ghost" style={{ left: drag.pos.x + 12, top: drag.pos.y + 12 }} aria-hidden="true">
          {drag.dragging.label} {drag.over && drag.over !== "expected" ? `→ ${STATUS_LABEL[drag.over]}` : ""}
        </div>
      )}
    </>
  );
}

function ExpectedList({ rows, onEdit }: { rows: ExpectedRow[]; onEdit: (e: Expected) => void }) {
  const nav = useNavigate();
  const toast = useToast();
  return (
    <section className="card">
      <div className="card-head"><h2>Очаквани</h2><span className="small muted">обадили се клиенти</span></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Идва</th><th>Автомобил</th><th>Клиент</th><th>Оплакване</th><th /></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="small nowrap">{e.date ? `${date(e.date)} ${e.time}` : <span className="muted">без ден</span>}</td>
                <td><Plate value={e.plate} /><div className="small muted">{e.car}</div></td>
                <td>{e.client}<div className="small">{e.phone && <a href={`tel:${e.phone}`}>{e.phone}</a>}</div></td>
                <td>{e.complaint}</td>
                <td className="right nowrap">
                  <button type="button" className="btn small" onClick={() => onEdit(e)}>Промени</button>{" "}
                  <button type="button" className="btn small primary" onClick={() => receiveExpected(e, nav).catch((err) => toast(errorMessage(err), true))}>Приеми</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Write down a call right in the "Очаквани" column. */
function QuickExpected({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [e, setE] = useState<Expected>(emptyExpected());
  const [busy, setBusy] = useState(false);
  const pick = useKnownPick(e);
  const known = pick.picked ?? pick.exact ?? null;
  const set = <K extends keyof Expected>(k: K, v: Expected[K]) => {
    pick.undismiss();
    setE({ ...e, [k]: v });
  };
  async function save(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await api.saveExpected(known ? fillBlanks(e, known) : e);
      toast("Записан в „Очаквани“");
      notifyChanged();
      onDone();
    } catch (err) {
      toast(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="kcard quick-expected" onSubmit={save} onKeyDown={(ev) => ev.key === "Escape" && onCancel()}>
      {pick.picked ? (
        <KnownPicked k={pick.picked} onClear={() => { pick.setPicked(null); setE({ ...e, plate: "", car: "", client: "", phone: "" }); }} />
      ) : (
        <>
          <input className="input mono" autoFocus placeholder="Рег. номер" aria-label="Рег. номер" value={e.plate} onChange={(ev) => set("plate", ev.target.value)} />
          {pick.exact ? (
            <div className="small known-hit">
              {pick.exact.car} · {pick.exact.client}{pick.exact.phone && ` · ${pick.exact.phone}`}
              {pick.exact.inShop && <div style={{ color: "var(--warn)" }}>Колата вече е в сервиза.</div>}
            </div>
          ) : (
            <>
              <input className="input" placeholder="Клиент" aria-label="Клиент" value={e.client} onChange={(ev) => set("client", ev.target.value)} />
              <input className="input" type="tel" placeholder="Телефон" aria-label="Телефон" value={e.phone} onChange={(ev) => set("phone", ev.target.value)} />
            </>
          )}
          <KnownSuggestions items={pick.exact ? [] : pick.suggestions} onPick={(k) => { pick.setPicked(k); setE(fillFromKnown(e, k)); }} />
        </>
      )}
      <textarea className="input" rows={2} placeholder="Какво трябва (оплакване)" aria-label="Оплакване" value={e.complaint} onChange={(ev) => set("complaint", ev.target.value)} />
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <input className="input" type="date" aria-label="Идва на" value={e.date} onChange={(ev) => set("date", ev.target.value)} style={{ minWidth: 0 }} />
        <input className="input" type="time" aria-label="Час" value={e.time} onChange={(ev) => set("time", ev.target.value)} style={{ width: 92, flex: "none" }} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
        <button type="button" className="btn small" onClick={onCancel}>Отказ</button>
        <button type="submit" className="btn small primary" disabled={busy}>Запиши</button>
      </div>
    </form>
  );
}

interface DragWhat {
  kind: "order" | "expected";
  id: string;
  label: string;
}

/**
 * Dragging cards between columns with the mouse (or a finger). The
 * browser's own drag and drop is not used: the window takes file drops
 * (PDFs onto a work order), which switches it off.
 */
/** A card this long in one column gets a mark: it may be stuck. */
const LONG_IN_STAGE = 2 * 24 * 60;

/** "Георги Колев" → "ГК", "Иван" → "ИВ" */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

function useCardDrag(onDrop: (what: DragWhat, stage: OrderStatus) => void) {
  const [dragging, setDragging] = useState<DragWhat | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [over, setOver] = useState<OrderStatus | "expected" | null>(null);
  const moved = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);

  function start(e: ReactPointerEvent, what: DragWhat) {
    if (e.button !== 0) return;
    // Buttons, links and fields inside a card keep working as usual.
    if ((e.target as HTMLElement).closest("button, input, textarea, select, a[href^='tel:'], .menu")) return;
    const sx = e.clientX;
    const sy = e.clientY;
    moved.current = false;
    let active = false;
    let target: OrderStatus | "expected" | null = null;
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!active) {
        active = true;
        moved.current = true;
        setDragging(what);
        document.body.classList.add("dragging-card");
      }
      ev.preventDefault();
      setPos({ x: ev.clientX, y: ev.clientY });
      const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-stage]");
      target = (col?.dataset.stage as OrderStatus | undefined) ?? (document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".board-col.expected") ? "expected" : null);
      setOver(target);
    };
    const up = () => {
      cleanup.current();
      if (active && target && target !== "expected") dropRef.current(what, target);
    };
    const keys = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        target = null;
        up();
      }
    };
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keys);
      document.body.classList.remove("dragging-card");
      setDragging(null);
      setPos(null);
      setOver(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keys);
  }

  /** True right after a drag, so the click that ends it does not open the card. */
  function wasDrag(): boolean {
    const m = moved.current;
    moved.current = false;
    return m;
  }

  return { dragging, pos, over, start, wasDrag };
}
