import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Client, emptyClient, errorMessage, isConflict } from "../api";
import { Loading, TextField, useToast } from "../components/ui";
import { todayIso } from "../lib/format";

export function ClientEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  // From "Приеми кола" or an expected car: a new client starts with what is known.
  const expectedId = id ? null : params.get("expected");
  const [client, setClient] = useState<Client | null>(id ? null : { ...emptyClient(), name: params.get("name") ?? "", phone: params.get("phone") ?? "" });
  const [notes, setNotes] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expectedId) return;
    api
      .listExpected()
      .then((rows) => {
        const e = rows.find((r) => r.id === expectedId);
        if (e) setClient((c) => (c ? { ...c, name: c.name || e.client, phone: c.phone || e.phone } : c));
      })
      .catch(() => undefined);
  }, [expectedId]);

  useEffect(() => {
    if (!id) return;
    api
      .getClient(id)
      .then((d) => {
        setClient(d.client.data);
        setNotes(d.client.notes);
        setHash(d.client.hash);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (!client) return <Loading error={error} />;
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setClient({ ...client, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    try {
      const saved = await api.saveClient({ data: client, notes, baseHash: hash });
      toast("Клиентът е запазен");
      if (!id && (expectedId || params.get("intake"))) {
        // Receiving a car: the car comes next, then its work order.
        const next = new URLSearchParams({ client: saved.data.id });
        if (expectedId) next.set("expected", expectedId);
        if (params.get("plate")) next.set("plate", params.get("plate")!);
        if (params.get("status")) next.set("status", params.get("status")!);
        if (params.get("intake")) next.set("intake", "1");
        nav(`/cars/new?${next}`, { replace: true });
      } else {
        nav(`/clients/${saved.data.id}`, { replace: true });
      }
    } catch (err) {
      toast(isConflict(err) ? "Файлът на клиента е променен извън програмата. Отворете го отново и повторете промените." : errorMessage(err), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="page" onSubmit={save}>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/clients">Клиенти и коли</Link><span>/</span><span>{id ? client.name : "Нов клиент"}</span></div>
          <h1>{id ? "Редактиране на клиент" : "Нов клиент"}</h1>
          {(expectedId || params.get("intake")) && <div className="muted">Приемане на кола: 1. клиент → 2. кола → 3. работна карта</div>}
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => nav(-1)}>Отказ</button>
          <button type="submit" className="btn primary" disabled={busy || !client.name.trim()}>Запази</button>
        </div>
      </div>

      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="chips" role="radiogroup" aria-label="Вид клиент">
          {["частно", "фирма"].map((k) => (
            <button type="button" key={k} role="radio" aria-checked={client.kind === k} className={`chip ${client.kind === k ? "on" : ""}`} onClick={() => set("kind", k)}>
              {k === "частно" ? "Частно лице" : "Фирма"}
            </button>
          ))}
        </div>
        <div className="grid">
          <TextField label={client.kind === "фирма" ? "Име на фирмата" : "Име и фамилия"} value={client.name} onChange={(v) => set("name", v)} />
          <TextField label="Телефон" value={client.phone} onChange={(v) => set("phone", v)} placeholder="+359 888 123 456" mono />
          <TextField label="Имейл" value={client.email} onChange={(v) => set("email", v)} type="email" />
          {client.kind === "фирма" && <TextField label="ЕИК / ДДС номер" value={client.eik} onChange={(v) => set("eik", v)} mono />}
          <TextField label="Адрес" value={client.address} onChange={(v) => set("address", v)} />
          <TextField label="Отстъпка (%)" value={client.discountPercent} type="number" onChange={(v) => set("discountPercent", Math.max(0, Math.min(100, Number(v) || 0)))} />
        </div>
        <div className="row" style={{ gap: 24 }}>
          <label className="check"><input type="checkbox" checked={client.viber} onChange={(e) => set("viber", e.target.checked)} />Предпочита Viber</label>
          <label className="check">
            <input type="checkbox" checked={!!client.gdprConsent} onChange={(e) => set("gdprConsent", e.target.checked ? client.gdprConsent ?? todayIso() : null)} />
            Подписано съгласие за обработка на лични данни
          </label>
          {client.gdprConsent && (
            <input className="input" type="date" style={{ width: 170 }} value={client.gdprConsent} onChange={(e) => set("gdprConsent", e.target.value || null)} aria-label="Дата на съгласието" />
          )}
        </div>
        <label className="field">
          Бележки
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Предпочитания, особености…" />
        </label>
      </section>
    </form>
  );
}
