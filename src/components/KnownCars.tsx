// Cars (and clients without a car) already in the program, for forms that
// note down a phone call: type a plate, a name or a phone number and pick.
import { useEffect, useMemo, useState } from "react";
import { api, Expected } from "../api";
import { matches, plateKey } from "../lib/format";
import { Plate } from "./ui";

export interface Known {
  /** "" for a client who has no car yet. */
  carId: string;
  clientId: string;
  plate: string;
  car: string;
  client: string;
  phone: string;
  inShop: boolean;
}

/** Digits only, with +359 / 00359 written as a leading 0. */
export function phoneKey(s: string): string {
  const d = s.replace(/\D/g, "");
  return d.replace(/^(00)?359/, "0");
}

export function useKnown(): Known[] | null {
  const [list, setList] = useState<Known[] | null>(null);
  useEffect(() => {
    Promise.all([api.listCars(), api.listClients()])
      .then(([cars, clients]) => {
        const phone = new Map(clients.map((c) => [c.client.id, c.client.phone]));
        const out: Known[] = cars.map((c) => ({
          carId: c.car.id,
          clientId: c.car.clientId,
          plate: c.car.plate,
          car: `${c.car.make} ${c.car.model}`.trim(),
          client: c.ownerName,
          phone: phone.get(c.car.clientId) ?? "",
          inShop: !!c.openOrder,
        }));
        for (const c of clients) {
          if (c.cars.length === 0) out.push({ carId: "", clientId: c.client.id, plate: "", car: "", client: c.client.name, phone: c.client.phone, inShop: false });
        }
        setList(out);
      })
      .catch(() => setList([]));
  }, []);
  return list;
}

/** Best matches for what was typed in the plate, client or phone field. */
export function findKnown(list: Known[], e: Pick<Expected, "plate" | "client" | "phone">): Known[] {
  const p = e.plate.trim();
  const n = e.client.trim();
  const ph = phoneKey(e.phone);
  if (plateKey(p).length < 2 && n.length < 2 && ph.length < 3) return [];
  return list
    .filter(
      (k) =>
        (plateKey(p).length >= 2 && matches(p, [k.plate], [])) ||
        (n.length >= 2 && matches(n, [], [k.client])) ||
        (ph.length >= 3 && phoneKey(k.phone).includes(ph)),
    )
    .slice(0, 5);
}

/** The known car whose plate is exactly the one typed, if any. */
export function exactPlate(list: Known[], plate: string): Known | undefined {
  const k = plateKey(plate);
  return k ? list.find((x) => x.carId && plateKey(x.plate) === k) : undefined;
}

export function KnownSuggestions({ items, onPick }: { items: Known[]; onPick: (k: Known) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="known-list" role="listbox" aria-label="Има ги в програмата">
      <div className="known-head">Има ги в програмата</div>
      {items.map((k) => (
        <button key={k.carId || `c-${k.clientId}`} type="button" role="option" aria-selected={false} className="known-row" onClick={() => onPick(k)}>
          {k.plate ? <Plate value={k.plate} /> : <span className="badge muted">без кола</span>}
          <span className="grow">
            <strong>{k.car || k.client}</strong>
            <span className="small muted"> {k.car ? k.client : ""}{k.phone ? ` · ${k.phone}` : ""}</span>
          </span>
          {k.inShop && <span className="badge accent">в сервиза</span>}
        </button>
      ))}
    </div>
  );
}

/** A picked car shown as one line, with a way back to typing. */
export function KnownPicked({ k, onClear }: { k: Known; onClear: () => void }) {
  return (
    <div className="known-picked">
      <div className="row" style={{ gap: 8, justifyContent: "space-between" }}>
        {k.plate ? <Plate value={k.plate} /> : <span className="badge muted">нова кола</span>}
        <button type="button" className="link-btn small" onClick={onClear}>Друга</button>
      </div>
      <div>
        <strong>{k.car || "Кола – ще се добави при приемане"}</strong>
        <div className="small muted">{k.client}{k.phone ? ` · ${k.phone}` : ""}</div>
      </div>
      {k.inShop && <div className="small" style={{ color: "var(--warn)" }}>Колата вече е в сервиза.</div>}
    </div>
  );
}

/** Take the car and client from a picked match (replacing what was half typed). */
export function fillFromKnown<T extends Expected>(e: T, k: Known): T {
  return { ...e, plate: k.plate || e.plate, car: k.car || e.car, client: k.client || e.client, phone: k.phone || e.phone };
}

/** Fill only the fields left empty, keeping what was typed by hand. */
export function fillBlanks<T extends Expected>(e: T, k: Known): T {
  return { ...e, car: e.car.trim() || k.car, client: e.client.trim() || k.client, phone: e.phone.trim() || k.phone };
}

/** Pick state for a form: what is picked, and the suggestions to show. */
export function useKnownPick(e: Expected) {
  const list = useKnown();
  const [picked, setPicked] = useState<Known | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // A plate typed in full that is already in the program counts as picked.
  const exact = useMemo(() => (list && !picked ? exactPlate(list, e.plate) : undefined), [list, picked, e.plate]);
  const suggestions = useMemo(() => (list && !picked && !dismissed ? findKnown(list, e) : []), [list, picked, dismissed, e]);
  return { list, picked, setPicked, exact, suggestions, dismiss: () => setDismissed(true), undismiss: () => setDismissed(false) };
}
