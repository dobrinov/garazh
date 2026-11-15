import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { api, AppConfig, errorMessage } from "./api";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ui";
import { CarEdit } from "./pages/CarEdit";
import { CarPage } from "./pages/CarPage";
import { Cars } from "./pages/Cars";
import { ClientEdit } from "./pages/ClientEdit";
import { ClientPage } from "./pages/ClientPage";
import { Clients } from "./pages/Clients";
import { Dashboard } from "./pages/Dashboard";
import { Orders } from "./pages/Orders";
import { Settings } from "./pages/Settings";
import { Setup } from "./pages/Setup";
import { WorkOrderPage } from "./pages/WorkOrderPage";

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [shopName, setShopName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.appConfig().then(setConfig).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (config?.dataDir) {
      api.getShop().then((s) => setShopName(s.data.name)).catch(() => setShopName(""));
    }
  }, [config?.dataDir]);

  if (error) return <div className="page"><div className="note bad">{error}</div></div>;
  if (!config) return <div className="page muted">Зареждане…</div>;

  return (
    <ToastProvider>
      {!config.dataDir ? (
        <Setup onDone={setConfig} />
      ) : (
        <HashRouter>
          <Routes>
            <Route element={<Layout shopName={shopName} />}>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/new" element={<ClientEdit />} />
              <Route path="clients/:id" element={<ClientPage />} />
              <Route path="clients/:id/edit" element={<ClientEdit />} />
              <Route path="cars" element={<Cars />} />
              <Route path="cars/new" element={<CarEdit />} />
              <Route path="cars/:id" element={<CarPage />} />
              <Route path="cars/:id/edit" element={<CarEdit />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/new" element={<WorkOrderPage />} />
              <Route path="orders/:id" element={<WorkOrderPage />} />
              <Route
                path="settings"
                element={<Settings config={config} onConfig={setConfig} onShopName={setShopName} />}
              />
            </Route>
          </Routes>
        </HashRouter>
      )}
    </ToastProvider>
  );
}
