import { useCallback, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, AppConfig, errorMessage } from "./api";
import { Layout } from "./components/Layout";
import { BrandProvider } from "./components/brand";
import { ShopReloadCtx } from "./components/Business";
import { FeaturesProvider } from "./components/features";
import { UpdatesProvider } from "./components/updates";
import { setStageConfig } from "./lib/format";
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
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Setup } from "./pages/Setup";
import { Stock } from "./pages/Stock";
import { WorkOrderPage } from "./pages/WorkOrderPage";

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the stage names change, so every screen shows the new ones.
  const [, setStagesVersion] = useState(0);

  useEffect(() => {
    api.appConfig().then(setConfig).catch((e) => setError(errorMessage(e)));
  }, []);

  const reloadShop = useCallback(async () => {
    try {
      const s = await api.getShop();
      setStageConfig(s.data.stageNames, s.data.hiddenStages);
      setFeatures(s.data.features);
      setStagesVersion((v) => v + 1);
    } catch {
      setFeatures(undefined);
    }
  }, []);

  useEffect(() => {
    if (config?.dataDir) reloadShop();
  }, [config?.dataDir, reloadShop]);

  if (error) return <div className="page"><div className="note bad">{error}</div></div>;
  if (!config) return <div className="page muted">Зареждане…</div>;

  return (
    <ToastProvider>
      <UpdatesProvider auto={!config.noAutoUpdate} backupConfigured={!!config.backupDir}>
      <BrandProvider enabled={!!config.dataDir}>
      {!config.dataDir ? (
        <Setup onDone={setConfig} missingDir={config.missingDataDir ?? null} />
      ) : (
        <ShopReloadCtx.Provider value={reloadShop}>
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
              {/* Older links: the lists moved into Работни карти and Отчети. */}
              <Route path="quotes" element={<Navigate to="/orders?tab=quotes" replace />} />
              <Route path="quotes/new" element={<QuotePage />} />
              <Route path="quotes/:id" element={<QuotePage />} />
              <Route path="time" element={<Navigate to="/reports?tab=time" replace />} />
              <Route path="reports" element={<Reports />} />
              <Route path="stock" element={<Stock />} />
              <Route
                path="settings"
                element={<Settings config={config} onConfig={setConfig} onFeatures={setFeatures} onStages={(names, hidden) => { setStageConfig(names, hidden); setStagesVersion((v) => v + 1); }} />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
        </FeaturesProvider>
        </ShopReloadCtx.Provider>
      )}
      </BrandProvider>
      </UpdatesProvider>
    </ToastProvider>
  );
}
