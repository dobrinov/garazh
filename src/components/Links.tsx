import { api, Car, UsefulLink } from "../api";
import { Icon, useToast } from "./ui";
import { errorMessage } from "../api";

export function LinksCard({ links, car, onCopy }: { links: UsefulLink[]; car: Car; onCopy: (text: string, what: string) => void }) {
  const toast = useToast();
  async function open(l: UsefulLink) {
    // Sites that cannot take the VIN or plate in the address get it on the
    // clipboard, ready for Ctrl+V in their search box.
    let copied = false;
    if (l.copy) {
      try {
        await navigator.clipboard.writeText(l.copy);
        copied = true;
      } catch {
        /* open anyway */
      }
    }
    try {
      await api.openUrl(l.url);
      if (copied) toast(`${l.copyLabel || "Текстът"} ${l.copy} е копиран – поставете го в сайта с Ctrl+V`);
    } catch (e) {
      toast(errorMessage(e), true);
    }
  }
  return (
    <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="small muted">Полезни връзки{car.make ? ` – ${car.make}` : ""}</div>
        <button className="btn small icon-btn" title="Редактирай връзките" aria-label="Отвори папката с връзки" onClick={() => api.referenceDir("links").then(api.openPath).catch((e) => toast(errorMessage(e), true))}>
          <Icon name="folder" size={14} />
        </button>
      </div>
      {links.length === 0 && <span className="muted small">Няма връзки за тази марка. Добавете ги във файл в папка „справочници\марки“.</span>}
      {links.map((l, i) => (
        <button key={i} className="link-row" onClick={() => open(l)} title={l.copy ? `${l.url}\nКопира ${l.copyLabel}: ${l.copy}` : l.url}>
          <Icon name="link" size={15} />
          <span>
            <span className="link-name">{l.name}</span>
            {(l.note || l.copy) && (
              <span className="small muted" style={{ display: "block" }}>
                {l.note}
                {l.copy && <span className="link-copy">{l.note ? " · " : ""}копира {l.copyLabel === "VIN" ? "VIN" : l.copyLabel.toLowerCase()}</span>}
              </span>
            )}
          </span>
        </button>
      ))}
      {(car.vin || car.engineCode) && (
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          {car.vin && <button className="btn small" onClick={() => onCopy(car.vin, "VIN")}><Icon name="copy" size={14} />VIN</button>}
          {car.engineCode && <button className="btn small" onClick={() => onCopy(car.engineCode, "Кодът на двигателя")}><Icon name="copy" size={14} />{car.engineCode}</button>}
        </div>
      )}
    </div>
  );
}
