"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "./client";

const messages: Record<string, string> = {
  board_not_found:
    "Board not found. Use the board token from the company's Greenhouse or Lever careers URL.",
  direct_rate_limit:
    "Public-board request limit reached. Wait at least 10 seconds between imports; the local limit is 50 attempts per 24 hours. No automatic retry was made.",
  direct_provider_error:
    "The public board could not be reached. No automatic retry was made.",
  malformed_response:
    "The board returned an unsupported response. No jobs were imported.",
  narrow_direct_search:
    "More than 500 jobs matched. Add keywords to narrow this import.",
  board_too_large:
    "This board exceeds the import size limit. Try a smaller board.",
};
export default function DirectDiscovery() {
  const [platform, setPlatform] = useState("greenhouse");
  const [board, setBoard] = useState("");
  const [region, setRegion] = useState("global");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const key = useRef<{ input: string; value: string } | null>(null);
  async function run(refresh: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    const input = {
      platform,
      board: board.trim().toLowerCase(),
      region: platform === "greenhouse" ? "global" : region,
      query: query.trim(),
    };
    const serialized = JSON.stringify(input);
    if (refresh || key.current?.input !== serialized)
      key.current = { input: serialized, value: crypto.randomUUID() };
    try {
      const result = await api<{
        pending?: boolean;
        cached?: boolean;
        count: number | null;
      }>("direct-discovery", "POST", {
        input,
        key: key.current!.value,
        refresh,
      });
      setNotice(
        result.pending
          ? "This import is already running. Check stored jobs shortly; no second request was sent."
          : `${result.count ?? 0} matching jobs ${result.cached ? "available from cache" : "imported from the public board"}. Open Jobs to browse them. JSearch units used: 0.`,
      );
    } catch (e) {
      setError(messages[(e as Error).message] || (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="direct-discovery" aria-labelledby="direct-heading">
      <p className="eyebrow">FIND YOUR NEXT OPPORTUNITY</p>
      <h1 id="direct-heading">Discover jobs</h1>
      <p>
        Search a company's public careers board, then keep the opportunities
        that fit. No API key needed.
      </p>
      <div className="discovery-intro">
        <div>
          <span className="step-dot">1</span>
          <strong>Choose a company</strong>
          <p>Use a Greenhouse or Lever board token.</p>
        </div>
        <div>
          <span className="step-dot">2</span>
          <strong>Find relevant roles</strong>
          <p>Add keywords to narrow the results.</p>
        </div>
        <div>
          <span className="step-dot">3</span>
          <strong>Make your shortlist</strong>
          <p>Save jobs and track your applications.</p>
        </div>
      </div>
      <div className="starter-boards">
        <span>Try a board</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPlatform("greenhouse");
            setBoard("greenhouse");
            setRegion("global");
          }}
        >
          Greenhouse <span>↗</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPlatform("lever");
            setBoard("spotify");
            setRegion("global");
          }}
        >
          Spotify <span>↗</span>
        </button>
        <small>Selecting a board doesn't fetch jobs.</small>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(false);
        }}
      >
        <div className="direct-fields">
          <label>
            Job board platform
            <select
              value={platform}
              disabled={busy}
              onChange={(e) => {
                setPlatform(e.target.value);
                key.current = null;
              }}
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
            </select>
          </label>
          <label>
            Company board token
            <input
              required
              pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}"
              maxLength={80}
              value={board}
              disabled={busy}
              onChange={(e) => setBoard(e.target.value)}
              placeholder="Company board token"
              aria-describedby="board-help"
            />
          </label>
          {platform === "lever" && (
            <label>
              Lever hosting region
              <select
                value={region}
                disabled={busy}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="global">Global</option>
                <option value="eu">EU</option>
              </select>
            </label>
          )}
          <label>
            Keywords (optional)
            <input
              maxLength={120}
              value={query}
              disabled={busy}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. engineer Singapore"
            />
          </label>
        </div>
        <p id="board-help" className="muted">
          For job-boards.greenhouse.io/company or jobs.lever.co/company, enter
          company. All keywords must appear in the title, location or
          description. Salary, country and posting dates remain unknown when
          absent; the employer is displayed using the board token.
        </p>
        <div className="direct-actions">
          <button className="primary" disabled={busy}>
            {busy ? "Searching…" : "Find jobs"}
          </button>
          <button
            type="button"
            disabled={busy || !board.trim()}
            onClick={() => void run(true)}
          >
            Refresh board
          </button>
          <Link href="/jobs">Browse stored jobs →</Link>
        </div>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        Searches cover the selected company board. Imported jobs stay in your
        private workspace. Refresh checks the board again; missing results never
        delete your saved jobs.
      </p>
    </section>
  );
}
