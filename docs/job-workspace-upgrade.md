# Complete job-search and application workflow

Authorized scope: reproduce the researched OptimHire workflow inside JobCompass. Mock interviews and salary negotiation are excluded by the user's explicit choice. Preserve JobCompass branding, owner-only AI/automation, private repository, public website, account isolation and existing/free infrastructure.

Acceptance criteria:

- One My Jobs workspace: matching, queue, saved, skipped, applied, interviews, offers and application issues; real counts, pagination, selected-job detail and useful next actions.
- Existing swipe discovery remains available; preferences and learning feed the same catalogue.
- Preparation selects a CV, identifies missing keywords, records explicitly confirmed supporting experience, creates a grounded review and tailored CV, and prepares a cover letter and screening answers.
- Original DOCX formatting stays available. PDF does not falsely claim editable original-layout preservation. Keyword presence is not an employer ATS score.
- Personal provider settings persist and are reused. Generation is explicit, metered, idempotent, account-scoped and never automatically retried after an uncertain provider request.
- Screening answers require review before entering reusable memory; protected personal facts and disclosure preferences are never inferred.
- Preparing documents does not authorize employer transmission. Existing named-recipient approval and actual verified submission gates remain authoritative.
- Each blocked application retains its exact reason and continuation path. Other approved jobs can continue. Uncertain outcomes cannot be restarted blindly.
- Include verified live-upload replacement and multi-select retention repairs from the Reddit pilot, with regression coverage.
- Verify meaningful backend regressions, complete browser flow, keyboard/mobile/dark states, lint, typecheck, production build and secret scan before publishing through the existing private repository and production target. Preserve rollback history.

Implementation notes: reuse existing catalogue, MatchDecision, Application, AiReview/AiCvDraft, AiGeneration/DocumentDraft and answer-memory services. Keep application materials in properly scoped existing document/generation records rather than adding infrastructure. Use the committed Achromatic Ledger interface direction.

## Using the workflow

Open **My jobs** for matching opportunities and the application pipeline. Matching uses the existing catalogue and confirmed preferences; its explanations are evidence of overlap, not an interview probability. Saved and Skipped refer to swipe decisions. The older **Shortlist** continues to hold saved private job-library records.

Choose **Prepare application** for a role. Select an owned CV, read its extracted text and confirm its accuracy. Missing keywords stay unselected until you explicitly confirm supporting experience. Adding a keyword is not permission to invent a qualification, metric or employer relationship.

The review and tailored CV are separate, explicitly requested personal-provider calls. Saved provider credentials and the selected model are reused. Original-format Word drafts preserve the uploaded document's structure, styles and unchanged parts. Review wording and final page breaks in Word. PDF sources can be uploaded unchanged or used for a clean Word draft; editable original PDF layout is not promised.

Approve the exact saved CV revision and choose **Use this CV for application**. This creates a separate library asset and selects it only for this application. Your default CV and automatic-processing rules stay as configured. Switching source CVs clears the previous prepared selection.

Generate a cover letter and narrative answers only after reviewing the provider disclosure. Edit and save the letter before downloading. Each answer requires explicit confirmation before entering memory; catalogue answers remain bound to that job and employer. Preparing answers before queuing requires your account's completed review for the same job. Work authorization, citizenship, sponsorship, salary and demographic choices need confirmed personal facts.

The final step queues the job without authorizing transmission, then opens the existing filling setup with the selected CV. A separate recipient disclosure authorizes filling or submission. A fill-only selection cannot become submission simply because global rules allow submission. Logins, visible verification challenges, unsupported widgets and unknown required answers still pause processing. Uncertain outcomes remain blocked against automatic retry.

## Research boundaries

This implementation follows observed public and signed-in workflow structure from OptimHire, using original JobCompass code and branding. Its private ranking algorithm, generation backend and full extension behavior were not available for inspection. Mock interviews, salary negotiation and a Gmail connection are outside this release. Neither keyword checks nor automation guarantee hiring or compatibility with every employer form.
