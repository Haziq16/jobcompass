(() => {
  function info(value) {
    try {
      const u = new URL(value);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        (u.port && u.port !== "443")
      )
        return null;
      let m;
      if (
        ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(
          u.hostname,
        )
      ) {
        m = u.pathname.match(/^\/([a-z0-9_-]+)\/jobs\/(\d+)\/?$/i);
        return m
          ? {
              platform: "greenhouse",
              identity: m[1].toLowerCase() + ":" + m[2],
            }
          : null;
      }
      if (["jobs.lever.co", "jobs.eu.lever.co"].includes(u.hostname)) {
        m = u.pathname.match(
          /^\/([a-z0-9_-]+)\/([a-f0-9-]{36})(?:\/(?:apply|thanks))?\/?$/i,
        );
        return m
          ? {
              platform: "lever",
              identity:
                "lever:" +
                u.hostname +
                ":" +
                m[1].toLowerCase() +
                ":" +
                m[2].toLowerCase(),
            }
          : null;
      }
      if (u.hostname === "jobs.ashbyhq.com") {
        m = u.pathname.match(
          /^\/([a-z0-9_-]+)\/([a-f0-9-]{36})(?:\/application)?\/?$/i,
        );
        return m
          ? {
              platform: "ashby",
              identity:
                "ashby:" + m[1].toLowerCase() + ":" + m[2].toLowerCase(),
            }
          : null;
      }
      return null;
    } catch {
      return null;
    }
  }
  const api = { info, identity: (value) => info(value)?.identity || null };
  if (typeof module !== "undefined") module.exports = api;
  else globalThis.JobCompassTargets = api;
})();
