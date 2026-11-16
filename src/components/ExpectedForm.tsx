// "+ Очакван": write down a client who called and will bring the car.
import { FormEvent, useState } from "react";
import { api, errorMessage, Expected, notifyChanged } from "../api";
import { fillBlanks, fillFromKnown, KnownPicked, KnownSuggestions, useKnownPick } from "./KnownCars";
import { Dialog, TextField, useToast } from "./ui";

export function ExpectedForm({ row, onClose, onSaved }: { row: Expected; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [e, setE] = useState<Expected>(row);
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
      toast(row.id ? "Записано" : "Записан в „Очаквани“");
      notifyChanged();
      onSaved();
    } catch (err) {
      toast(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.removeExpected(row.id);
      toast("Махнат от „Очаквани“");
      notifyChanged();
      onSaved();
    } catch (err) {
      toast(errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={row.id ? "Очаквана кола" : "Нова очаквана кола"} onClose={onClose}>
      <form onSubmit={save} className="dialog-form">
        <h2>{row.id ? "Очаквана кола" : "Обади се клиент"}</h2>
        <p className="muted small" style={{ margin: 0 }}>Записва се в „очаквани.md“ в папката с данни. Когато колата дойде, „Приеми“ отваря работна карта с това оплакване.</p>
        {pick.picked ? (
          <KnownPicked k={pick.picked} onClear={() => { pick.setPicked(null); setE({ ...e, plate: "", car: "", client: "", phone: "" }); }} />
        ) : (
          <>
            <div className="grid two">
              <TextField label="Рег. номер" value={e.plate} onChange={(v) => set("plate", v)} mono placeholder="ако е известен" hint={pick.exact ? `${pick.exact.car} · ${pick.exact.client}${pick.exact.inShop ? " · вече е в сервиза" : ""}` : undefined} />
              <TextField label="Кола" value={e.car} onChange={(v) => set("car", v)} placeholder={pick.exact?.car || "марка и модел"} />
              <TextField label="Клиент" value={e.client} onChange={(v) => set("client", v)} />
              <TextField label="Телефон" value={e.phone} onChange={(v) => set("phone", v)} type="tel" />
            </div>
            <KnownSuggestions items={pick.exact ? [] : pick.suggestions} onPick={(k) => { pick.setPicked(k); setE(fillFromKnown(e, k)); }} />
          </>
        )}
        <div className="grid two">
          <TextField label="Идва на" type="date" value={e.date} onChange={(v) => set("date", v)} hint="празно, ако не е уговорен ден" />
          <TextField label="Час" type="time" value={e.time} onChange={(v) => set("time", v)} />
        </div>
        <label className="field">
          Оплакване / какво трябва
          <textarea value={e.complaint} onChange={(ev) => set("complaint", ev.target.value)} rows={3} />
        </label>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {row.id ? <button type="button" className="btn danger" onClick={remove} disabled={busy}>Махни (няма да дойде)</button> : <span />}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Отказ</button>
            <button type="submit" className="btn primary" disabled={busy}>Запиши</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
