import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api, NavCounts } from "../api";
import { BrandMark, useBrand } from "./brand";
import { useFeatures } from "./features";
import { SearchProvider, useSearch } from "./Search";
import { UpdateBanner, UpdatedNotice } from "./updates";
import { Icon } from "./ui";

export function Layout() {
  return (
    <SearchProvider>
      <div className="app">
        <Side />
        <main className="main">
          <UpdateBanner />
          <UpdatedNotice />
          <Outlet />
        </main>
      </div>
    </SearchProvider>
  );
}

/** Counts for the menu, read again after a change, on navigation and on focus. */
function useNavCounts(): NavCounts | null {
  const [counts, setCounts] = useState<NavCounts | null>(null);
  const { pathname } = useLocation();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("garazh:changed", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("garazh:changed", bump);
    };
  }, []);
  useEffect(() => {
    api.navCounts().then(setCounts).catch(() => setCounts(null));
  }, [pathname, tick]);
  return counts;
}

function Side() {
  const features = useFeatures();
  const brand = useBrand();
  const search = useSearch();
  const counts = useNavCounts();
  const { pathname } = useLocation();
  const shopName = brand.name;
  // Quotes and reports open from the work orders; cars from the directory.
  const ordersActive = /^\/(orders|quotes)/.test(pathname);
  const dirActive = /^\/(clients|cars)/.test(pathname);
  const reportsActive = /^\/(reports|time)/.test(pathname);
  return (
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

      <button type="button" className="side-search" onClick={() => search("search")} aria-label="Търси кола, клиент или документ (Ctrl K)">
        <Icon name="search" />
        <span className="grow">Търси…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <button type="button" className="side-intake" onClick={() => search("intake")}>
        <Icon name="plus" width={2.4} />
        Приеми кола
      </button>

      <NavLink to="/" end>
        <Icon name="home" />
        Днес
        {!!counts?.ready && <span className="count ok" title="Готови за предаване">{counts.ready}</span>}
      </NavLink>
      <NavLink to="/orders" className={ordersActive ? "active" : undefined}>
        <Icon name="order" />
        Работни карти
        {!!counts && counts.inShop + counts.expected > 0 && (
          <span className="count" title={`${counts.inShop} в сервиза, ${counts.expected} очаквани`}>{counts.inShop}{counts.expected ? `+${counts.expected}` : ""}</span>
        )}
      </NavLink>
      <NavLink to="/clients" className={dirActive ? "active" : undefined}>
        <Icon name="car" />
        Клиенти и коли
      </NavLink>

      <div className="side-section">Сервизът</div>
      {features.stock && (
        <NavLink to="/stock">
          <Icon name="box" />
          Склад
          {!!counts?.lowStock && <span className="count warn" title="Под минимума">{counts.lowStock}</span>}
        </NavLink>
      )}
      <NavLink to="/reports" className={reportsActive ? "active" : undefined}>
        <Icon name="chart" />
        Отчети
      </NavLink>
      <div className="spacer" />
      <NavLink to="/settings">
        <Icon name="settings" />
        Настройки
      </NavLink>
    </nav>
  );
}
