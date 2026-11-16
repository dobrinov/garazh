import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api";
import { daysLabel, STATUS_LABEL, statusTone } from "../lib/format";
import { stageOf } from "../lib/stages";

// ---------- icons (inline stroke SVG, no icon font needed offline) ----------

const PATHS: Record<string, string> = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  clients: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5",
  car: "M5 17H3v-5l2-5h14l2 5v5h-2M9.5 17h5M3 12h18M7.5 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM16.5 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  order: "M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4V3h6v1M9 10h6M9 14h6M9 18h3",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  print: "M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  check: "M5 12l5 5 9-11",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  back: "M15 18l-6-6 6-6",
  quote: "M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v5h5M9 13h6M9 17h4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  down: "M6 9l6 6 6-6",
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  board: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10",
};

export function Icon({ name, size = 18, color = "currentColor", width = 2 }: { name: string; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

// ---------- toast ----------

type Toast = { text: string; bad?: boolean } | null;
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, bad?: boolean) => {
    setToast({ text, bad });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), bad ? 7000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast no-print ${toast.bad ? "bad" : ""}`} role="status">
          {toast.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------- data loading ----------

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    load()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  // Re-read from disk when the window regains focus: files may have been edited in Explorer.
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

export function Loading({ error }: { error: string | null }) {
  if (error) return <div className="page"><div className="note bad">{error}</div></div>;
  return <div className="page muted">Зареждане…</div>;
}

// ---------- small pieces ----------

/** A registration plate in the European style: blue band on the left, white field, black frame. */
export function Plate({ value, big }: { value: string; big?: boolean }) {
  return (
    <span className={`plate ${big ? "big" : ""}`} aria-label={value ? `Рег. номер ${value}` : "Без номер"}>
      <span className="plate-eu" aria-hidden="true" />
      <span className="plate-num">{value || "без номер"}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  // Files without a stage (hand-made, early versions) read as "Приета".
  const s = stageOf(status);
  return <span className={`badge ${statusTone(s)}`}>{STATUS_LABEL[s]}</span>;
}

export function DeadlineBadge({ label, days }: { label: string; days: number }) {
  const tone = days < 0 ? "bad" : days <= 30 ? "warn" : "ok";
  return (
    <span className={`badge ${tone}`}>
      {label ? `${label}: ` : ""}{daysLabel(days)}
    </span>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  mono,
  manual,
  list,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  manual?: boolean;
  list?: string;
}) {
  return (
    <label className={`field ${manual ? "manual" : ""}`}>
      <span className="row" style={{ gap: 6 }}>
        {label}
        {manual && <span className="badge manual">Ръчно</span>}
      </span>
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        className={mono ? "mono" : undefined}
        list={list}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

// ---------- menu and dialog ----------

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** A button that opens a short list of less frequent actions ("Още"). */
export function Menu({ label = "Още", items, small, dots }: { label?: string; items: (MenuItem | false | null | undefined)[]; small?: boolean; /** Only "⋯", with `label` as its name. */ dots?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const list = items.filter(Boolean) as MenuItem[];
  if (list.length === 0) return null;
  return (
    <div className="menu" ref={ref}>
      {dots ? (
        <button type="button" className="menu-dots" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      ) : (
        <button type="button" className={`btn ${small ? "small menu-small" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          {label}
          <Icon name="down" size={14} width={2.4} />
        </button>
      )}
      {open && (
        <div className="menu-list" role="menu">
          {list.map((m) => (
            <button
              key={m.label}
              type="button"
              role="menuitem"
              className={m.danger ? "danger" : undefined}
              disabled={m.disabled}
              onClick={() => {
                setOpen(false);
                m.onSelect();
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A modal dialog over the page. Escape and a click outside close it. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-back no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        {children}
      </div>
    </div>
  );
}

/** The current time, updated every `ms` (for "in this stage for …"). */
export function useNow(ms = 60000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
