"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./client";
type Config = {
  provider: "openai" | "google" | "anthropic" | "openrouter";
  model: string;
  apiKey: string;
  saved?: boolean;
};
const Context = createContext<{
  enabled: boolean;
  config: Config;
  setConfig: (config: Config) => void;
  forget: () => Promise<void>;
  loading: boolean;
}>({
  enabled: false,
  config: { provider: "openai", model: "", apiKey: "" },
  setConfig: () => {},
  forget: async () => {},
  loading: false,
});
export function PersonalAiContext({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [config, updateConfig] = useState<Config>({
    provider: "openai",
    model: "",
    apiKey: "",
  });
  const [loading, setLoading] = useState(enabled);
  const edited = useRef(false);
  useEffect(() => {
    let current = true;
    if (!enabled) return;
    api<{
      connection: {
        provider: Config["provider"];
        model: string;
        saved: boolean;
      } | null;
    }>("ai/connection")
      .then(({ connection }) => {
        if (current && !edited.current && connection)
          updateConfig({ ...connection, apiKey: "" });
      })
      .catch(() => {
        /* A manual connection remains available. */
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [enabled]);
  // The browser only receives connection metadata, never a saved API key.
  return (
    <Context.Provider
      value={{
        enabled,
        config,
        loading,
        setConfig: (value) => {
          edited.current = true;
          updateConfig(value);
        },
        forget: async () => {
          await api("ai/connection", "DELETE");
          edited.current = true;
          updateConfig((current) => ({ ...current, apiKey: "", saved: false }));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePersonalAi() {
  return useContext(Context);
}
