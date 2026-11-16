import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { api, AppConfig, errorMessage } from "./api";
import { Layout } from "./components/Layout";
import { BrandProvider } from "./components/brand";
import { FeaturesProvider } from "./components/features";
import { UpdatesProvider } from "./components/updates";
import { ToastProvider } from "./components/ui";
import { CarEdit } from "./pages/CarEdit";
import { CarPage } from "./pages/CarPage";
import { Cars } from "./pages/Cars";
import { ClientEdit } from "./pages/ClientEdit";
import { ClientPage } from "./pages/ClientPage";
import { Clients } from "./pages/Clients";
import { Dashboard } from "./pages/Dashboard";
import { Orders } from "./pages/Orders";
import { QuotePage } from "./pages/QuotePage";
import { Quotes } from "./pages/Quotes";
import { Settings } from "./pages/Settings";
import { Setup } from "./pages/Setup";
import { WorkOrderPage } from "./pages/WorkOrderPage";

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.appConfig().then(setConfig).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (config?.dataDir) {
      api
        .getShop()
        .then((s) => setFeatures(s.data.features))
        .catch(() => setFeatures(undefined));
    }
  }, [config?.dataDir]);

  if (error) return <div className="page"><div className="note bad">{error}</div></div>;
  if (!config) return <div className="page muted">Зареждане…</div>;

  return (
    <ToastProvider>
      <UpdatesProvider auto={!config.noAutoUpdate} backupConfigured={!!config.backupDir}>
      <BrandProvider enabled={!!config.dataDir}>
      {!config.dataDir ? (
        <Setup onDone={setConfig} missingDir={config.missingDataDir ?? null} />
      ) : (
        <FeaturesProvider value={features}>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
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
              <Route path="quotes" element={<Quotes />} />
              <Route path="quotes/new" element={<QuotePage />} />
              <Route path="quotes/:id" element={<QuotePage />} />
              <Route
                path="settings"
                element={<Settings config={config} onConfig={setConfig} onFeatures={setFeatures} />}
              />
            </Route>
          </Routes>
        </HashRouter>
        </FeaturesProvider>
      )}
      </BrandProvider>
      </UpdatesProvider>
    </ToastProvider>
  );
}
