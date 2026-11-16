import React, { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Car, ClientSummary, emptyCar, errorMessage, isConflict, VinResult } from "../api";
import { useFeatures } from "../components/features";
import { Icon, Loading, TextField, useToast } from "../components/ui";
import { applyVin, VIN_FIELDS, VinField as VinKey } from "../lib/vin";

// Suggestions shown while typing.
const MAKES = ["Volkswagen", "Škoda", "Audi", "SEAT", "BMW", "Mercedes-Benz", "Opel", "Ford", "Renault", "Peugeot", "Citroën", "Toyota", "Hyundai", "Kia", "Dacia", "Fiat", "Nissan", "Honda", "Mazda", "Volvo"];
const FUELS = ["дизел", "бензин", "бензин/газ", "хибрид", "електрически"];
const GEARBOXES = ["5 ст. ръчна", "6 ст. ръчна", "DSG 6 ст.", "DSG 7 ст.", "автоматична", "CVT"];

export function CarEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const expectedId = id ? null : params.get("expected");
  const [car, setCar] = useState<Car | null>(id ? null : { ...emptyCar(params.get("client") ?? ""), plate: (params.get("plate") ?? "").toUpperCase() });
  const [complaint, setComplaint] = useState("");
  useEffect(() => {
    if (!expectedId) return;
    api
      .listExpected()
      .then((rows) => {
        const e = rows.find((r) => r.id === expectedId);
        if (!e) return;
        setComplaint(e.complaint);
        // "VW Touran" → make and model, when the make is a known one.
        const [first, ...rest] = e.car.trim().split(/\s+/);
        const make = MAKES.find((m) => m.toLowerCase() === (first ?? "").toLowerCase() || (first?.toUpperCase() === "VW" && m === "Volkswagen"));
        setCar((c) => (c ? { ...c, plate: c.plate || e.plate.toUpperCase(), make: c.make || (make ?? ""), model: c.model || (make ? rest.join(" ") : e.car) } : c));
      })
      .catch(() => undefined);
  }, [expectedId]);
  const [notes, setNotes] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const features = useFeatures();
  const [vinResult, setVinResult] = useState<VinResult | null>(null);
  const [decoding, setDecoding] = useState(false);
  const carRef = useRef<Car | null>(car);
  carRef.current = car;

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
  const set = <K extends keyof Car>(k: K, v: Car[K]) => {
    // Typing over a value that came from the VIN marks the field as manual,
    // so a later VIN lookup leaves it alone.
    const base = carRef.current ?? car;
    const next =
      (VIN_FIELDS as readonly string[]).includes(k as string) && base.vinFields.includes(k as string)
        ? { ...base, [k]: v, vinFields: base.vinFields.filter((f) => f !== k), manualFields: [...new Set([...base.manualFields, k as string])] }
        : { ...base, [k]: v };
    carRef.current = next;
    setCar(next);
  };
  const suggestion = (k: VinKey) => {
    const f = vinResult?.fields.find((x) => x.field === k);
    if (!f || String(car[k] ?? "") === f.value) return undefined;
    return f;
  };
  const vinHint = (k: VinKey) => {
    const f = suggestion(k);
    if (f) return `VIN: ${f.value}`;
    if (car.vinFields.includes(k)) return "попълнено от VIN";
    return undefined;
  };
  const takeVin = (k: VinKey) => {
    const f = suggestion(k);
    if (!f) return;
    setCar({
      ...car,
      [k]: k === "year" ? Number(f.value) || null : f.value,
      manualFields: car.manualFields.filter((x) => x !== k),
      vinFields: [...new Set([...car.vinFields, k])],
    });
  };

  async function decode(vin = car?.vin ?? "") {
    if (!car) return;
    setDecoding(true);
    try {
      const r = await api.decodeVin(vin);
      setVinResult(r);
      // Apply the answer to the form as it is now, not as it was when the
      // lookup started: the VIN was typed or pasted in that same moment, and
      // the user may have typed more while waiting.
      const latest = carRef.current;
      if (!latest) return;
      const { car: next, filled } = applyVin(latest, r);
      carRef.current = next;
      setCar(next);
      if (!r.valid) toast(r.warnings[0] ?? "Невалиден VIN", true);
      else toast(filled.length ? `Попълнени от VIN: ${filled.length} полета` : "Няма нови данни от VIN");
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setDecoding(false);
    }
  }
  const owner = clients.find((c) => c.client.id === car.clientId);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!car) return;
    setBusy(true);
    try {
      const saved = await api.saveCar({ data: car, notes, baseHash: hash });
      toast("Автомобилът е запазен");
      if (expectedId || params.get("intake")) {
        const next = new URLSearchParams({ car: saved.data.id });
        if (expectedId) next.set("expected", expectedId);
        if (complaint) next.set("complaint", complaint);
        if (params.get("status")) next.set("status", params.get("status")!);
        nav(`/orders/new?${next}`, { replace: true });
      } else {
        nav(`/cars/${saved.data.id}`, { replace: true });
      }
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
            <Link to="/cars">Клиенти и коли</Link><span>/</span><span>{id ? car.plate || "Автомобил" : "Нов автомобил"}</span>
          </div>
          <h1>{id ? "Редактиране на автомобил" : "Нов автомобил"}</h1>
          {owner && <div className="muted">Собственик: {owner.client.name}</div>}
          {(expectedId || params.get("intake")) && <div className="muted">Приемане на кола: 1. клиент ✓ → 2. кола → 3. работна карта</div>}
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => nav(-1)}>Отказ</button>
          <button type="submit" className="btn primary" disabled={busy || !car.clientId}>Запази</button>
        </div>
      </div>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2>Основни данни</h2>
        <div className="grid">
          <TextField label="Регистрационен номер" value={car.plate} onChange={(v) => set("plate", v)} placeholder="напр. СА 1234 АВ" mono />
          <div className="field">
            <TextField
              label="VIN"
              value={car.vin}
              onChange={(v) => set("vin", v.toUpperCase().replace(/\s/g, ""))}
              placeholder="17 знака"
              mono
              hint={car.vin && car.vin.length !== 17 ? `${car.vin.length} от 17 знака` : vinResult ? [vinResult.country, ...vinResult.warnings].filter(Boolean).join(" · ") : undefined}
            />
            {features.vin && (
              <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} disabled={decoding || car.vin.length !== 17} onClick={() => decode()}>
                <Icon name="scan" size={15} />{decoding ? "Проверка…" : features.vinOnline ? "Разчети VIN (и онлайн)" : "Разчети VIN"}
              </button>
            )}
          </div>
          <VinAware k="make" label="Марка" car={car} hint={vinHint("make")} onTake={takeVin} has={!!suggestion("make")}>
            <TextField label="Марка" value={car.make} onChange={(v) => set("make", v)} list="makes" manual={car.manualFields.includes("make")} hint={vinHint("make")} />
          </VinAware>
          <VinAware k="model" label="Модел" car={car} hint={vinHint("model")} onTake={takeVin} has={!!suggestion("model")}>
            <TextField label="Модел" value={car.model} onChange={(v) => set("model", v)} manual={car.manualFields.includes("model")} hint={vinHint("model")} />
          </VinAware>
          <VinAware k="year" label="Година" car={car} hint={vinHint("year")} onTake={takeVin} has={!!suggestion("year")}>
            <TextField label="Година" type="number" value={car.year ?? ""} onChange={(v) => set("year", v ? Number(v) : null)} manual={car.manualFields.includes("year")} hint={vinHint("year")} />
          </VinAware>
          <VinAware k="fuel" label="Гориво" car={car} hint={vinHint("fuel")} onTake={takeVin} has={!!suggestion("fuel")}>
            <TextField label="Гориво" value={car.fuel} onChange={(v) => set("fuel", v)} list="fuels" manual={car.manualFields.includes("fuel")} hint={vinHint("fuel")} />
          </VinAware>
        </div>
        <h2>Двигател и скоростна кутия</h2>
        <div className="grid">
          <VinAware k="engine" label="Двигател" car={car} hint={vinHint("engine")} onTake={takeVin} has={!!suggestion("engine")}>
            <TextField label="Двигател" value={car.engine} onChange={(v) => set("engine", v)} manual={car.manualFields.includes("engine")} hint={vinHint("engine")} />
          </VinAware>
          <VinAware k="engineCode" label="Код на двигателя" car={car} hint={vinHint("engineCode")} onTake={takeVin} has={!!suggestion("engineCode")}>
            <TextField label="Код на двигателя" value={car.engineCode} onChange={(v) => set("engineCode", v.toUpperCase())} mono manual={car.manualFields.includes("engineCode")} hint={vinHint("engineCode") ?? "Определя графика за поддръжка"} />
          </VinAware>
          <VinAware k="gearbox" label="Скоростна кутия" car={car} hint={vinHint("gearbox")} onTake={takeVin} has={!!suggestion("gearbox")}>
            <TextField label="Скоростна кутия" value={car.gearbox} onChange={(v) => set("gearbox", v)} list="gearboxes" manual={car.manualFields.includes("gearbox")} hint={vinHint("gearbox")} />
          </VinAware>
          <VinAware k="gearboxCode" label="Код на кутията" car={car} hint={vinHint("gearboxCode")} onTake={takeVin} has={!!suggestion("gearboxCode")}>
            <TextField label="Код на кутията" value={car.gearboxCode} onChange={(v) => set("gearboxCode", v.toUpperCase())} mono manual={car.manualFields.includes("gearboxCode")} hint={vinHint("gearboxCode") ?? "От табелката на кутията или документите"} />
          </VinAware>
          <TextField label="Цвят" value={car.color} onChange={(v) => set("color", v)} />
          <TextField label="Код боя" value={car.paintCode} onChange={(v) => set("paintCode", v)} mono />
          <TextField label="Гуми" value={car.tyres} onChange={(v) => set("tyres", v)} placeholder="напр. 225/45 R17" />
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

/** Wraps a field that the VIN can fill: offers the VIN value when it differs. */
function VinAware({ k, label, has, onTake, children }: { k: VinKey; label: string; car: Car; hint?: string; has: boolean; onTake: (k: VinKey) => void; children: React.ReactNode }) {
  return (
    <div className="vin-aware">
      {children}
      {has && (
        <button type="button" className="link-btn small" onClick={() => onTake(k)} aria-label={`Вземи стойността от VIN за ${label}`}>
          ← вземи от VIN
        </button>
      )}
    </div>
  );
}
