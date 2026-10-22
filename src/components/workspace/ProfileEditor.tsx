"use client";
import { useEffect, useState } from "react";
import { api, useResource } from "./client";
type Profile = {
  skills: string[];
  titles: string[];
  locations: string[];
  excluded: string[];
  years: number | null;
  arrangement: string;
  cvText: string;
  aliases: Record<string, string[]>;
};
export default function ProfileEditor() {
  const resource = useResource<Profile>("profile");
  const [profile, setProfile] = useState<Profile | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (resource.data) setProfile(resource.data);
  }, [resource.data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const {
        skills,
        titles,
        locations,
        excluded,
        years,
        arrangement,
        cvText,
        aliases,
      } = profile;
      await api("profile", "PUT", {
        skills,
        titles,
        locations,
        excluded,
        years,
        arrangement,
        cvText,
        aliases,
      });
      setMessage("Profile saved. Your job matches now use these preferences.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const listField = (
    key: "skills" | "titles" | "locations" | "excluded",
    label: string,
    hint: string,
  ) => (
    <label>
      {label}
      <input
        defaultValue={profile?.[key].join(", ")}
        onChange={(e) =>
          setProfile(
            (p) =>
              p && {
                ...p,
                [key]: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
          )
        }
        placeholder={hint}
      />
      <small>Separate entries with commas.</small>
    </label>
  );
  return (
    <>
      <div className="upgrade-heading">
        <div>
          <h1>Your profile</h1>
          <p>A few preferences help you spot the right opportunities.</p>
        </div>
        <span className="subtle-badge">Only visible to you</span>
      </div>
      {(resource.error || error) && (
        <p role="alert" className="alert">
          {error || resource.error}
        </p>
      )}
      {resource.loading && <p role="status">Loading profile…</p>}
      {profile && (
        <form className="profile-form" onSubmit={save}>
          <section className="upgrade-panel">
            <div className="section-heading">
              <span className="section-number">01</span>
              <div>
                <h2>What are you looking for?</h2>
                <p>Your preferred roles, skills and locations.</p>
              </div>
            </div>
            <div className="editor-grid">
              {listField(
                "titles",
                "Target roles",
                "Software engineer, Product designer",
              )}
              {listField(
                "skills",
                "Your skills",
                "TypeScript, Research, Communication",
              )}
              {listField(
                "locations",
                "Preferred locations",
                "Singapore, Kuala Lumpur",
              )}
              {listField(
                "excluded",
                "Keywords to avoid",
                "Commission only, Unpaid",
              )}
              <label>
                Experience in years
                <input
                  type="number"
                  min={0}
                  max={70}
                  step="0.5"
                  value={profile.years ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      years:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Work preference
                <select
                  value={profile.arrangement}
                  onChange={(e) =>
                    setProfile({ ...profile, arrangement: e.target.value })
                  }
                >
                  <option value="any">Any arrangement</option>
                  <option value="remote">Remote</option>
                  <option value="onsite">On-site</option>
                </select>
              </label>
            </div>
          </section>
          <section className="upgrade-panel">
            <div className="section-heading">
              <span className="section-number">02</span>
              <div>
                <h2>Your experience</h2>
                <p>
                  Optional résumé text for matching and your own review. Saving
                  here does not send it to an AI provider.
                </p>
              </div>
            </div>
            <label>
              Résumé or experience notes
              <textarea
                rows={9}
                maxLength={80000}
                value={profile.cvText}
                onChange={(e) =>
                  setProfile({ ...profile, cvText: e.target.value })
                }
                placeholder="Paste the experience and skills you want to match against jobs."
              />
            </label>
          </section>
          <div className="form-footer">
            <p>Changes apply only to your workspace.</p>
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </div>
          {message && (
            <p role="status" className="success-message">
              {message}
            </p>
          )}
        </form>
      )}
    </>
  );
}
