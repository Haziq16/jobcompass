"use client";
import { useEffect, useRef, useState } from "react";
export function DocxPreview({
  url,
  title = "Word document preview",
}: {
  url: string;
  title?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const abort = new AbortController();
    setHtml("");
    setError("");
    void (async () => {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) throw new Error("preview_failed");
        const bytes = await response.arrayBuffer();
        const { renderAsync } = await import("docx-preview");
        const body = document.createElement("div"),
          styles = document.createElement("div");
        await renderAsync(bytes, body, styles, {
          useBase64URL: true,
          renderAltChunks: false,
          renderChanges: false,
          renderComments: false,
          ignoreLastRenderedPageBreak: true,
        });
        for (const root of [body, styles]) {
          root
            .querySelectorAll("script,iframe,object,embed,form,link,meta")
            .forEach((n) => n.remove());
          root.querySelectorAll("*").forEach((node) => {
            for (const attr of [...node.attributes])
              if (
                /^on/i.test(attr.name) ||
                ["href", "srcset", "action"].includes(attr.name) ||
                (attr.name === "src" && !attr.value.startsWith("data:"))
              )
                node.removeAttribute(attr.name);
          });
        }
        const zoom = Math.min(
          1,
          Math.max(0.3, ((host.current?.clientWidth || 820) - 24) / 820),
        );
        if (current)
          setHtml(
            `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0;background:#e9edf0}.docx-wrapper{padding:16px!important;zoom:${zoom}}section.docx{margin-bottom:16px!important}a{pointer-events:none}</style>${styles.innerHTML}</head><body>${body.innerHTML}</body></html>`,
          );
      } catch {
        if (current)
          setError(
            "The browser preview could not be rendered. Your Word file is still available to download and open in Word.",
          );
      }
    })();
    return () => {
      current = false;
      abort.abort();
    };
  }, [url]);
  return (
    <div ref={host} className="docx-preview-shell">
      {error ? (
        <p role="alert">{error}</p>
      ) : html ? (
        <iframe
          sandbox=""
          referrerPolicy="no-referrer"
          title={title}
          srcDoc={html}
        />
      ) : (
        <p role="status">Rendering your original Word layout…</p>
      )}
      <p className="ai-fine-print">
        Browser preview. Check final page breaks in Word; different fonts and
        longer wording can change pagination.
      </p>
    </div>
  );
}
