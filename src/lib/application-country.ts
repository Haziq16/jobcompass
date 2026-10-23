export function applicationHiringCountry(
  job: { country?: string | null; location?: string | null },
  fallback = "",
) {
  const country = job.country?.trim();
  if (
    country &&
    !/^(unspecified|unknown|worldwide|remote|global|any|n\/a)$/i.test(country)
  )
    return country;
  const location = job.location || "";
  const names = [
    "United States",
    "United Kingdom",
    "India",
    "Singapore",
    "Malaysia",
    "Canada",
    "Australia",
    "Germany",
    "France",
    "Netherlands",
    "South Africa",
    "United Arab Emirates",
    "New Zealand",
    "Ireland",
    "Pakistan",
    "Brazil",
    "Japan",
  ];
  const matches = names.filter((name) =>
    new RegExp(`(?:^|[^a-z])${name}(?:$|[^a-z])`, "i").test(location),
  );
  if (
    !matches.includes("United States") &&
    /(?:^|[,\s-])(?:USA|U\.S\.|US)(?:$|[,\s])/i.test(location)
  )
    matches.push("United States");
  return matches.length === 1
    ? matches[0]
    : matches.length > 1
      ? ""
      : /^(unspecified|unknown|worldwide|remote|global|any|n\/a)$/i.test(
            fallback,
          )
        ? ""
        : fallback;
}
