# Application filling and recovery

JobCompass never submits applications for you. You review and submit every application yourself.

JobCompass separates relevance, screening and form compatibility. A platform name alone does not establish that every employer form works, and no part of this flow guarantees an interview.

## Before applying

Discovery ranks saved role, location and CV skill evidence. The card separately checks explicit requirements against confirmed application-profile facts: citizenship, clearance, sponsorship exclusions, current student enrollment, named technologies, minimum dated experience, degree completion and working-location constraints. Overlapping experience periods count once. Missing facts produce screening questions; citizenship is never inferred from work authorization. A missing requirement in the listing is not evidence of eligibility: the positive label is **No detected requirement conflict**.

A right swipe or **Queue for review** only adds the job to your application queue; nothing is sent to the employer. Opening a queued application explains screening and form support. Unresolved screening requirements block a filling connection until you confirm them. A changed profile or CV requires a fresh connection.

## Answer memory and onboarding

Application profile retains seven reviewed sections and the original CV. Its setup checklist links profile facts, country-specific eligibility, matching preferences and the answer library. Work authorization, sponsorship and citizenship are separate declarations. Country aliases include US, USA, U.S. and U.S.A.; compound citizenship/clearance questions never resolve to a generic work-authorization answer.

An answer's default job/employer scope is preserved. The user may explicitly broaden a reviewed answer to other employers in the same country or, for appropriate non-country-specific questions, general equivalent questions. Authorization and sponsorship cannot be made countryless. New country-scoped eligibility-answer hashes depend on that country's facts; changing another country does not expire them. Legacy hashes retain conservative review behavior. Expiry and conflicting facts still prevent reuse.

The job-specific inbox filters before pagination. An unknown country can be explicitly corrected while answering. Confirmed project passages can be opened as drafts for relevant narrative questions; the user must adapt and confirm them. No AI request or invented achievement is used for these drafts. Privacy consent, demographic disclosures and unrelated employer-specific answers are never silently accepted.

## Form handling

Companion **2.2.0** fills forms in your own Chrome tab and never clicks Submit. Modern application dropdowns may ignore synthetic events, so the companion briefly uses Chrome's debugger API solely to open the focused top-level application-form combobox in a currently connected, job-matched tab. The companion therefore adds the `debugger` permission; Chrome may show its debugging indicator. The bridge accepts no arbitrary command, text, URL or script. It does not operate on CAPTCHA frames. Reload/update the unpacked companion to use this path.

CV controls are checked after dynamic form startup. The selected original bytes are hash-verified, formatting is unchanged, and the employer's retained upload is checked. Upload verification is not ATS certification. Existing form values are preserved. Location choices require a unique match to the supplied location; ambiguous choices need the user. Referral-source filling uses only truthful JobCompass/Other provenance. A most-recent-company question uses confirmed dated employment only when the most recent entry is unambiguous; a current employer is not invented.

Invisible reCAPTCHA branding anchors are distinguished from presented verification controls. The employer may still request a real challenge through its ordinary submission flow; human verification is left to you and is never bypassed. Unknown frames, unsupported uploads and unrecognized controls remain visible blockers.

## Reports and continuation

Version 2 reports retain filling provenance across conditional rescans using stable control IDs and retained-value checks. Field labels exclude control option text, and precise missing-answer reasons are retained. Reports distinguish filled, previously existing, missing, failed and upload-verified states. Older reports are explicitly labeled as final-scan-only; their counts are not retroactively represented as cumulative.

The Fill application page shows the latest report for the connected form, with missing questions linked to the answer inbox. A new connection refills a fresh employer tab from confirmed facts. Filling never marks a job Applied; you mark it Applied after submitting it yourself.

## Verification boundaries

Service tests verify ownership, context, freshness and screening guards, and that the companion API has no submit or outcome action. Browser tests exercise the installed extension against intercepted fictional forms, including trusted-key-only dropdowns, conditional rescans, exact uploads and invisible badges, and assert that nothing is submitted. Responsive screenshots cover desktop, tablet, phone and dark theme. Read-only inspection of public blank employer forms verifies the observed DOM behavior without sending a CV, personal answers or an application. These checks do not establish universal live-form compatibility.
