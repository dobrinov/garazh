import { FormEvent, useState } from "react";
import { api, CarPage, CarSchedule, DueItem, errorMessage, isConflict } from "../api";
import { date, int, km, todayIso } from "../lib/format";
import { Icon, useToast } from "./ui";

const STATUS: Record<string, { label: string; tone: string }> = {
  просрочено: { label: "Просрочено", tone: "bad" },
  скоро: { label: "Предстои скоро", tone: "warn" },
  наред: { label: "Наред", tone: "ok" },
  няма_запис: { label: "Няма запис", tone: "muted" },
};

function interval(i: DueItem) {
  const parts = [i.intervalKm ? `${int(i.intervalKm)} км` : "", i.intervalMonths ? `${i.intervalMonths} мес.` : ""].filter(Boolean);
  return parts.join(" / ") || "—";
}

function left(i: DueItem) {
  const out: string[] = [];
  if (i.kmLeft !== null) out.push(i.kmLeft < 0 ? `${int(-i.kmLeft)} км след срока` : `${int(i.kmLeft)} км`);
  if (i.daysLeft !== null) out.push(i.daysLeft < 0 ? `${-i.daysLeft} дни след срока` : `${i.daysLeft} дни`);
  return out.join(" · ");
}

export function ScheduleTab({ data, schedule, onChange }: { data: CarPage; schedule: CarSchedule; onChange: () => void }) {
  const toast = useToast();
  const car = data.car.data;
  const [marking, setMarking] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const unverified = schedule.schedules.filter((s) => !s.meta.verified);

  async function pin(files: string[]) {
    try {
      await api.saveCar({ data: { ...car, schedules: files }, notes: data.car.notes, baseHash: data.car.hash });
      toast(files.length ? "Графикът е избран ръчно" : "Графикът се избира автоматично по кода на двигателя");
      onChange();
    } catch (e) {
      toast(isConflict(e) ? "Файлът на колата е променен извън програмата. Опитайте отново." : errorMessage(e), true);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>График за поддръжка</h2>
            <div className="small muted">
              {schedule.pinned ? "Избран ръчно" : `Избран автоматично по ${car.engineCode ? `код на двигателя ${car.engineCode}` : "марка и гориво"}${car.gearboxCode ? ` и кутия ${car.gearboxCode}` : ""}`}
              {" · "}следващата дата се изчислява от натоварването на колата
              {data.usage.recentPerMonth ? ` (≈ ${int(data.usage.recentPerMonth)} км/мес.)` : ""}
            </div>
          </div>
          <button className="btn small" onClick={() => setChoosing(!choosing)}>Избери график…</button>
        </div>
        {schedule.schedules.length === 0 && (
          <div className="note warn">
            Няма подходящ график. Въведете кода на двигателя и горивото в данните на колата или изберете график ръчно.
          </div>
        )}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {schedule.schedules.map((s) => (
            <button key={s.file} className="chip" onClick={() => api.openPath(s.path)} title={`Отвори ${s.file} – ${s.meta.source}`}>
              {s.meta.name}
              <span className="muted small"> · {s.kind}</span>
              {!s.meta.verified && <span className="badge warn" style={{ marginLeft: 6 }}>непроверен</span>}
            </button>
          ))}
        </div>
        {unverified.length > 0 && (
          <div className="note warn small">
            Интервалите в графиците, отбелязани „непроверен“, са примерни. Сверете ги с данните на производителя, преди да ги
            препоръчате на клиента. Щракнете графика, за да отворите файла му.
          </div>
        )}
        {choosing && <Chooser schedule={schedule} onPin={(f) => { setChoosing(false); pin(f); }} />}
      </section>

      {schedule.items.length > 0 && (
        <section className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Операция</th><th>Интервал</th><th>Последно</th><th>Следващо</th><th>Остават</th><th>Статус</th><th /></tr>
              </thead>
              <tbody>
                {schedule.items.map((i) => {
                  const key = `${i.schedule}|${i.operation}`;
                  const st = STATUS[i.status] ?? STATUS.няма_запис;
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{i.operation}</strong>
                        {i.note && <div className="small muted">{i.note}</div>}
                        {marking === key && <MarkDone carId={car.id} operation={i.operation} lastKm={data.usage.lastKm} onDone={() => { setMarking(null); onChange(); }} onCancel={() => setMarking(null)} />}
                      </td>
                      <td className="small nowrap">{interval(i)}</td>
                      <td className="small">
                        {i.last ? (
                          <>
                            <span className="mono">{date(i.last.date)}</span>
                            {i.last.km !== null && <span className="mono"> · {km(i.last.km)}</span>}
                            <div className="muted">{i.last.what}</div>
                          </>
                        ) : (
                          <span className="muted">няма запис</span>
                        )}
                      </td>
                      <td className="small">
                        {i.dueKm !== null && <div className="mono">{km(i.dueKm)}</div>}
                        {i.nextDate && <div className="mono">{date(i.nextDate)}{i.dueByKm && i.nextDate === i.dueByKm && i.dueByKm !== i.dueByTime ? " (по пробег)" : ""}</div>}
                      </td>
                      <td className="small">{left(i)}</td>
                      <td><span className={`badge ${st.tone}`}>{st.label}</span></td>
                      <td>
                        {marking !== key && (
                          <button className="btn small" onClick={() => setMarking(key)} title="Направено извън сервиза или преди колата да дойде при нас">
                            <Icon name="check" size={14} />Отбележи
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ padding: "10px 18px 14px" }}>
            „Последно“ се намира автоматично в части.md и в работните карти. Отбелязаното ръчно се пази в график-поддръжка.md в папката на колата.
          </div>
        </section>
      )}
    </div>
  );
}

function Chooser({ schedule, onPin }: { schedule: CarSchedule; onPin: (files: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(schedule.pinned ? schedule.schedules.map((s) => s.file) : []);
  const groups = ["двигател", "кутия", "общ"];
  return (
    <div className="card pad" style={{ background: "var(--ground)", display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map((g) => (
        <div key={g}>
          <div className="small muted" style={{ marginBottom: 4 }}>{g === "общ" ? "Общи" : g === "кутия" ? "Скоростни кутии" : "Двигатели"}</div>
          <div className="row" style={{ flexWrap: "wrap", gap: "4px 16px" }}>
            {schedule.available.filter((a) => a.kind === g).map((a) => (
              <label key={a.file} className="check small">
                <input type="checkbox" checked={sel.includes(a.file)} onChange={(e) => setSel(e.target.checked ? [...sel, a.file] : sel.filter((x) => x !== a.file))} />
                {a.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="row">
        <button className="btn small primary" disabled={sel.length === 0} onClick={() => onPin(sel)}>Използвай избраните</button>
        <button className="btn small" onClick={() => onPin([])}>Автоматично по кода на двигателя</button>
      </div>
    </div>
  );
}

function MarkDone({ carId, operation, lastKm, onDone, onCancel }: { carId: string; operation: string; lastKm: number | null; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(todayIso());
  const [k, setK] = useState(lastKm ? String(lastKm) : "");
  const [note, setNote] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.markDone(carId, { operation, date: d, km: Number(k.replace(/\D/g, "")) || null, note });
      toast("Записано в график-поддръжка.md");
      onDone();
    } catch (err) {
      toast(errorMessage(err), true);
    }
  }
  return (
    <form className="row" style={{ marginTop: 8, flexWrap: "wrap" }} onSubmit={submit}>
      <input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} style={{ width: 150 }} aria-label="Дата" required />
      <input className="input mono" value={k} onChange={(e) => setK(e.target.value)} placeholder="Км" style={{ width: 110 }} aria-label="Пробег" />
      <input className="input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Бележка, напр. друг сервиз" aria-label="Бележка" />
      <button className="btn small primary" type="submit">Запиши</button>
      <button className="btn small" type="button" onClick={onCancel}>Отказ</button>
    </form>
  );
}
