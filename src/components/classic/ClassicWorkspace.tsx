"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Compass,
  Search,
  Bookmark,
  BriefcaseBusiness,
  SlidersHorizontal,
  ArrowUpRight,
  MapPin,
  ArrowRight,
  Plus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  X,
  RefreshCw,
  ShieldCheck,
  Clock,
  Link2,
  EyeOff,
  FileText,
  Download,
  Upload,
  Leaf,
  LayoutGrid,
  List,
  Settings2,
  AlertCircle,
  LoaderCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { statuses, type ProviderSearchInput } from "@/lib/contracts";
import { SignOut, ChangePassword } from "../AccountControls";
import {
  type Profile,
  type AppData,
  type Job,
  type Usage,
  type Run,
  type SearchDef,
  initialProfile,
  initialInput,
  countries,
  errors,
  api,
  date,
  salary,
  IconButton,
  demoJobs,
} from "./common";
import Fields from "./Fields";
import JobDetail from "./JobDetail";
import BudgetForm from "./BudgetForm";

export default function Workspace({
  hosted = false,
  initialView = "Discover",
}: {
  hosted?: boolean;
  initialView?: string;
}) {
  const [view, setView] = useState(initialView);
  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const loadVersion = useRef(0);
  const [demo, setDemo] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [searches, setSearches] = useState<SearchDef[]>([]);
  const [recent, setRecent] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [input, setInput] = useState(initialInput);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState(false);
  const [min, setMin] = useState("0");
  const [country, setCountry] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("recent");
  const [hidden, setHidden] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [board, setBoard] = useState(true);
  const [showRecent, setShowRecent] = useState(false);
  const [aliasText, setAliasText] = useState("{}");
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 6000);
  };
  const loadMeta = useCallback(async () => {
    const results = await Promise.allSettled([
      api<Usage>("usage"),
      api<Profile>("profile"),
      api<{ saved: SearchDef[]; recent: Run[] }>("searches"),
    ]);
    if (results[0].status === "fulfilled") setUsage(results[0].value);
    if (results[1].status === "fulfilled") {
      const {
        skills,
        titles,
        locations,
        excluded,
        years,
        arrangement,
        cvText,
        aliases,
      } = results[1].value;
      setProfile({
        skills,
        titles,
        locations,
        excluded,
        years,
        arrangement,
        cvText,
        aliases,
      });
      setAliasText(JSON.stringify(results[1].value.aliases || {}, null, 2));
    }
    if (results[2].status === "fulfilled") {
      setSearches(results[2].value.saved);
      setRecent(results[2].value.recent);
    }
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") setError(failed.reason.message);
  }, []);
  useEffect(() => {
    const theme = localStorage.getItem("jobcompass-theme");
    setDark(theme === "dark");
    setThemeReady(true);
    void loadMeta();
  }, [loadMeta]);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("jobcompass-theme", dark ? "dark" : "light");
  }, [dark, themeReady]);
  const loadJobs = useCallback(async () => {
    if (demo) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        sort,
        page: String(page),
        hidden: String(hidden),
        min,
      });
      if (view === "Saved" && !hidden) params.set("saved", "true");
      if (view === "Applications") params.set("tracked", "true");
      if (remote) params.set("remote", "true");
      if (country) params.set("country", country);
      if (source) params.set("source", source);
      if (status) params.set("status", status);
      if (run && view === "Discover") params.set("run", run.id);
      const data = await api<{ jobs: Job[]; total: number; pages: number }>(
        "jobs?" + params,
      );
      if (version !== loadVersion.current) return;
      setJobs(data.jobs);
      setTotal(data.total);
      setPages(data.pages);
      setSelected((prev) =>
        prev ? data.jobs.find((j) => j.id === prev.id) || null : null,
      );
    } catch (e) {
      if (version === loadVersion.current) setError((e as Error).message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [
    demo,
    q,
    sort,
    page,
    hidden,
    min,
    view,
    remote,
    country,
    source,
    status,
    run,
  ]);
  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);
  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [view, q, hidden, remote, min, country, source, status]);
  const action = async (work: () => Promise<unknown>, message?: string) => {
    setError("");
    try {
      await work();
      if (message) notify(message);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function fetchJobs(next = false, refresh = false) {
    if (demo) {
      notify("Exit demo to connect JSearch and fetch real listings.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        run?: Run;
        cached?: boolean;
        pending?: boolean;
      }>("discovery/search", "POST", {
        input: { ...input, cursor: next ? run?.nextCursor : undefined },
        key: crypto.randomUUID(),
        refresh,
      });
      if (result.pending) {
        notify(
          "This search is already running in another tab. Use Recent searches once it finishes.",
        );
      } else if (result.run) {
        setRun(result.run);
        setPage(1);
        notify(
          result.cached
            ? "Loaded from your cache. No API credit used."
            : "New jobs added to your workspace.",
        );
      }
      await loadMeta();
    } catch (e) {
      setError((e as Error).message);
      await loadMeta();
    } finally {
      setBusy(false);
    }
  }
  async function updateJob(
    job: Job,
    data: {
      saved?: boolean;
      hidden?: boolean;
      notes?: string;
      tags?: string[];
    },
  ) {
    if (demo) {
      setJobs((current) =>
        current.map((j) =>
          j.id === job.id
            ? {
                ...j,
                hidden: data.hidden ?? j.hidden,
                saved:
                  data.saved === false
                    ? null
                    : data.saved || data.notes !== undefined || data.tags
                      ? {
                          notes: data.notes ?? j.saved?.notes ?? "",
                          tags: data.tags ?? j.saved?.tags ?? [],
                        }
                      : j.saved,
              }
            : j,
        ),
      );
      setSelected((prev) =>
        prev?.id === job.id
          ? {
              ...prev,
              hidden: data.hidden ?? prev.hidden,
              saved:
                data.saved === false
                  ? null
                  : {
                      notes: data.notes ?? prev.saved?.notes ?? "",
                      tags: data.tags ?? prev.saved?.tags ?? [],
                    },
            }
          : prev,
      );
      return;
    }
    await api("jobs/" + job.id, "PATCH", data);
    await loadJobs();
  }
  const activeJobs = demo
    ? jobs
        .filter(
          (j) =>
            j.hidden === hidden &&
            (view !== "Saved" || hidden || j.saved) &&
            (view !== "Applications" || j.application) &&
            (!remote || j.remote) &&
            (j.match.score ?? 0) >= Number(min) &&
            (!country || j.country === country) &&
            (!source ||
              j.sources.some((s) =>
                s.publisher?.toLowerCase().includes(source.toLowerCase()),
              )) &&
            (!status || j.application?.status === status) &&
            `${j.title} ${j.employer} ${j.saved?.notes || ""} ${j.saved?.tags.join(" ") || ""}`
              .toLowerCase()
              .includes(q.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "match" ? (b.match.score ?? 0) - (a.match.score ?? 0) : 0,
        )
    : jobs;
  function enterDemo() {
    loadVersion.current++;
    setDemo(true);
    setJobs(demoJobs());
    setSelected(null);
    setError("");
    setLoading(false);
    setView("Discover");
    setRun(null);
  }
  function exitDemo() {
    setDemo(false);
    setSelected(null);
    setJobs([]);
    void loadMeta();
  }
  function chooseView(next: string) {
    if (demo && next === "Profile & Settings") {
      notify("Exit demo to edit your private profile and budget settings.");
      return;
    }
    setView(next);
    setHidden(false);
    setRun(null);
    setQ("");
    setCountry("");
    setSource("");
    setStatus("");
    setMin("0");
    setRemote(false);
  }
  async function saveSearch() {
    const name = window.prompt("Name this saved search", input.query);
    if (!name) return;
    if (demo) {
      notify("Exit demo to save a search to your workspace.");
      return;
    }
    await action(async () => {
      await api("searches", "POST", {
        name,
        input: { ...input, cursor: undefined },
      });
      await loadMeta();
    }, "Search saved. No API request made.");
  }
  async function saveApplication(job: Job, data: Omit<AppData, "events">) {
    if (demo) {
      const app = {
        ...data,
        events: [
          {
            id: crypto.randomUUID(),
            status: data.status,
            createdAt: new Date().toISOString(),
          },
          ...(job.application?.events || []),
        ],
      };
      setJobs((current) =>
        current.map((j) => (j.id === job.id ? { ...j, application: app } : j)),
      );
      setSelected((prev) =>
        prev?.id === job.id ? { ...prev, application: app } : prev,
      );
      return;
    }
    await api("applications/" + job.id, "PATCH", data);
    await loadJobs();
  }
  const title =
    view === "Discover"
      ? "Find your next chapter."
      : view === "Saved"
        ? "Good opportunities, kept close."
        : view === "Applications"
          ? "A little progress, every day."
          : "Make this space yours.";
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="JobCompass home">
          <span className="brand-symbol">
            <Compass size={25} />
          </span>
          JobCompass<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { name: "Discover", icon: Search },
            { name: "Saved", icon: Bookmark },
            { name: "Applications", icon: BriefcaseBusiness },
            { name: "Profile & Settings", icon: SlidersHorizontal },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={"nav-item " + (view === name ? "selected" : "")}
              onClick={() => chooseView(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {view === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-lower">
          <div className="sidebar-note">
            <Leaf size={23} />
            <h3>A thoughtful search.</h3>
            <p>
              Fewer tabs. More direction.
              <br />
              Your next step starts here.
            </p>
          </div>
          <div className="privacy">
            <ShieldCheck size={15} />{" "}
            {hosted ? "Private owner workspace" : "Private, local workspace"}
          </div>
          <button
            className="owner"
            onClick={() => chooseView("Profile & Settings")}
          >
            <span className="avatar">Y</span>
            <span>
              Your workspace<small>Personal job search</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span> <strong>{view}</strong>
          </span>
          <div className="topbar-actions">
            {hosted && <SignOut />}
            <span
              className={"connection " + (usage?.connected ? "connected" : "")}
            >
              <i />
              {demo
                ? "Demo workspace"
                : usage?.connected
                  ? "JSearch connected"
                  : "JSearch not connected"}
            </span>
            <IconButton
              label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
            <span className="avatar small">Y</span>
          </div>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "Discover"
                  ? "A NEW OPPORTUNITY STARTS HERE"
                  : "YOUR SEARCH, YOUR PACE"}
              </div>
              <h1>{title}</h1>
              <p>
                {view === "Discover"
                  ? "Find the right roles. Keep the possibilities. Move forward with clarity."
                  : view === "Saved"
                    ? "Your shortlist, with the notes and context that matter to you."
                    : view === "Applications"
                      ? "Keep track of every conversation and every next step."
                      : "Your preferences help bring the right opportunities into focus."}
              </p>
            </div>
            {view === "Discover" && (
              <div className="usage-mini">
                <div>
                  <span className="usage-dot" />
                  Estimated local usage{" "}
                  <span>
                    {demo ? "—" : (usage?.monthly ?? "—")}{" "}
                    <small>/ {usage?.settings.budget ?? 180}</small>
                  </span>
                </div>
                <div className="meter">
                  <span
                    style={{
                      width: `${usage ? Math.min(100, (usage.monthly / usage.settings.budget) * 100) : 0}%`,
                    }}
                  />
                </div>
                <small>
                  {usage
                    ? `${usage.daily} / ${usage.settings.dailyCap} today · ${usage.settings.allowance - usage.settings.budget} credits in reserve`
                    : "Connect your database to view usage"}
                </small>
              </div>
            )}
          </div>
          {demo && (
            <div className="demo-banner">
              <span>
                <strong>Demo mode</strong> Fictional listings. Changes stay in
                this session. No API requests.
              </span>
              <button onClick={exitDemo}>
                Exit demo <X size={15} />
              </button>
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              <AlertCircle size={19} />
              <span>{error}</span>
              <IconButton label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          {view === "Discover" && (
            <>
              <section
                className="discovery-panel"
                aria-label="External discovery"
              >
                <div className="section-top">
                  <span className="section-caption">
                    <Compass size={16} /> DISCOVER SOMETHING NEW
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setShowRecent(!showRecent)}
                  >
                    <Clock size={14} /> Recent searches{" "}
                    <ChevronDown size={14} />
                  </button>
                </div>
                <form
                  className="search-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void fetchJobs();
                  }}
                >
                  <label className="role-field">
                    <Search size={19} />
                    <input
                      aria-label="Role and location query"
                      value={input.query}
                      placeholder="e.g. Android developer in Malaysia"
                      onChange={(e) =>
                        setInput({ ...input, query: e.target.value })
                      }
                    />
                  </label>
                  <label className="country-field">
                    <MapPin size={18} />
                    <select
                      aria-label="Discovery country"
                      value={input.country}
                      onChange={(e) => {
                        const c = countries.find(
                          (c) => c[0] === e.target.value,
                        )!;
                        setInput({
                          ...input,
                          country: c[0],
                          query:
                            input.query.replace(/\s+in\s+.+$/i, "") +
                            " in " +
                            c[1],
                        });
                      }}
                    >
                      {countries.map(([code, name]) => (
                        <option value={code} key={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary fetch"
                    disabled={busy || demo || input.query.trim().length < 3}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Plus size={18} />
                    )}{" "}
                    {busy ? "Fetching jobs…" : "Fetch new jobs"}
                  </button>
                </form>
                <div className="search-bottom">
                  <span>
                    <ShieldCheck size={14} /> Fetching uses 1 API credit.
                    Browsing stored jobs is always free.
                  </span>
                  <button
                    className="text-button"
                    onClick={() => void saveSearch()}
                  >
                    <Bookmark size={14} />
                    Save search
                  </button>
                </div>
                <details className="advanced">
                  <summary>Discovery options</summary>
                  <div className="inline-fields">
                    <label>
                      <input
                        type="checkbox"
                        checked={input.remoteOnly}
                        onChange={(e) =>
                          setInput({ ...input, remoteOnly: e.target.checked })
                        }
                      />{" "}
                      Remote listings only
                    </label>
                    <label>
                      Published{" "}
                      <select
                        value={input.datePosted}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            datePosted: e.target
                              .value as ProviderSearchInput["datePosted"],
                          })
                        }
                      >
                        {[
                          ["all", "Any time"],
                          ["today", "Today"],
                          ["3days", "Past 3 days"],
                          ["week", "Past week"],
                          ["month", "Past month"],
                        ].map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      disabled={busy || demo}
                      onClick={() => void fetchJobs(false, true)}
                    >
                      <RefreshCw size={14} />
                      Explicit refresh · 1 credit
                    </button>
                  </div>
                </details>
              </section>
              <div className="search-shortcuts">
                <span>YOUR SEARCHES</span>
                {!demo && searches.length ? (
                  searches.map((s) => (
                    <div className="shortcut" key={s.id}>
                      <button
                        onClick={() => {
                          setInput(s.input);
                          notify(
                            "Search selected. Click Fetch new jobs when ready.",
                          );
                        }}
                      >
                        {s.name}
                        <ArrowUpRight size={12} />
                      </button>
                      <button
                        aria-label={"Edit search " + s.name}
                        onClick={() => {
                          const name = window.prompt(
                            "Saved search name",
                            s.name,
                          );
                          if (!name) return;
                          const query = window.prompt(
                            "Role and location query",
                            s.input.query,
                          );
                          if (!query) return;
                          void action(async () => {
                            await api("searches/" + s.id, "PATCH", {
                              name,
                              input: { ...s.input, query },
                            });
                            await loadMeta();
                          }, "Saved search updated. No API request made.");
                        }}
                      >
                        <Settings2 size={12} />
                      </button>
                      <button
                        aria-label={"Delete search " + s.name}
                        onClick={() =>
                          void action(async () => {
                            await api("searches/" + s.id, "DELETE");
                            await loadMeta();
                          })
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setInput(initialInput);
                        notify("Android target selected. Fetch when ready.");
                      }}
                    >
                      Android roles <ArrowUpRight size={12} />
                    </button>
                    <button
                      onClick={() => {
                        setInput({
                          ...initialInput,
                          query: "Junior PMO project coordinator in Malaysia",
                        });
                        notify("PMO target selected. Fetch when ready.");
                      }}
                    >
                      Junior PMO / coordinator <ArrowUpRight size={12} />
                    </button>
                    <small>Save a search to make it yours</small>
                  </>
                )}
              </div>
              {showRecent && (
                <div className="recent-panel">
                  <h3>Recent successful searches</h3>
                  {!demo && recent.length ? (
                    recent.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setRun(r);
                          setInput(r.input);
                          setShowRecent(false);
                        }}
                      >
                        <Search size={15} />
                        <span>
                          {r.input.query}
                          <small>
                            {date(r.fetchedAt)} · {r._count?.jobs ?? 0} stored
                            jobs
                          </small>
                        </span>
                        <ArrowRight size={15} />
                      </button>
                    ))
                  ) : (
                    <p>
                      No searches yet. Your successful fetches will appear here.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {view === "Profile & Settings" ? (
            <div className="settings-grid">
              <section className="panel profile-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">PERSONALIZE YOUR SEARCH</span>
                    <h2>Your profile</h2>
                  </div>
                  <span className="subtle-label">
                    {hosted ? "Owner access only" : "Private to this device"}
                  </span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (demo) {
                      notify("Exit demo to update your private profile.");
                      return;
                    }
                    const formValues = new FormData(e.currentTarget);
                    const reviewed = {
                      ...profile,
                      ...Object.fromEntries(
                        ["skills", "titles", "locations", "excluded"].map(
                          (key) => [
                            key,
                            String(formValues.get(key) || "")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          ],
                        ),
                      ),
                    };
                    void action(async () => {
                      let aliases;
                      try {
                        aliases = JSON.parse(aliasText);
                      } catch {
                        throw new Error("Alias map must be valid JSON.");
                      }
                      await api("profile", "PUT", { ...reviewed, aliases });
                      await loadMeta();
                      await loadJobs();
                    }, "Profile updated. Matching recalculated without API requests.");
                  }}
                >
                  <p className="muted">
                    Start with what you know. Leave unknown facts blank.
                    Separate entries with commas.
                  </p>
                  <Fields profile={profile} setProfile={setProfile} />
                  <details>
                    <summary>Skill aliases</summary>
                    <p className="muted">
                      Optional JSON mapping, e.g. {`{"JavaScript":["JS"]}`}.
                      Compose matches Jetpack Compose only in Android context.
                    </p>
                    <textarea
                      aria-label="Skill aliases JSON"
                      value={aliasText}
                      onChange={(e) => setAliasText(e.target.value)}
                    />
                  </details>
                  <div className="cv-box">
                    <FileText size={22} />
                    <div>
                      <h3>Bring your CV along</h3>
                      <p>
                        PDF or DOCX, up to {hosted ? "4" : "5"} MB. Or paste
                        your text below.
                      </p>
                    </div>
                    <label className="secondary upload">
                      <Upload size={15} />
                      Import
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > (hosted ? 4 : 5) * 1024 * 1024) {
                            setError(
                              "This file is too large. Use a smaller file or paste its text.",
                            );
                            return;
                          }
                          void action(async () => {
                            const form = new FormData();
                            form.append("file", file);
                            const response = await fetch("/api/cv", {
                              method: "POST",
                              body: form,
                            });
                            const data = await response.json();
                            if (!response.ok)
                              throw new Error(
                                errors[data.error] ||
                                  "Could not read this file.",
                              );
                            setProfile({ ...profile, cvText: data.text });
                            notify(
                              "Text extracted. Review it and enter verified skills, targets and experience above.",
                            );
                          });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <label className="field">
                    Editable CV text preview
                    <textarea
                      rows={6}
                      value={profile.cvText}
                      onChange={(e) =>
                        setProfile({ ...profile, cvText: e.target.value })
                      }
                      placeholder="Paste your CV text here. Review imported text before saving."
                    />
                  </label>
                  <p className="muted">
                    Matching uses only the structured facts you enter above. CV
                    text is stored only when you confirm below.
                  </p>
                  <label className="checkline">
                    <input type="checkbox" required /> I’ve reviewed these facts
                    and approve their use for matching.
                  </label>
                  <button className="primary" type="submit">
                    <Check size={16} />
                    Save reviewed profile
                  </button>
                </form>
              </section>
              <div className="settings-right">
                {hosted && <ChangePassword />}
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Connection & budget</h2>
                    <Link2 size={19} />
                  </div>
                  <p className="connection-info">
                    <span
                      className={"status-dot " + (usage?.connected ? "on" : "")}
                    />
                    {usage?.connected
                      ? "Server key configured"
                      : "JSearch is not connected"}
                  </p>
                  <p className="muted">
                    {hosted
                      ? "Add JSEARCH_API_KEY to your Vercel Production environment"
                      : "Add JSEARCH_API_KEY to .env"}{" "}
                    and confirm your direct portal plan with
                    JSEARCH_PLAN_CONFIRMED=true.{" "}
                    {hosted ? "Redeploy" : "Restart the app"} after changes.
                  </p>
                  <a
                    className="text-link"
                    href="https://app.openwebninja.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open provider dashboard <ArrowUpRight size={14} />
                  </a>
                  {usage && (
                    <BudgetForm
                      usage={usage}
                      onSave={(data) =>
                        action(async () => {
                          await api("settings", "PUT", data);
                          await loadMeta();
                        }, "Budget settings updated.")
                      }
                    />
                  )}
                </section>
                <section className="panel">
                  <h2>Your data, your control</h2>
                  <p className="muted">
                    Export includes your private profile, CV text, jobs, notes,
                    searches, history and usage ledger.
                  </p>
                  <a href="/api/export" className="secondary">
                    <Download size={16} />
                    Export workspace JSON
                  </a>
                  <button
                    className="danger text-button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete your profile, CV text, original résumés, reviewed fact versions, AI drafts and companion attempts? Saved jobs, application notes/status history and JSearch usage will remain.",
                        )
                      )
                        void action(async () => {
                          await api("profile", "DELETE", {
                            confirm: "DELETE PROFILE",
                          });
                          await loadMeta();
                        }, "Profile, résumé versions and assistant data deleted.");
                    }}
                  >
                    <Trash2 size={15} />
                    Delete profile & CV
                  </button>
                </section>
              </div>
              <section className="panel ledger">
                <h2>
                  Usage ledger{" "}
                  <span className="subtle-label">
                    Local estimate · recent 100 requests
                  </span>
                </h2>
                <p className="muted">
                  Sent requests count even when they fail. Interrupted requests
                  remain potentially consumed. Usage outside this app is unknown
                  until reconciled.
                </p>
                {usage?.ledger.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>State</th>
                          <th>Credits</th>
                          <th>Safe error category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.ledger.map((l) => (
                          <tr key={l.id}>
                            <td>{new Date(l.createdAt).toLocaleString()}</td>
                            <td>{l.state}</td>
                            <td>{l.units}</td>
                            <td>{l.errorCategory || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-small">No discovery requests yet.</p>
                )}
              </section>
            </div>
          ) : (
            <>
              <div className="results-heading">
                <div>
                  <h2>
                    {view === "Discover"
                      ? "Your opportunities"
                      : view === "Saved"
                        ? hidden
                          ? "Hidden opportunities"
                          : "Your shortlist"
                        : "Application pipeline"}{" "}
                    <span className="count">
                      {demo ? activeJobs.length : total}
                    </span>
                  </h2>
                  <p>
                    {run
                      ? `${run.input.query} · ${run._count?.jobs ?? total} stored results · ${date(run.fetchedAt)} · JSearch${new Date(run.expiresAt) < new Date() ? " · Cache expired" : ""}`
                      : demo
                        ? "Fictional examples to explore your workspace"
                        : recent[0]
                          ? `Last fetch ${date(recent[0].fetchedAt)} · JSearch · ${recent[0]._count?.jobs ?? 0} cached results`
                          : "Stored jobs live here. Your search starts when you’re ready."}
                  </p>
                </div>
                <div className="inline-actions">
                  {run && (
                    <button
                      className="text-button"
                      onClick={() => setRun(null)}
                    >
                      All stored jobs
                    </button>
                  )}
                  {view === "Saved" && (
                    <button
                      className="secondary"
                      onClick={() => setHidden(!hidden)}
                    >
                      <EyeOff size={14} />
                      {hidden ? "Show saved" : "Hidden jobs"}
                    </button>
                  )}
                  {view === "Applications" && (
                    <>
                      <IconButton
                        label="Board view"
                        active={board}
                        onClick={() => setBoard(true)}
                      >
                        <LayoutGrid size={17} />
                      </IconButton>
                      <IconButton
                        label="List view"
                        active={!board}
                        onClick={() => setBoard(false)}
                      >
                        <List size={17} />
                      </IconButton>
                    </>
                  )}
                  <label className="sort">
                    Sort by{" "}
                    <select
                      aria-label="Sort stored jobs"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Recently fetched</option>
                      <option value="match">Best match</option>
                      <option value="published">Publication date</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="filters">
                <label className="local-search">
                  <Search size={16} />
                  <input
                    aria-label="Search stored jobs and notes"
                    placeholder="Search stored jobs, notes or tags"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={remote}
                    onChange={(e) => setRemote(e.target.checked)}
                  />
                  Remote
                </label>
                <select
                  aria-label="Minimum match score"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                >
                  <option value="0">Any match</option>
                  <option value="50">50%+ match</option>
                  <option value="75">75%+ match</option>
                </select>
                <select
                  aria-label="Filter country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="">All countries</option>
                  {countries.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  className="source-filter"
                  aria-label="Filter publisher"
                  placeholder="Publisher"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
                <select
                  aria-label="Application status filter"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Any status</option>
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <span className="local-label">
                  <ShieldCheck size={12} />
                  Local filters · 0 credits
                </span>
              </div>
              {view === "Applications" && board ? (
                <div className="kanban">
                  {statuses.map((s) => (
                    <section className="kanban-column" key={s}>
                      <h3>
                        <i className={"status-" + s.toLowerCase()} />
                        {s}
                        <span>
                          {
                            activeJobs.filter(
                              (j) => j.application?.status === s,
                            ).length
                          }
                        </span>
                      </h3>
                      {activeJobs
                        .filter((j) => j.application?.status === s)
                        .map((j) => (
                          <button
                            key={j.id}
                            className="kanban-card"
                            onClick={() => setSelected(j)}
                          >
                            <span className="company-letter">
                              {j.employer[0]}
                            </span>
                            <h4>{j.title}</h4>
                            <p>{j.employer}</p>
                            <span className="muted">
                              {j.location || "Location unknown"}
                            </span>
                          </button>
                        ))}
                      <div className="kanban-empty">
                        {activeJobs.some((j) => j.application?.status === s)
                          ? ""
                          : "No applications yet"}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div
                  className={
                    "results-layout " + (selected ? "has-selection" : "")
                  }
                >
                  <section
                    className="job-list"
                    aria-label="Stored jobs"
                    aria-busy={loading && !demo}
                  >
                    {loading && !demo ? (
                      <div className="loading">
                        <LoaderCircle className="spin" />
                        Loading your workspace…
                      </div>
                    ) : activeJobs.length ? (
                      activeJobs.map((j) => (
                        <article
                          key={j.id}
                          className={
                            "job-card " +
                            (selected?.id === j.id ? "selected" : "")
                          }
                        >
                          <div className="card-main">
                            <span
                              className={
                                "company-letter tint-" + (j.employer.length % 4)
                              }
                            >
                              {j.employer.slice(0, 1)}
                            </span>
                            <div className="job-card-content">
                              <button
                                className="job-title"
                                onClick={() => setSelected(j)}
                              >
                                {j.title}
                              </button>
                              <div className="company">{j.employer}</div>
                              <div className="job-meta">
                                <span>
                                  <MapPin size={13} />
                                  {j.location || "Location unknown"}
                                </span>
                                <span>
                                  {j.remote === true
                                    ? "Remote"
                                    : j.remote === false
                                      ? "On-site / unspecified hybrid"
                                      : "Arrangement unknown"}
                                </span>
                              </div>
                            </div>
                            <IconButton
                              label={
                                j.saved
                                  ? "Unsave " + j.title
                                  : "Save " + j.title
                              }
                              active={Boolean(j.saved)}
                              onClick={() =>
                                void action(() =>
                                  updateJob(j, { saved: !j.saved }),
                                )
                              }
                            >
                              <Bookmark
                                size={18}
                                fill={j.saved ? "currentColor" : "none"}
                              />
                            </IconButton>
                          </div>
                          <div className="card-bottom">
                            <span className="match">
                              <span className="match-dot" />
                              {j.match.score === null
                                ? "Set up matching"
                                : j.match.score + "% match"}
                              <small>{j.match.coverage}% coverage</small>
                            </span>
                            <span className="card-salary">{salary(j)}</span>
                          </div>
                          <div className="card-foot">
                            <span>
                              {j.sources[0]?.publisher || "JSearch"}{" "}
                              <span>·</span> Published {date(j.publishedAt)}
                            </span>
                            {j.application && (
                              <span className="status-tag">
                                {j.application.status}
                              </span>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">
                        <div className="empty-compass">
                          <Compass size={34} />
                        </div>
                        <span className="eyebrow">
                          SPACE FOR YOUR NEXT MOVE
                        </span>
                        <h2>
                          {q ||
                          remote ||
                          min !== "0" ||
                          country ||
                          source ||
                          status
                            ? "No jobs match these filters"
                            : view === "Saved"
                              ? "Your shortlist starts with a save"
                              : view === "Applications"
                                ? "Your next step belongs here"
                                : "A fresh start. A clear direction."}
                        </h2>
                        <p>
                          {view === "Discover"
                            ? "Connect JSearch and fetch your first opportunities. We’ll keep them here, ready whenever you are."
                            : view === "Saved"
                              ? "Save a promising role from Discover, then add your notes and tags."
                              : "Open a job and choose an application status to start tracking your progress."}
                        </p>
                        <div className="empty-actions">
                          {view === "Discover" ? (
                            <>
                              <button
                                className="primary"
                                onClick={() => chooseView("Profile & Settings")}
                              >
                                Set up your workspace <ArrowRight size={16} />
                              </button>
                              <button className="secondary" onClick={enterDemo}>
                                Explore demo
                              </button>
                            </>
                          ) : (
                            <button
                              className="primary"
                              onClick={() => chooseView("Discover")}
                            >
                              Explore opportunities <ArrowRight size={16} />
                            </button>
                          )}
                        </div>
                        <div className="empty-steps">
                          <span>
                            <span>01</span>Make it yours
                          </span>
                          <span>
                            <span>02</span>Find your fit
                          </span>
                          <span>
                            <span>03</span>Move forward
                          </span>
                        </div>
                      </div>
                    )}
                    {!demo && pages > 1 && (
                      <div className="pagination">
                        <button
                          className="secondary"
                          disabled={page <= 1}
                          onClick={() => setPage(page - 1)}
                        >
                          <ChevronLeft size={15} />
                          Previous
                        </button>
                        <span>
                          Stored page {page} of {pages} · 0 credits
                        </span>
                        <button
                          className="secondary"
                          disabled={page >= pages}
                          onClick={() => setPage(page + 1)}
                        >
                          Next
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    )}
                    {view === "Discover" && run?.nextCursor && (
                      <button
                        className="secondary fetch-more"
                        disabled={busy || demo}
                        onClick={() => void fetchJobs(true)}
                      >
                        Fetch more from JSearch · 1 credit <Plus size={15} />
                      </button>
                    )}
                  </section>
                  {selected ? (
                    <JobDetail
                      key={selected.id}
                      job={selected}
                      demo={demo}
                      close={() => setSelected(null)}
                      onUpdate={(data) =>
                        action(() => updateJob(selected, data))
                      }
                      onTrack={(data) =>
                        action(
                          () => saveApplication(selected, data),
                          "Application updated.",
                        )
                      }
                    />
                  ) : (
                    <aside className="detail-placeholder">
                      <div className="detail-art">
                        <div className="art-line" />
                        <Compass size={38} />
                        <div className="art-sheet">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                      <h3>See the whole picture.</h3>
                      <p>
                        Select an opportunity to explore the role,
                        <br />
                        understand your match, and plan your next step.
                      </p>
                      <span>
                        <ShieldCheck size={14} />
                        Opening details uses no API credits
                      </span>
                      <div className="small-tip">
                        <Leaf size={16} />
                        <div>
                          <strong>A more intentional search</strong>
                          <p>
                            A few well-matched applications can be worth more
                            than a hundred rushed ones.
                          </p>
                        </div>
                      </div>
                    </aside>
                  )}
                </div>
              )}
              {view === "Applications" && board && !demo && pages > 1 && (
                <div className="pagination">
                  <button
                    className="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft size={15} />
                    Previous
                  </button>
                  <span>
                    Stored page {page} of {pages} · 0 credits
                  </span>
                  <button
                    className="secondary"
                    disabled={page >= pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
              {view === "Applications" && board && selected && (
                <div className="detail-overlay">
                  <JobDetail
                    key={selected.id}
                    job={selected}
                    demo={demo}
                    close={() => setSelected(null)}
                    onUpdate={(data) => action(() => updateJob(selected, data))}
                    onTrack={(data) =>
                      action(
                        () => saveApplication(selected, data),
                        "Application updated.",
                      )
                    }
                  />
                </div>
              )}
              <footer>
                <span>
                  <Compass size={14} /> A little direction goes a long way.
                </span>
                <span>
                  {demo
                    ? "Demo data · fictional listings"
                    : "Powered by JSearch · Public-source listings, not independently verified"}
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
