// Database error classification that is safe to log: codes only, never
// messages, queries or row data.
/** Postgres/Neon "out of space" errors, recognised by code or fixed message text. */
export function isStorageFull(error: unknown) {
  const e = error as {
    code?: string;
    message?: string;
    meta?: { code?: string; message?: string };
  };
  const text = `${e?.message || ""} ${e?.meta?.message || ""}`;
  return (
    e?.code === "53100" ||
    e?.meta?.code === "53100" ||
    /could not extend file|project size limit|disk full|No space left on device/i.test(
      text,
    )
  );
}
/** Safe-to-log error identifier: a code only, never messages or data. */
export function errorCode(error: unknown) {
  const e = error as { code?: string; meta?: { code?: string }; name?: string };
  if (isStorageFull(error)) return "database_storage_full";
  return (
    [e?.code, e?.meta?.code].filter(Boolean).join(":") || e?.name || "unknown"
  );
}
