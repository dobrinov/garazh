import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api";
import { isPresetLogo } from "../lib/logos";

interface Brand {
  name: string;
  /** data: URL of the shop logo, or null. */
  logo: string | null;
  refresh: () => void;
}

const Ctx = createContext<Brand>({ name: "", logo: null, refresh: () => {} });

/** The shop's name and logo, for the sidebar and printed documents. */
export function BrandProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const refresh = useCallback(() => {
    api.getShop().then((s) => setName(s.data.name)).catch(() => setName(""));
    api.getLogo().then(setLogo).catch(() => setLogo(null));
  }, []);
  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);
  return <Ctx.Provider value={{ name, logo, refresh }}>{children}</Ctx.Provider>;
}

export function useBrand() {
  return useContext(Ctx);
}

export function BrandMark({ logo, size = 36 }: { logo: string | null; size?: number }) {
  // Built-in logos are tiles already; uploaded ones sit on a white tile so
  // any shape or colour stays visible on the dark side menu.
  if (logo) return <img className={`brand-logo ${isPresetLogo(logo) ? "preset" : "uploaded"}`} src={logo} alt="" width={size} height={size} />;
  return null;
}
