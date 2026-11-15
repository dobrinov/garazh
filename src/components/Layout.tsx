import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "./ui";

const NAV = [
  { to: "/", label: "Табло", icon: "dashboard", end: true },
  { to: "/clients", label: "Клиенти", icon: "clients" },
  { to: "/cars", label: "Автомобили", icon: "car" },
  { to: "/orders", label: "Работни карти", icon: "order" },
];

export function Layout({ shopName }: { shopName: string }) {
  return (
    <div className="app">
      <nav className="side" aria-label="Основна навигация">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="wrench" color="#fff" size={20} />
          </div>
          <div>
            <div className="brand-name">{shopName || "Автосервиз"}</div>
            <div className="brand-sub">Управление на автосервиз</div>
          </div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <NavLink to="/settings">
          <Icon name="settings" />
          Настройки
        </NavLink>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
