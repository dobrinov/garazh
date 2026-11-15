import { api, Car, UsefulLink } from "../api";
import { Icon, useToast } from "./ui";
import { errorMessage } from "../api";

export function LinksCard({ links, car, onCopy }: { links: UsefulLink[]; car: Car; onCopy: (text: string, what: string) => void }) {
  const toast = useToast();
  const open = (url: string) => api.openUrl(url).catch((e) => toast(errorMessage(e), true));
  const files = [...new Set(links.map((l) => l.file))];
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
        <button key={i} className="link-row" onClick={() => open(l.url)} title={l.url}>
          <Icon name="link" size={15} />
          <span>
            <span className="link-name">{l.name}</span>
            {l.note && <span className="small muted" style={{ display: "block" }}>{l.note}</span>}
          </span>
        </button>
      ))}
      {(car.vin || car.engineCode) && (
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          {car.vin && <button className="btn small" onClick={() => onCopy(car.vin, "VIN")}><Icon name="copy" size={14} />VIN</button>}
          {car.engineCode && <button className="btn small" onClick={() => onCopy(car.engineCode, "Кодът на двигателя")}><Icon name="copy" size={14} />{car.engineCode}</button>}
        </div>
      )}
      {files.length > 0 && <span className="small muted">Копирайте VIN и го поставете в каталога.</span>}
    </div>
  );
}
