"use client";
import { useEffect, useState } from "react";
import { type Profile } from "./common";

export default function Fields({
  profile: p,
  setProfile: set,
}: {
  profile: Profile;
  setProfile: (p: Profile) => void;
}) {
  const [values, setValues] = useState({
    skills: p.skills.join(", "),
    titles: p.titles.join(", "),
    locations: p.locations.join(", "),
    excluded: p.excluded.join(", "),
  });
  useEffect(() => {
    setValues({
      skills: p.skills.join(", "),
      titles: p.titles.join(", "),
      locations: p.locations.join(", "),
      excluded: p.excluded.join(", "),
    });
  }, [p.skills, p.titles, p.locations, p.excluded]);
  return (
    <>
      <div className="form-grid">
        {(["skills", "titles", "locations", "excluded"] as const).map((k) => (
          <label className="field" key={k}>
            {
              {
                skills: "Skills",
                titles: "Active target titles",
                locations: "Preferred locations",
                excluded: "Excluded keywords",
              }[k]
            }
            <input
              name={k}
              value={values[k]}
              placeholder={
                {
                  skills: "Kotlin, Jetpack Compose, Java…",
                  titles: "Android Developer",
                  locations: "Malaysia, Kuala Lumpur",
                  excluded: "Senior, unpaid…",
                }[k]
              }
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              onBlur={() =>
                set({
                  ...p,
                  [k]: values[k]
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
        ))}
        <label className="field">
          Approximate experience (years)
          <input
            type="number"
            min="0"
            max="70"
            step="0.5"
            placeholder="Unknown"
            value={p.years ?? ""}
            onChange={(e) =>
              set({
                ...p,
                years: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label className="field">
          Work arrangement
          <select
            value={p.arrangement}
            onChange={(e) => set({ ...p, arrangement: e.target.value })}
          >
            <option value="any">Open to any</option>
            <option value="remote">Remote</option>
            <option value="onsite">On-site</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Suggested skills are placeholders, not verified claims. Choose one
        active target to keep Android and PMO searches distinct.
      </p>
    </>
  );
}
