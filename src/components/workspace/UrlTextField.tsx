"use client";
import { useEffect, useState } from "react";
export default function UrlTextField({
  label,
  value,
  onCommit,
  placeholder,
  maxLength,
  type = "text",
  actionLabel = "Update",
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: "text" | "number";
  actionLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <form
      className="url-field"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(draft);
      }}
    >
      <label>
        {label}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          type={type}
          min={type === "number" ? 0 : undefined}
        />
      </label>
      <button aria-label={`${actionLabel} ${label}`}>{actionLabel}</button>
    </form>
  );
}
