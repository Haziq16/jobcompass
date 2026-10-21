"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Compass,
  Search,
  Bookmark,
  BriefcaseBusiness,
  UserRound,
  Settings,
  Sun,
  Moon,
  Radio,
  Sparkles,
} from "lucide-react";
import { SignOut } from "../AccountControls";
import { usePersonalAi } from "./PersonalAiContext";
const navigation = [
  ["/discover", "Discover", Radio],
  ["/jobs", "My jobs", Search],
  ["/saved", "Saved", Bookmark],
  ["/applications", "Applications", BriefcaseBusiness],
  ["/profile", "Profile", UserRound],
  ["/settings", "Settings", Settings],
] as const;
export default function Shell({
  children,
  hosted,
  name,
}: {
  children: ReactNode;
  hosted: boolean;
  name?: string;
}) {
  const pathname = usePathname();
  const { enabled: ai } = usePersonalAi();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const value = localStorage.getItem("jobcompass-theme") === "dark";
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
  }, []);
  function toggle() {
    setDark(!dark);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    localStorage.setItem("jobcompass-theme", dark ? "light" : "dark");
  }
  return (
    <div className="upgrade-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <aside className="upgrade-sidebar">
        <Link className="brand" href="/jobs">
          <Compass /> JobCompass<span>.</span>
        </Link>
        <p className="workspace-label">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
          {ai && (
            <Link
              href="/assistant"
              aria-current={
                pathname.startsWith("/assistant") ? "page" : undefined
              }
            >
              <Sparkles size={18} />
              AI studio
            </Link>
          )}
        </nav>
        <div className="upgrade-sidebar-note">
          <Compass />
          <h3>Your search, organized.</h3>
          <p>
            Find opportunities. Save the good ones. Keep track of your next
            step.
          </p>
          <small>{hosted ? "Personal account" : "Local workspace"}</small>
        </div>
        <div className="account-chip">
          <span className="account-avatar">
            {(name || "My").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{name || "My workspace"}</strong>
            <small>{hosted ? "Signed in" : "Local workspace"}</small>
          </div>
        </div>
      </aside>
      <div className="upgrade-main">
        <header className="upgrade-topbar">
          <span>
            Your workspace <span className="muted">/</span>{" "}
            <strong>
              {navigation.find(([url]) => pathname.startsWith(url))?.[1] ||
                (pathname.startsWith("/assistant")
                  ? "AI studio"
                  : "Application")}
            </strong>
          </span>
          <div>
            <button
              className="icon-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={toggle}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {hosted && <SignOut />}
          </div>
        </header>
        <main id="workspace-content" className="upgrade-body">
          {children}
        </main>
      </div>
    </div>
  );
}
