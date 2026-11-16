import { FormEvent, useEffect, useState } from "react";
import { api, errorMessage, TimeEntry, TimeLog } from "../api";
import { date, todayIso } from "../lib/format";
import { entryMinutes, formatMinutes, isRunning, parseDuration, toLaborHours } from "../lib/time";
import { Icon, useToast } from "./ui";

/**
 * Time spent on a work order: a start/stop timer (one per mechanic) and time
 * added by hand. Saved in време.md in the order's folder.
 */
export function TimeLogCard({ orderId, mechanic, onAddLabor }: { orderId: string; mechanic: string; onAddLabor: (hours: number, mechanic: string) => void }) {
  const toast = useToast();
  const [log, setLog] = useState<TimeLog | null>(null);
  const [who, setWho] = useState(mechanic);
  const [now, setNow] = useState(() => new Date());
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({ date: todayIso(), time: "", mechanic, note: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.orderTime(orderId).then(setLog).catch((e) => toast(errorMessage(e), true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => setWho((w) => w || mechanic), [mechanic]);

  const running = log?.entries.filter(isRunning) ?? [];
  useEffect(() => {
    if (running.length === 0) return;
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, [running.length]);

  async function run(f: () => Promise<TimeLog>) {
    setBusy(true);
    try {
      setLog(await f());
    } catch (e) {
      toast(errorMessage(e), true);
      api.orderTime(orderId).then(setLog).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function addManual(e: FormEvent) {
    e.preventDefault();
    const minutes = parseDuration(manual.time);
    if (!minutes) {
      toast("Въведете време, напр. 1:30 или 45м", true);
      return;
    }
    await run(() => api.timeAdd(orderId, { date: manual.date, start: "", end: "", minutes, mechanic: manual.mechanic, note: manual.note }));
    setManual({ ...manual, time: "", note: "" });
    setAdding(false);
  }

  if (!log) return null;
  const total = log.entries.reduce((sum, e) => sum + entryMinutes(e, now), 0);
  const finished = log.totalMinutes;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Отработено време</h2>
          <div className="small muted">Общо <strong className="mono">{formatMinutes(total)}</strong> ч{running.length > 0 && " · таймерът тече"}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => setAdding(!adding)}>+ Ръчно</button>
          {finished > 0 && (
            <button
              className="btn small"
              title="Добавя ред в „Извършени дейности“ с отработеното време, закръглено до 15 мин."
              onClick={() => onAddLabor(toLaborHours(finished), mechanic)}
            >
              Добави като труд ({toLaborHours(finished)} ч)
            </button>
          )}
        </div>
      </div>

      <div className="time-controls">
        {running.map((e) => (
          <div key={`${e.date} ${e.start} ${e.mechanic}`} className="time-running" role="timer">
            <span className="time-dot" aria-hidden />
            <span className="mono time-big">{formatMinutes(entryMinutes(e, now))}</span>
            <span className="small muted">{e.mechanic ? `${e.mechanic}, ` : ""}от {e.start}{e.date !== todayIso() ? ` на ${date(e.date)}` : ""}</span>
            <button className="btn small danger-solid" disabled={busy} onClick={() => run(() => api.timeStop(orderId, e))}>Стоп</button>
          </div>
        ))}
        <div className="row" style={{ gap: 6 }}>
          <input className="input" style={{ width: 180 }} value={who} onChange={(e) => setWho(e.target.value)} placeholder="Механик" aria-label="Механик за таймера" />
          <button className="btn small primary" disabled={busy} onClick={() => run(() => api.timeStart(orderId, who))}>
            <Icon name="clock" size={14} />Старт
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={addManual} className="row" style={{ padding: "0 18px 14px", flexWrap: "wrap" }}>
          <input className="input" type="date" style={{ width: 150 }} value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} aria-label="Дата" required />
          <input className="input mono" style={{ width: 110 }} placeholder="1:30" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} aria-label="Време (ч:мм)" autoFocus required />
          <input className="input" style={{ width: 160 }} placeholder="Механик" value={manual.mechanic} onChange={(e) => setManual({ ...manual, mechanic: e.target.value })} aria-label="Механик" />
          <input className="input grow" placeholder="Бележка" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} aria-label="Бележка" />
          <button className="btn small primary" type="submit" disabled={busy}>Добави</button>
        </form>
      )}

      {log.entries.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Дата</th><th>От – до</th><th className="right">Време</th><th>Механик</th><th>Бележка</th><th /></tr></thead>
            <tbody>
              {log.entries.map((e: TimeEntry, i) => (
                <tr key={i}>
                  <td className="mono small">{date(e.date)}</td>
                  <td className="mono small">{e.start ? `${e.start} – ${e.end || "…"}` : <span className="muted">ръчно</span>}</td>
                  <td className="mono small right"><strong>{formatMinutes(entryMinutes(e, now))}</strong></td>
                  <td className="small">{e.mechanic}</td>
                  <td className="small">{e.note}</td>
                  <td className="right">
                    <button
                      className="btn small icon-btn danger"
                      aria-label="Изтрий реда"
                      disabled={busy}
                      onClick={() => window.confirm("Да се изтрие ли този ред от отработеното време?") && run(() => api.timeRemove(orderId, e))}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
