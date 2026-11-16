import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, Update } from "@tauri-apps/plugin-updater";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api";

type Status = "idle" | "checking" | "none" | "available" | "downloading" | "restarting" | "error" | "unconfigured";

interface Updates {
  current: string;
  status: Status;
  update: Update | null;
  /** 0..1 while downloading, null when the size is unknown. */
  progress: number | null;
  error: string | null;
  lastChecked: Date | null;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
}

const Ctx = createContext<Updates | null>(null);
const FIRST_CHECK_MS = 8_000;
const EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Checks GitHub Releases for a newer signed version (the address is set when
 * the installer is built). A locally built copy has no address and reports
 * "unconfigured" instead of failing.
 */
export function UpdatesProvider({ auto, backupConfigured, children }: { auto: boolean; backupConfigured: boolean; children: ReactNode }) {
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    getVersion().then(setCurrent).catch(() => setCurrent(""));
  }, []);

  const run = useCallback(async (quiet: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (!quiet) setStatus("checking");
    setError(null);
    try {
      const u = await check();
      setUpdate(u);
      setStatus(u ? "available" : "none");
    } catch (e) {
      const msg = errorMessage(e);
      if (/endpoint/i.test(msg)) setStatus("unconfigured");
      else if (!quiet) {
        setStatus("error");
        setError(msg);
      }
    } finally {
      setLastChecked(new Date());
      busy.current = false;
    }
  }, []);

  const lastRun = useRef(0);
  useEffect(() => {
    if (!auto) return;
    const quiet = () => {
      lastRun.current = Date.now();
      run(true);
    };
    const first = window.setTimeout(quiet, FIRST_CHECK_MS);
    const every = window.setInterval(quiet, EVERY_MS);
    // Timers stall while the computer sleeps; a PC woken in the morning
    // checks as soon as the window is used again.
    const onFocus = () => {
      if (lastRun.current && Date.now() - lastRun.current > EVERY_MS) quiet();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener("focus", onFocus);
    };
  }, [auto, run]);

  const install = useCallback(async () => {
    if (!update) return;
    setError(null);
    // The data folder is never touched by an update, but a fresh copy costs
    // little and protects against anything unexpected.
    if (backupConfigured) {
      try {
        await api.backupNow();
      } catch (e) {
        if (!window.confirm(`Архивът преди обновяване не успя: ${errorMessage(e)}\n\nДа продължи ли обновяването?`)) return;
      }
    }
    setStatus("downloading");
    setProgress(0);
    let total = 0;
    let done = 0;
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          total = ev.data.contentLength ?? 0;
          setProgress(total ? 0 : null);
        } else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          setProgress(total ? Math.min(1, done / total) : null);
        }
      });
      setStatus("restarting");
      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(errorMessage(e));
    }
  }, [update, backupConfigured]);

  return (
    <Ctx.Provider value={{ current, status, update, progress, error, lastChecked, checkNow: () => run(false), install }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUpdates(): Updates {
  const v = useContext(Ctx);
  if (!v) throw new Error("UpdatesProvider missing");
  return v;
}

const SNOOZE_KEY = "garazh.updateSnooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function snoozed(version: string): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "null");
    return !!v && v.version === version && Date.now() < v.until;
  } catch {
    return false;
  }
}

/**
 * Banner across the top of every page when a newer version is available.
 * "По-късно" hides it for a day (for that version); it comes back after that.
 */
export function UpdateBanner() {
  const u = useUpdates();
  const [open, setOpen] = useState(false);
  const [, rerender] = useState(0);
  if (!u.update || !["available", "downloading", "restarting", "error"].includes(u.status)) return null;
  const version = u.update.version;
  if (u.status === "available" && snoozed(version)) return null;

  function later() {
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version, until: Date.now() + SNOOZE_MS }));
    } catch {
      /* without storage the banner just stays */
    }
    rerender((n) => n + 1);
  }

  return (
    <div className="update-banner" role="status">
      <div className="update-banner-row">
        <div className="grow">
          <div className="update-title">Има нова версия на Гараж: {version}</div>
          <div className="update-sub">
            {u.status === "available" && <>Вие използвате {u.current || "по-стара версия"}. Програмата ще се рестартира; данните не се променят.</>}
            {u.status === "downloading" && <>Изтегляне{u.progress !== null ? ` ${Math.round(u.progress * 100)}%` : "…"}</>}
            {u.status === "restarting" && <>Инсталиране и рестартиране…</>}
            {u.status === "error" && <span className="update-error">Обновяването не успя: {u.error}</span>}
          </div>
        </div>
        {u.status === "available" && (
          <div className="row" style={{ gap: 6 }}>
            {u.update.body && <button className="btn small ghost" onClick={() => setOpen(!open)}>{open ? "Скрий" : "Какво ново"}</button>}
            <button className="btn small ghost" onClick={later}>По-късно</button>
            <button className="btn small primary" onClick={u.install}>Обнови сега</button>
          </div>
        )}
        {u.status === "error" && <button className="btn small" onClick={u.install}>Опитай пак</button>}
      </div>
      {u.status === "downloading" && (
        <div className="update-bar" aria-label="Изтегляне"><div style={{ width: `${Math.round((u.progress ?? 0.5) * 100)}%` }} className={u.progress === null ? "indeterminate" : ""} /></div>
      )}
      {open && u.status === "available" && u.update.body && <div className="update-notes">{u.update.body}</div>}
    </div>
  );
}
