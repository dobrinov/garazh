import { NavLink, Outlet } from "react-router-dom";
import { BrandMark, useBrand } from "./brand";
import { useFeatures } from "./features";
import { UpdateBanner } from "./updates";
import { Icon } from "./ui";

const NAV = [
  { to: "/", label: "Табло", icon: "dashboard", end: true },
  { to: "/clients", label: "Клиенти", icon: "clients" },
  { to: "/cars", label: "Автомобили", icon: "car" },
  { to: "/orders", label: "Работни карти", icon: "order" },
  { to: "/quotes", label: "Оферти и доклади", icon: "quote", feature: "quotes" as const },
];

export function Layout() {
  const features = useFeatures();
  const brand = useBrand();
  const shopName = brand.name;
  return (
    <div className="app">
      <nav className="side" aria-label="Основна навигация">
        <div className="brand">
          {brand.logo ? (
            <BrandMark logo={brand.logo} />
          ) : (
            <div className="brand-mark">
              <Icon name="wrench" color="#fff" size={20} />
            </div>
          )}
          <div>
            <div className="brand-name">{shopName || "Гараж"}</div>
            <div className="brand-sub">{shopName ? "Гараж" : "Управление на автосервиз"}</div>
          </div>
        </div>
        {NAV.filter((n) => !("feature" in n) || !n.feature || features[n.feature]).map((n) => (
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
        <UpdateBanner />
        <Outlet />
      </main>
    </div>
  );
}
