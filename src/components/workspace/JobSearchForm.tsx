"use client";
import { useEffect, useState } from "react";
import { Search, MapPin } from "lucide-react";
export default function JobSearchForm({
  query,
  location,
  onSearch,
}: {
  query: string;
  location: string;
  onSearch: (query: string, location: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [place, setPlace] = useState(location);
  useEffect(() => setDraft(query), [query]);
  useEffect(() => setPlace(location), [location]);
  return (
    <form
      className="catalog-search job-search-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draft.trim(), place.trim());
      }}
    >
      <label>
        <span>What are you looking for?</span>
        <div>
          <Search size={19} />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200}
            placeholder="Job title, skill or company"
          />
        </div>
      </label>
      <label>
        <span>Where?</span>
        <div>
          <MapPin size={19} />
          <input
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            maxLength={120}
            placeholder="City, country or region"
          />
        </div>
      </label>
      <button className="primary">Search jobs</button>
    </form>
  );
}
