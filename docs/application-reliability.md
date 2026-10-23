# Application processing and recovery

JobCompass separates relevance, screening, form compatibility and submission outcomes. A platform name alone does not establish that every employer form works, and no part of this flow guarantees an interview.

## Before authorizing a job

Discovery ranks saved role, location and CV skill evidence. The card separately checks explicit requirements against confirmed application-profile facts: citizenship, clearance, sponsorship exclusions, current student enrollment, named technologies, minimum dated experience, degree completion and working-location constraints. Overlapping experience periods count once. Missing facts produce screening questions; citizenship is never inferred from work authorization. A missing requirement in the listing is not evidence of eligibility: the positive label is **No detected requirement conflict**.

Cards distinguish authorized automatic processing from **Queue for review**. Unsupported forms and unresolved screening requirements do not silently create automatic tasks. The queue shows the actual task state and refreshes while visible. Opening a queued application explains screening and form support and offers fresh employer/CV authorization only when allowed. A changed profile or CV needs new permission. Existing uncertain or confirmed submissions cannot open a fresh filling connection.

## Answer memory and onboarding

Application profile retains seven reviewed sections and the original CV. Its setup checklist links profile facts, country-specific eligibility, matching preferences and the answer library. Work authorization, sponsorship and citizenship are separate declarations. Country aliases include US, USA, U.S. and U.S.A.; compound citizenship/clearance questions never resolve to a generic work-authorization answer.

An answer's default job/employer scope is preserved. The user may explicitly broaden a reviewed answer to other employers in the same country or, for appropriate non-country-specific questions, general equivalent questions. Authorization and sponsorship cannot be made countryless. New country-scoped eligibility-answer hashes depend on that country's facts; changing another country does not expire them. Legacy hashes retain conservative review behavior. Expiry and conflicting facts still prevent reuse.

The job-specific inbox filters before pagination. An unknown country can be explicitly corrected while answering. Confirmed project passages can be opened as drafts for relevant narrative questions; the user must adapt and confirm them. No AI request or invented achievement is used for these drafts. Privacy consent, demographic disclosures and unrelated employer-specific answers are never silently accepted.

## Form handling

Companion **2.1.0** and the standalone worker share the browser engine. Modern application dropdowns may ignore synthetic events. The worker uses native keyboard input, and the companion briefly uses Chrome's debugger API solely to open the focused top-level application-form combobox in a currently connected, job-matched tab. The companion therefore adds the `debugger` permission; Chrome may show its debugging indicator. The bridge accepts no arbitrary command, text, URL or script. It does not operate on CAPTCHA frames. Reload/update the unpacked companion to use this path.

CV controls are checked after dynamic form startup. The selected original bytes are hash-verified, formatting is unchanged, and the employer's retained upload is checked. Upload verification is not ATS certification. Existing form values are preserved. Location choices require a unique match to the supplied location; ambiguous choices need the user. Referral-source filling uses only truthful JobCompass/Other provenance. A most-recent-company question uses confirmed dated employment only when the most recent entry is unambiguous; a current employer is not invented.

Invisible reCAPTCHA branding anchors are distinguished from presented verification controls. The employer may still request a real challenge through its ordinary submission flow; human verification stops automation and is never bypassed. Unknown frames, unsupported uploads and unrecognized controls remain visible blockers.

## Reports and continuation

Version 2 reports retain filling provenance across conditional rescans using stable control IDs and retained-value checks. Field labels exclude control option text, and precise missing-answer reasons are retained. Reports distinguish filled, previously existing, missing, failed and upload-verified states. Older reports are explicitly labeled as final-scan-only; their counts are not retroactively represented as cumulative.

Automatic applications opens on work needing attention, with full recent history separately available. Task details show the missing question, reason and next action. Confirmed applications show completion; uncertain attempts show outcome-check instructions, not restart instructions. A click or generic success text never establishes Applied.

The background worker closes its browser after a paused task. Continuation through **Review application & continue** uses the companion in the user's own employer tab and refills confirmed facts on a fresh form; it does not claim to restore the closed background tab. Missing facts can be saved in the linked inbox, then a fresh authorized attempt can be explicitly resumed. A recorded uncertain submission requires checking the existing outcome first.

## Execution and capacity

The temporary local watcher checks approximately every five seconds while its computer is awake and connected. A bounded heartbeat keeps its presence visible, including while a child worker is running. The existing cloud scheduler checks approximately every 30 minutes; GitHub can delay it. Application processing runs before catalogue collection in the same scheduled job, preserving the existing runner setup. This free-service configuration does not provide guaranteed immediate execution while the local computer is off.

Daily/monthly allowances count issued worker sessions. Preparation blocked before the worker receives a grant releases its slot, without deleting the attempt audit. Browser failures, missing answers, CAPTCHA and uncertain submissions still count. The owner's configured limits are separate from product defaults. Included runner/database allowances remain finite.

## Verification boundaries

Service tests verify ownership, context, freshness, screening, quota and duplicate guards. Browser tests exercise real workers and the installed extension against intercepted fictional forms, including trusted-key-only dropdowns, conditional rescans, exact uploads, invisible badges, visible challenges and verified receipts. Responsive screenshots cover desktop, tablet, phone and dark theme. Read-only inspection of public blank employer forms verifies the observed DOM behavior without sending a CV, personal answers or an application. These checks do not establish universal live-form compatibility or successful real submissions.
