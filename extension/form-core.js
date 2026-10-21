// Shared inert matching rules; tested against controlled forms, no submission automation.
(() => {
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const aliases = {
    firstname: ["firstname", "givenname"],
    lastname: ["lastname", "familyname", "surname"],
    email: ["email", "emailaddress"],
    phone: ["phone", "phonenumber"],
    linkedin: ["linkedin", "linkedinprofile"],
    website: ["website", "portfolio", "personalwebsite"],
  };
  function resolveField(name, label, fields) {
    const names = [normalize(name), normalize(label)];
    for (const [key, value] of Object.entries(fields)) {
      const normalized = normalize(key),
        options = aliases[normalized] || [normalized];
      if (names.some((n) => options.includes(n))) return value;
    }
    return null;
  }
  const rules = { normalize, resolveField };
  if (typeof module !== "undefined") module.exports = rules;
  else globalThis.JobCompassRules = rules;
})();
