// One search for the whole program (Ctrl K) and the way a car is received
// ("Приеми кола"): find it by plate, VIN, phone or name, then open it or
// start a work order with the mileage and complaint already written.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, CarSummary, ClientSummary, errorMessage, ExpectedRow, Job, notifyChanged, OrderStatus, OrderSummary, QuoteSummary } from "../api";
import { date, km, matches, plateKey, STATUS_LABEL } from "../lib/format";
import { jobFromText, jobStage } from "../lib/jobs";
import { useFeatures } from "./features";
import { DeadlineBadge, Dialog, Icon, Plate, StatusBadge, useToast } from "./ui";

type Mode = "search" | "intake";
type Open = (mode: Mode, status?: OrderStatus) => void;
const SearchCtx = createContext<Open>(() => {});

/**
 * Open the search ("search") or the intake ("intake") from anywhere. The
 * intake can put the new work order straight into a later stage.
 */
export function useSearch() {
  return useContext(SearchCtx);
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMode((m) => m ?? "search");
        setStatus(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const open = useCallback<Open>((m, s) => {
    setMode(m);
    setStatus(s);
  }, []);
  return (
    <SearchCtx.Provider value={open}>
      {children}
      {mode && <SearchDialog mode={mode} status={status} onClose={() => setMode(null)} />}
    </SearchCtx.Provider>
  );
}

interface Data {
  cars: CarSummary[];
  clients: ClientSummary[];
  orders: OrderSummary[];
  quotes: QuoteSummary[];
  expected: ExpectedRow[];
}

type Hit =
  | { kind: "car"; key: string; car: CarSummary; expected?: ExpectedRow }
  | { kind: "expected"; key: string; row: ExpectedRow }
  | { kind: "client"; key: string; client: ClientSummary }
  | { kind: "order"; key: string; order: OrderSummary }
  | { kind: "quote"; key: string; quote: QuoteSummary };

const GROUPS: [Hit["kind"], string][] = [
  ["car", "Автомобили"],
  ["expected", "Очаквани, без кола в програмата"],
  ["client", "Клиенти"],
  ["order", "Работни карти"],
  ["quote", "Оферти и доклади"],
];

function SearchDialog({ mode, status, onClose }: { mode: Mode; status?: OrderStatus; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const features = useFeatures();
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [mileage, setMileage] = useState("");
  const [complaint, setComplaint] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [useQuote, setUseQuote] = useState(true);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.listCars(),
      api.listClients(),
      api.listOrders(),
      features.quotes ? api.listQuotes() : Promise.resolve([] as QuoteSummary[]),
      api.listExpected().catch(() => [] as ExpectedRow[]),
    ])
      .then(([cars, clients, orders, quotes, expected]) => setData({ cars, clients, orders, quotes, expected }))
      .catch((e) => toast(errorMessage(e), true));
  }, [features.quotes, toast]);
  useEffect(() => {
    if (mode === "intake") api.listJobs().then(setJobs).catch(() => setJobs([]));
  }, [mode]);

  const hits = useMemo<Hit[]>(() => {
    if (!data) return [];
    const t = q.trim();
    const byCar = new Map(data.expected.filter((e) => e.carId).map((e) => [e.carId!, e]));
    const cars = data.cars
      .filter((c) => matches(t, [c.car.plate], [c.car.vin, `${c.car.make} ${c.car.model}`, c.ownerName, ...phonesOf(data, c.car.clientId)]))
      .sort((a, b) => (t ? 0 : Number(!!b.openOrder) - Number(!!a.openOrder)) || (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""))
      .slice(0, t ? 8 : 6)
      .map<Hit>((c) => ({ kind: "car", key: `car-${c.car.id}`, car: c, expected: byCar.get(c.car.id) }));
    if (!t) return cars;
    const expected = data.expected
      .filter((e) => !e.carId && matches(t, [e.plate], [e.client, e.phone, e.car, e.complaint]))
      .slice(0, 4)
      .map<Hit>((row) => ({ kind: "expected", key: `exp-${row.id}`, row }));
    const clients = data.clients
      .filter((c) => matches(t, [], [c.client.name, c.client.phone, c.client.email, c.client.eik]))
      .slice(0, 5)
      .map<Hit>((client) => ({ kind: "client", key: `cl-${client.client.id}`, client }));
    const orders = data.orders
      .filter((o) => matches(t, [], [o.order.number, o.order.title]))
      .slice(0, 4)
      .map<Hit>((order) => ({ kind: "order", key: `o-${order.order.id}`, order }));
    const quotes = data.quotes
      .filter((r) => matches(t, [], [r.quote.number, r.quote.title]))
      .slice(0, 4)
      .map<Hit>((quote) => ({ kind: "quote", key: `q-${quote.quote.id}`, quote }));
    return [...cars, ...expected, ...clients, ...orders, ...quotes];
  }, [data, q]);

  const current = hits[Math.min(sel, Math.max(0, hits.length - 1))];
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    // A car that was announced by phone brings its complaint along.
    const said = current?.kind === "car" && current.expected ? current.expected.complaint : "";
    setComplaint(said);
    setJob(jobFromText(jobs, said));
    setMileage("");
    setUseQuote(true);
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.querySelector(`[data-key="${current?.key}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current?.key]);

  const go = (to: string) => {
    onClose();
    nav(to);
  };

  const openQuote = (car: CarSummary) =>
    data?.quotes.find((r) => r.quote.carId === car.car.id && r.quote.kind === "оферта" && (r.quote.status === "приета" || r.quote.status === "изпратена") && !r.quote.orderId);

  async function receive(car: CarSummary, expected?: ExpectedRow) {
    if (car.openOrder) return go(`/orders/${car.openOrder}`);
    const quote = openQuote(car);
    const kmValue = Number(mileage.replace(/\D/g, "")) || null;
    if (quote && useQuote) {
      // Accepting the quote opens the work order with its lines.
      setBusy(true);
      try {
        const created = await api.acceptQuote(quote.quote.id);
        if (status && status !== "приета") await api.setOrderStatus(created.data.id, status);
        if (kmValue || complaint.trim()) {
          const d = await api.getOrder(created.data.id);
          await api.saveOrder({
            data: { ...d.order.data, mileage: kmValue ?? d.order.data.mileage, complaint: complaint.trim() || d.order.data.complaint },
            notes: d.order.notes,
            baseHash: d.order.hash,
          });
        }
        if (expected) await api.removeExpected(expected.id).catch(() => undefined);
        notifyChanged();
        go(`/orders/${created.data.id}`);
      } catch (e) {
        toast(errorMessage(e), true);
      } finally {
        setBusy(false);
      }
      return;
    }
    // The car is here: the work order is saved straight away (onto the board).
    const p = new URLSearchParams({ car: car.car.id, received: "1" });
    if (kmValue) p.set("km", String(kmValue));
    if (complaint.trim()) p.set("complaint", complaint.trim());
    if (expected) p.set("expected", expected.id);
    if (status) p.set("status", status);
    if (job) p.set("job", job.name);
    go(`/orders/new?${p}`);
  }

  function newClient(expected?: ExpectedRow) {
    // From the intake the new client continues to the car and its work order.
    const p = new URLSearchParams(mode === "intake" ? { intake: "1" } : {});
    if (status) p.set("status", status);
    if (expected) p.set("expected", expected.id);
    else if (q.trim()) {
      const looksLikePlate = /\d/.test(q) && plateKey(q).length >= 4 && !/^\+?\d[\d\s]+$/.test(q.trim());
      p.set(looksLikePlate ? "plate" : /^\+?\d[\d\s]+$/.test(q.trim()) ? "phone" : "name", q.trim());
    }
    go(`/clients/new?${p}`);
  }

  function enter(h: Hit | undefined) {
    if (!h) return newClient();
    switch (h.kind) {
      case "car":
        return mode === "intake" ? receive(h.car, h.expected) : go(`/cars/${h.car.car.id}`);
      case "expected":
        return newClient(h.row);
      case "client":
        return go(`/clients/${h.client.client.id}`);
      case "order":
        return go(`/orders/${h.order.order.id}`);
      case "quote":
        return go(`/quotes/${h.quote.quote.id}`);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && !busy) {
      e.preventDefault();
      enter(current);
    }
  };

  return (
    <Dialog title={mode === "intake" ? "Приеми кола" : "Търси"} onClose={onClose} wide>
      <div className="search-dialog" onKeyDown={onKey}>
        <div className="search-top">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>
              {mode === "intake" ? "Приеми кола" : "Търси"}
              {mode === "intake" && status && status !== "приета" && <span className="muted" style={{ fontWeight: 600 }}> → направо „{STATUS_LABEL[status]}“</span>}
            </h2>
            <span className="muted small"><kbd>Esc</kbd> затваря</span>
          </div>
          <label className="search big">
            <Icon name="search" color="var(--accent)" size={20} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Рег. номер, VIN, телефон, име или номер на документ"
              aria-label="Търси кола, клиент или документ"
            />
          </label>
        </div>
        <div className="search-body">
          <div className="search-results" ref={listRef}>
            {!data ? (
              <div className="empty">Зареждане…</div>
            ) : (
              <>
                {!q.trim() && <div className="search-group">Последни и в сервиза</div>}
                {GROUPS.map(([kind, label]) => {
                  const group = hits.filter((h) => h.kind === kind);
                  if (group.length === 0) return null;
                  return (
                    <div key={kind}>
                      {q.trim() && <div className="search-group">{label}</div>}
                      {group.map((h) => (
                        <ResultRow key={h.key} hit={h} on={h.key === current?.key} onPick={() => setSel(hits.indexOf(h))} onOpen={() => enter(h)} />
                      ))}
                    </div>
                  );
                })}
                {q.trim() && hits.length === 0 && <div className="empty">Няма нищо с „{q.trim()}“.</div>}
                <div className="search-new">
                  <button type="button" className="link-btn" onClick={() => newClient()}><strong>+ Нов клиент и кола</strong></button>
                  {q.trim() && <span className="muted small"> — с „{q.trim()}“ попълнено</span>}
                </div>
              </>
            )}
          </div>
          <div className="search-preview">
            {current?.kind === "car" ? (
              <CarPreview
                car={current.car}
                expected={current.expected}
                quote={openQuote(current.car)}
                mileage={mileage}
                setMileage={setMileage}
                complaint={complaint}
                setComplaint={setComplaint}
                jobs={jobs}
                job={job}
                setJob={setJob}
                useQuote={useQuote}
                setUseQuote={setUseQuote}
                busy={busy}
                primaryIsIntake={mode === "intake"}
                onReceive={() => receive(current.car, current.expected)}
                onOpen={() => go(`/cars/${current.car.car.id}`)}
              />
            ) : current?.kind === "expected" ? (
              <div className="stack-12">
                <div className="row"><Plate value={current.row.plate} /><strong>{current.row.client || current.row.phone}</strong></div>
                <div className="muted">{current.row.car} · {current.row.complaint}</div>
                <div className="note info">Няма такава кола в програмата. „Нов клиент и кола“ попълва телефона, името и номера от обаждането и след това отваря работна карта.</div>
                <div className="grow-space" />
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn primary" onClick={() => newClient(current.row)}>Нов клиент и кола</button>
                </div>
              </div>
            ) : (
              <div className="muted search-help">
                <p>Пишете рег. номер на латиница или кирилица, с или без интервали, част от VIN, телефон или име.</p>
                <p><kbd>↑</kbd> <kbd>↓</kbd> избор · <kbd>Enter</kbd> {mode === "intake" ? "приема колата" : "отваря"}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function phonesOf(data: Data, clientId: string): string[] {
  const c = data.clients.find((x) => x.client.id === clientId);
  return c ? [c.client.phone] : [];
}

function ResultRow({ hit, on, onPick, onOpen }: { hit: Hit; on: boolean; onPick: () => void; onOpen: () => void }) {
  const common = {
    type: "button" as const,
    "data-key": hit.key,
    className: `search-row ${on ? "on" : ""}`,
    "aria-selected": on,
    onMouseEnter: onPick,
    onFocus: onPick,
    onClick: onOpen,
  };
  switch (hit.kind) {
    case "car":
      return (
        <button {...common}>
          <Plate value={hit.car.car.plate} />
          <span className="grow">
            <strong>{hit.car.car.make} {hit.car.car.model}</strong>
            <span className="small muted"> {hit.car.ownerName}{hit.car.lastVisit ? ` · ${date(hit.car.lastVisit)}` : ""}</span>
          </span>
          {hit.car.openOrder ? <span className="badge accent">в сервиза</span> : hit.expected ? <span className="badge info">очакван</span> : null}
        </button>
      );
    case "expected":
      return (
        <button {...common}>
          <Plate value={hit.row.plate} />
          <span className="grow"><strong>{hit.row.client || hit.row.phone}</strong><span className="small muted"> {hit.row.complaint}</span></span>
          <span className="badge info">очакван</span>
        </button>
      );
    case "client":
      return (
        <button {...common}>
          <span className="mono small muted search-code">№{String(hit.client.client.number).padStart(4, "0")}</span>
          <span className="grow"><strong>{hit.client.client.name}</strong><span className="small muted"> {hit.client.client.phone} · {hit.client.cars.length} коли</span></span>
        </button>
      );
    case "order":
      return (
        <button {...common}>
          <span className="mono small muted search-code">{hit.order.order.number}</span>
          <span className="grow"><strong>{hit.order.order.title || hit.order.order.complaint || "Работна карта"}</strong><span className="small muted"> {hit.order.plate}</span></span>
          <StatusBadge status={hit.order.order.status} />
        </button>
      );
    case "quote":
      return (
        <button {...common}>
          <span className="mono small muted search-code">{hit.quote.quote.number}</span>
          <span className="grow"><strong>{hit.quote.quote.title || "Документ"}</strong><span className="small muted"> {hit.quote.plate}</span></span>
        </button>
      );
  }
}

function CarPreview(p: {
  car: CarSummary;
  expected?: ExpectedRow;
  quote?: QuoteSummary;
  mileage: string;
  setMileage: (v: string) => void;
  complaint: string;
  setComplaint: (v: string) => void;
  jobs: Job[];
  job: Job | null;
  setJob: (v: Job | null) => void;
  useQuote: boolean;
  setUseQuote: (v: boolean) => void;
  busy: boolean;
  primaryIsIntake: boolean;
  onReceive: () => void;
  onOpen: () => void;
}) {
  const c = p.car;
  const soon = c.deadlines.filter((d) => d.days <= 30);
  return (
    <div className="stack-12">
      <div className="row" style={{ gap: 12 }}>
        <Plate value={c.car.plate} big />
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{c.car.make} {c.car.model}</div>
          <div className="muted small">{c.ownerName}</div>
        </div>
      </div>
      <dl className="kv-list">
        <div><dt>Последен пробег</dt><dd className="mono">{km(c.usage.lastKm)}</dd></div>
        <div><dt>Последно посещение</dt><dd>{date(c.lastVisit)}</dd></div>
        {soon.length > 0 && <div><dt>Срокове</dt><dd className="chips">{soon.map((d) => <DeadlineBadge key={d.kind} label={d.label} days={d.days} />)}</dd></div>}
        {p.expected && <div><dt>Обадил се</dt><dd>{date(p.expected.calledOn)}{p.expected.date ? `, идва ${date(p.expected.date)} ${p.expected.time}` : ""}</dd></div>}
      </dl>
      {c.openOrder ? (
        <div className="note warn">Колата вече е в сервиза{p.primaryIsIntake ? ". Enter отваря работната ѝ карта вместо нова." : " – „Отвори картата“ отваря работната ѝ карта."}</div>
      ) : (
        <>
          {p.quote && (
            <label className="check note info">
              <input type="checkbox" checked={p.useQuote} onChange={(e) => p.setUseQuote(e.target.checked)} />
              <span>Пренеси редовете от <strong>{p.quote.quote.number}</strong> ({p.quote.quote.title || "оферта"}) в работната карта</span>
            </label>
          )}
          {!(p.quote && p.useQuote) && p.jobs.length > 0 && (
            <div className="field">
              Работа
              <div className="job-chips" role="radiogroup" aria-label="Работа">
                <button type="button" role="radio" aria-checked={!p.job} className={!p.job ? "on" : ""} onClick={() => p.setJob(null)}>Нова – по оплакване</button>
                {p.jobs.map((j) => (
                  <button key={j.file} type="button" role="radio" aria-checked={p.job?.file === j.file} className={p.job?.file === j.file ? "on" : ""} onClick={() => p.setJob(j)}>
                    {j.name}
                  </button>
                ))}
              </div>
              <span className="small muted">
                {p.job
                  ? `Направо „${STATUS_LABEL[jobStage(p.job)]}“, с редовете от последния път, когато колата е имала тази работа.`
                  : "Започва от „Приета“ с оплакването на клиента."}{" "}
                <button type="button" className="link-btn small" onClick={() => api.referenceDir("jobs").then(api.openPath)}>Промени списъка</button>
              </span>
            </div>
          )}
          <label className="field">
            Пробег при приемане
            <input className="mono" inputMode="numeric" value={p.mileage} onChange={(e) => p.setMileage(e.target.value)} placeholder={c.usage.lastKm ? `последно ${km(c.usage.lastKm)}` : "км"} />
          </label>
          <label className="field">
            {p.job ? "Бележка (по желание)" : "Оплакване на клиента"}
            <textarea value={p.complaint} onChange={(e) => p.setComplaint(e.target.value)} rows={3} />
          </label>
        </>
      )}
      <div className="grow-space" />
      <div className="row preview-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className={`btn ${p.primaryIsIntake ? "" : "primary"}`} onClick={p.onOpen}>Към колата</button>
        <button type="button" className={`btn ${p.primaryIsIntake ? "primary" : ""}`} onClick={p.onReceive} disabled={p.busy}>
          {c.openOrder ? "Отвори картата" : "Приеми · нова карта"}
        </button>
      </div>
    </div>
  );
}
