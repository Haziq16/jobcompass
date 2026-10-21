"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
type Config = {
  provider: "openai" | "google" | "anthropic" | "openrouter";
  model: string;
  apiKey: string;
};
const Context = createContext<{
  enabled: boolean;
  config: Config;
  setConfig: (config: Config) => void;
  forget: () => void;
}>({
  enabled: false,
  config: { provider: "openai", model: "", apiKey: "" },
  setConfig: () => {},
  forget: () => {},
});
export function PersonalAiContext({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [config, setConfig] = useState<Config>({
    provider: "openai",
    model: "",
    apiKey: "",
  });
  // No localStorage, sessionStorage, cookies or persistence of API keys.
  return (
    <Context.Provider
      value={{
        enabled,
        config,
        setConfig,
        forget: () => setConfig((current) => ({ ...current, apiKey: "" })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePersonalAi() {
  return useContext(Context);
}
