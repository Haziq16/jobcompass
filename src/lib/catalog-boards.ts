/** Public employer feeds. No credentials or user-supplied upstream URLs. */
export const catalogBoards = [
  ["greenhouse", "airbnb", "Airbnb"],
  ["greenhouse", "airtable", "Airtable"],
  ["greenhouse", "affirm", "Affirm"],
  ["greenhouse", "andurilindustries", "Anduril"],
  ["greenhouse", "asana", "Asana"],
  ["greenhouse", "automatticcareers", "Automattic"],
  ["greenhouse", "brex", "Brex"],
  ["greenhouse", "canonical", "Canonical"],
  ["greenhouse", "chime", "Chime"],
  ["greenhouse", "cloudflare", "Cloudflare"],
  ["greenhouse", "coinbase", "Coinbase"],
  ["greenhouse", "databricks", "Databricks"],
  ["greenhouse", "datadog", "Datadog"],
  ["greenhouse", "discord", "Discord"],
  ["greenhouse", "doordashusa", "DoorDash"],
  ["greenhouse", "dropbox", "Dropbox"],
  ["greenhouse", "duolingo", "Duolingo"],
  ["greenhouse", "elastic", "Elastic"],
  ["greenhouse", "figma", "Figma"],
  ["greenhouse", "gitlab", "GitLab"],
  ["greenhouse", "gusto", "Gusto"],
  ["greenhouse", "hellofresh", "HelloFresh"],
  ["greenhouse", "hubspotjobs", "HubSpot"],
  ["greenhouse", "instacart", "Instacart"],
  ["greenhouse", "klaviyo", "Klaviyo"],
  ["greenhouse", "lyft", "Lyft"],
  ["greenhouse", "mongodb", "MongoDB"],
  ["greenhouse", "okta", "Okta"],
  ["greenhouse", "pinterest", "Pinterest"],
  ["greenhouse", "reddit", "Reddit"],
  ["greenhouse", "ripple", "Ripple"],
  ["greenhouse", "robinhood", "Robinhood"],
  ["greenhouse", "roblox", "Roblox"],
  ["greenhouse", "rubrik", "Rubrik"],
  ["greenhouse", "spacex", "SpaceX"],
  ["greenhouse", "stripe", "Stripe"],
  ["greenhouse", "toast", "Toast"],
  ["greenhouse", "twilio", "Twilio"],
  ["greenhouse", "verkada", "Verkada"],
  ["greenhouse", "waymo", "Waymo"],
  ["greenhouse", "webflow", "Webflow"],
  ["greenhouse", "wizinc", "Wiz"],
  ["greenhouse", "zscaler", "Zscaler"],
  ["greenhouse", "greenhouse", "Greenhouse"],
  ["lever", "spotify", "Spotify"],
  ["lever", "palantir", "Palantir"],
  ["lever", "mistral", "Mistral AI"],
  ["lever", "wealthsimple", "Wealthsimple"],
  ["lever", "zoox", "Zoox"],
  ["lever", "matchgroup", "Match Group"],
  ["lever", "binance", "Binance"],
  ["lever", "kraken", "Kraken"],
  ["ashby", "openai", "OpenAI"],
  ["ashby", "notion", "Notion"],
  ["ashby", "ramp", "Ramp"],
  ["ashby", "deel", "Deel"],
  ["ashby", "linear", "Linear"],
  ["ashby", "perplexity", "Perplexity"],
  ["ashby", "vercel", "Vercel"],
  ["ashby", "supabase", "Supabase"],
  ["ashby", "elevenlabs", "ElevenLabs"],
  ["ashby", "cursor", "Cursor"],
  ["ashby", "clerk", "Clerk"],
  ["ashby", "ashby", "Ashby"],
] as const;
export type CatalogPlatform = (typeof catalogBoards)[number][0];
export type PublicBoard = {
  platform: CatalogPlatform;
  token: string;
  name: string;
};
export function boardUrl(board: PublicBoard) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(board.token))
    throw new Error("Invalid board token");
  switch (board.platform) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`;
    case "lever":
      return `https://api.lever.co/v0/postings/${board.token}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${board.token}?includeCompensation=true`;
    default:
      throw new Error("Unsupported platform");
  }
}
