import { createContext, ReactNode, useContext } from "react";
import { Features, resolveFeatures } from "../lib/features";

const Ctx = createContext<Features>(resolveFeatures({}));

export function FeaturesProvider({ value, children }: { value: Record<string, boolean> | undefined; children: ReactNode }) {
  return <Ctx.Provider value={resolveFeatures(value)}>{children}</Ctx.Provider>;
}

export function useFeatures() {
  return useContext(Ctx);
}
