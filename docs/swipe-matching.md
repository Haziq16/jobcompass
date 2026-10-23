# Swipe matching

The website offers an owner-only swipe preview in Discover. `MATCH_MODE` defaults to `owner`; `off` disables it, and `all` explicitly enables it for signed-in accounts. Other accounts retain List discovery. Local development can use the preview without an owner email.

## Experience

- Three-step setup collects target roles, skills, locations, employment types, seniority, pay preferences, sponsorship context and exclusions. Existing profile/CV mentions suggest initial values.
- Right swipe or Interested adds a public listing to the account's application queue. Left swipe passes it. Save for later bookmarks it separately. Mouse/pointer gestures, buttons and arrow shortcuts share the same server action.
- A card advances only after a successful write. A transport retry reuses the same request UUID. Server revisions reject stale-tab changes.
- Undo restores the previous decision without deleting job-library records or applications. It refuses to overwrite a newer edit. Undo candidates persist across reloads.
- Queue priorities are First, High and Normal. Saved, passed and removed decisions are separate collections with database pagination. Expired/deleted source listings retain their original public snapshot and can be removed.
- Starting an application tracker is an explicit action. An employer link never implies submission. Record my submission requires a separate confirmation and uses the existing account-private tracker.

## Matching boundaries

The deck requires target-role or skill evidence; location alone cannot populate it. Preferences filter the whole catalogue before ranking and pagination. Exact text evidence and the existing cached skill matcher explain each result. This is not semantic capability verification, an eligibility decision or an interview probability.

Strict title matching uses the supplied title fragments. Strict location matching uses the employer location text, not inferred work authorization. Remote work can still have country restrictions. Salary comparisons require an explicit matching currency and period; missing/ambiguous or other-currency pay follows the chosen unknown-details policy. No currency conversion is performed. Sponsorship filtering detects a limited set of explicit negative phrases and never establishes eligibility.

Explicit Employer, Wrong role and Location pass reasons gently lower matches with the same employer/title/location. Repeated identical signals do not multiply the penalty. A swipe without a reason only hides that listing. Reset feedback influence clears reasons while retaining the decisions themselves. CV skill mentions are deduplicated without regard to case and do not prove proficiency.

## Data and privacy

Migration `202610220004_swipe_matching` adds MatchPreferences, MatchDecision and MatchAction. All are account-scoped through the existing database extension. Public catalogue rows are not duplicated per account merely by swiping; decisions retain a compact public snapshot. Existing saved copies and tracked applications are excluded from the deck, alongside prior swipe decisions and exact duplicate apply URLs.

Matching settings, decisions and history are included in account exports. Clearing a profile clears its matching preferences while preserving queued decisions, jobs and application history. Source disappearance never deletes the account's decision snapshot.

## Explicitly deferred

No automatic application submission, background browser worker, persistent answer memory, new paid AI use or native mobile application is enabled. The website supports small screens, but this is not a native app release. Existing personal-key AI consent and original-DOCX safeguards remain unchanged.
