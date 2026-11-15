import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Car, ClientSummary, emptyCar, errorMessage, isConflict } from "../api";
import { Loading, TextField, useToast } from "../components/ui";

// Suggestions shown while typing. VIN decoding comes in version 1.0.
const MAKES = ["Volkswagen", "Škoda", "Audi", "SEAT", "BMW", "Mercedes-Benz", "Opel", "Ford", "Renault", "Peugeot", "Citroën", "Toyota", "Hyundai", "Kia", "Dacia", "Fiat", "Nissan", "Honda", "Mazda", "Volvo"];
const FUELS = ["дизел", "бензин", "бензин/газ", "хибрид", "електрически"];
const GEARBOXES = ["5 ст. ръчна", "6 ст. ръчна", "DSG 6 ст.", "DSG 7 ст.", "автоматична", "CVT"];

export function CarEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [car, setCar] = useState<Car | null>(id ? null : emptyCar(params.get("client") ?? ""));
  const [notes, setNotes] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listClients().then((cs) => setClients([...cs].sort((a, b) => a.client.name.localeCompare(b.client.name, "bg"))));
    if (!id) return;
    api
      .getCar(id)
      .then((d) => {
        setCar(d.car.data);
        setNotes(d.car.notes);
        setHash(d.car.hash);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (!car) return <Loading error={error} />;
  const set = <K extends keyof Car>(k: K, v: Car[K]) => setCar({ ...car, [k]: v });
  const owner = clients.find((c) => c.client.id === car.clientId);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!car) return;
    setBusy(true);
    try {
      const saved = await api.saveCar({ data: car, notes, baseHash: hash });
      toast("Автомобилът е запазен");
      nav(`/cars/${saved.data.id}`, { replace: true });
    } catch (err) {
      toast(isConflict(err) ? "Файлът на колата е променен извън програмата. Отворете я отново." : errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  const dateField = (label: string, k: "inspectionUntil" | "insuranceUntil" | "vignetteUntil") => (
    <TextField label={label} type="date" value={car[k] ?? ""} onChange={(v) => set(k, v || null)} />
  );

  return (
    <form className="page" onSubmit={save}>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link to="/cars">Автомобили</Link><span>/</span><span>{id ? car.plate || "Автомобил" : "Нов автомобил"}</span>
          </div>
          <h1>{id ? "Редактиране на автомобил" : "Нов автомобил"}</h1>
          {owner && <div className="muted">Собственик: {owner.client.name}</div>}
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => nav(-1)}>Отказ</button>
          <button type="submit" className="btn primary" disabled={busy || !car.clientId}>Запази</button>
        </div>
      </div>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2>Основни данни</h2>
        <div className="grid">
          <TextField label="Регистрационен номер" value={car.plate} onChange={(v) => set("plate", v)} placeholder="СА 1234 АВ" mono />
          <TextField label="VIN" value={car.vin} onChange={(v) => set("vin", v.toUpperCase())} placeholder="17 знака" mono hint={car.vin && car.vin.length !== 17 ? `${car.vin.length} от 17 знака` : undefined} />
          <TextField label="Марка" value={car.make} onChange={(v) => set("make", v)} list="makes" />
          <TextField label="Модел" value={car.model} onChange={(v) => set("model", v)} placeholder="Golf VII" />
          <TextField label="Година" type="number" value={car.year ?? ""} onChange={(v) => set("year", v ? Number(v) : null)} />
          <TextField label="Гориво" value={car.fuel} onChange={(v) => set("fuel", v)} list="fuels" />
        </div>
        <h2>Двигател и скоростна кутия</h2>
        <div className="grid">
          <TextField label="Двигател" value={car.engine} onChange={(v) => set("engine", v)} placeholder="2.0 TDI 110 kW" />
          <TextField label="Код на двигателя" value={car.engineCode} onChange={(v) => set("engineCode", v.toUpperCase())} placeholder="CRLB" mono />
          <TextField label="Скоростна кутия" value={car.gearbox} onChange={(v) => set("gearbox", v)} list="gearboxes" />
          <TextField label="Код на кутията" value={car.gearboxCode} onChange={(v) => set("gearboxCode", v.toUpperCase())} placeholder="DQ250" mono />
          <TextField label="Цвят" value={car.color} onChange={(v) => set("color", v)} />
          <TextField label="Код боя" value={car.paintCode} onChange={(v) => set("paintCode", v)} mono />
          <TextField label="Гуми" value={car.tyres} onChange={(v) => set("tyres", v)} placeholder="225/45 R17" />
        </div>
        <h2>Срокове</h2>
        <div className="grid">
          {dateField("ГТП валиден до", "inspectionUntil")}
          {dateField("Гражданска отговорност до", "insuranceUntil")}
          {dateField("Винетка до", "vignetteUntil")}
        </div>
        <h2>Собственик</h2>
        <label className="field" style={{ maxWidth: 420 }}>
          Клиент
          <select value={car.clientId} onChange={(e) => set("clientId", e.target.value)}>
            <option value="">— изберете —</option>
            {clients.map((c) => (
              <option key={c.client.id} value={c.client.id}>{c.client.name}</option>
            ))}
          </select>
          {id && <span className="hint">При смяна на собственика папката на колата, с цялата ѝ история, се премества при новия клиент.</span>}
        </label>
        <label className="field">
          Бележки
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Резервен ключ, секретни болтове, предпочитания…" />
        </label>
      </section>

      <datalist id="makes">{MAKES.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="fuels">{FUELS.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="gearboxes">{GEARBOXES.map((m) => <option key={m} value={m} />)}</datalist>
    </form>
  );
}
