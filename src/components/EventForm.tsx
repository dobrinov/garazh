// "Минало събитие": something that happened to the car before it came here
// or in another shop (a repair, a service, an accident). One row of събития.md.
import { FormEvent, useState } from "react";
import { api, CarEvent, errorMessage } from "../api";
import { todayIso } from "../lib/format";
import { Dialog, TextField, useToast } from "./ui";

export const emptyEvent = (): CarEvent => ({ date: todayIso(), km: null, what: "", place: "", amount: "", note: "" });

export function EventForm({ carId, original, onClose, onSaved }: { carId: string; original: CarEvent | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [e, setE] = useState<CarEvent>(original ?? emptyEvent());
  const [kmText, setKmText] = useState(original?.km ? String(original.km) : "");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CarEvent>(k: K, v: CarEvent[K]) => setE({ ...e, [k]: v });

  async function run(what: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await what();
      toast(done);
      onSaved();
    } catch (err) {
      toast(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  function save(ev: FormEvent) {
    ev.preventDefault();
    const km = Number(kmText.replace(/\D/g, "")) || null;
    void run(() => api.saveEvent(carId, { ...e, what: e.what.trim(), place: e.place.trim(), amount: e.amount.trim(), note: e.note.trim(), km }, original), "Записано в историята на колата");
  }

  function remove() {
    if (!original || !window.confirm(`Да се изтрие ли „${original.what}“ от историята на колата?`)) return;
    void run(() => api.removeEvent(carId, original), "Събитието е изтрито");
  }

  const title = original ? "Минало събитие" : "Добави минало събитие";
  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={save} className="dialog-form">
        <h2>{title}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Ремонт или обслужване в друг сервиз или преди колата да дойде при вас, катастрофа и всичко друго, което е добре да се знае. Пробегът се брои към пробега на колата, а графикът за поддръжка го отчита като направено.
        </p>
        <div className="grid two">
          <TextField label="Дата" type="date" value={e.date} onChange={(v) => set("date", v)} />
          <TextField label="Пробег, км" value={kmText} onChange={setKmText} mono placeholder="ако се знае" />
        </div>
        <label className="field">
          Какво е направено / станало
          <input value={e.what} onChange={(ev) => set("what", ev.target.value)} placeholder="напр. Смяна на ангренаж и водна помпа" required autoFocus />
        </label>
        <div className="grid two">
          <TextField label="Къде" value={e.place} onChange={(v) => set("place", v)} placeholder="напр. друг сервиз, при дилър" />
          <TextField label="Сума" value={e.amount} onChange={(v) => set("amount", v)} placeholder="напр. 640 лв" />
        </div>
        <label className="field">
          Бележка
          <textarea value={e.note} onChange={(ev) => set("note", ev.target.value)} rows={2} />
        </label>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {original ? <button type="button" className="btn danger" onClick={remove} disabled={busy}>Изтрий</button> : <span />}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Отказ</button>
            <button type="submit" className="btn primary" disabled={busy}>Запиши</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
