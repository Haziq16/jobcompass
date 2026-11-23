"use client";
import { useCallback, useEffect, useState } from "react";
const messages: Record<string, string> = {
  ai_daily_limit:
    "AI daily generation limit reached. Existing drafts remain available.",
  revision_conflict:
    "This draft changed in another tab. Reload before editing or approving.",
  unsupported_form: "This form is not supported by the companion.",
};
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      messages[result.error] ||
        result.message ||
        result.error ||
        "Request failed",
    );
  return result;
}
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((d) => {
        if (current) setData(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path, version]);
  return { data, error, loading, refresh };
}
