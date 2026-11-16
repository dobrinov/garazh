// The shared header of "Клиенти и коли": the same people and cars, listed by
// client (/clients) or by car (/cars).
import { Link, NavLink } from "react-router-dom";
import { Icon } from "./ui";

export function DirectoryHead({ sub }: { sub: string }) {
  return (
    <div className="page-head">
      <div>
        <h1>Клиенти и коли</h1>
        <div className="muted">{sub}</div>
      </div>
      <div className="row">
        <div className="seg" role="group" aria-label="Подреди по">
          <NavLink to="/clients" end aria-current={undefined} className={({ isActive }) => (isActive ? "on" : "")}>По клиенти</NavLink>
          <NavLink to="/cars" end className={({ isActive }) => (isActive ? "on" : "")}>По коли</NavLink>
        </div>
        <Link className="btn primary" to="/clients/new"><Icon name="plus" />Нов клиент</Link>
      </div>
    </div>
  );
}
