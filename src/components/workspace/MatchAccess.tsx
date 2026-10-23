"use client";
import { createContext, useContext, type ReactNode } from "react";
const Context = createContext(false);
export function MatchAccess({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <Context.Provider value={enabled}>{children}</Context.Provider>;
}
export function useMatchAccess() {
  return useContext(Context);
}
