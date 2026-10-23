# Application profile and answer memory

The Application profile is an owner preview alongside swipe matching. It uses the existing `MATCH_MODE` setting: `owner` (default), `off`, or an explicit `all` release. It does not submit applications or call an AI provider.

## Workflow

1. Open **Application profile** from navigation or **Application answers** on a queued job.
2. Upload a PDF/DOCX or use a saved CV. Extraction suggests contact details, skill mentions and exact source passages. Suggestions fill empty draft fields only. Original file bytes and formatting remain unchanged.
3. Review contact, work experience, education, projects, skills, country-specific work eligibility, availability and salary. Save drafts freely; explicitly confirm each complete section before its facts can supply answers. Empty history sections need an explicit nothing-to-include declaration.
4. Paste a real screening question into the answer checker. A confirmed profile fact or saved answer appears only when supported by the question wording and context. Missing, conflicting or stale answers require your input.
5. Save your answer and explicitly approve any equivalent question wording. Review it later in the Answer library or Answers needed inbox. Copying an answer never records an application submission.

## Reuse rules

- Recognized common questions use curated meanings. Unknown questions match normalized exact wording or aliases the user explicitly confirms. This is conservative matching, not general semantic understanding.
- Work authorization and sponsorship are different answers. Country context is required for authorization, sponsorship and salary. US/USA and UK aliases normalize; unknown countries still accept explicitly entered names. Country detection covers a small documented set in the shared contracts, so provide country context when needed.
- Company-specific motivation needs an employer. Queue-linked questions derive the employer from an owned saved decision. One-job answers require an owned queue item and remain bound to that listing.
- Availability expires after at most 7 days, salary after 30 days, authorization/sponsorship after 90 days. Explicit expiry can shorten those limits. Profile-derived authorization also respects a recorded visa/permission expiry.
- Editing profile facts clears their section confirmation. Related saved answers require review if their captured section hash changes. Same-context conflicting answers block reuse.
- Confirmation records a user's declaration; it is not external verification or a legal eligibility assessment. No proficiency, credentials, employers, dates, demographic answers or eligibility are inferred.

## Data and controls

`CandidateProfile`, `ApplicationAnswer` and `ApplicationQuestion` are scoped by the existing workspace database extension. Writes use revisions; profile/answer writes serialize per workspace to prevent stale overwrites. Lists paginate 30 records at a time. Missing questions deduplicate by question and context. Deleting a saved answer reopens linked questions.

The authenticated `/api/application-profile` routes reject anonymous, non-owner-preview and cross-origin requests. Account exports include profile, answers and questions. Clearing a profile removes all three while preserving job/application history and queue decisions. Existing AI provider credentials stay under their separate encrypted storage and consent rules.

## Deferred

Browser form detection, automatic filling, employer submission, offline workers and outcome learning are not enabled by this release. The checker currently takes questions pasted by the user. Learned answers mean explicitly confirmed stored answers, not background inference. CV import does not publish a new AI Studio profile or replace discovery preferences.
