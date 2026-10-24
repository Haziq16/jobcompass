# Swipe discovery redesign

The screen answers one question: **Is this opportunity worth pursuing?**

Taste Skill dealt Achromatic Ledger, seed `797344270`, with existing palette and typography preserved. It fits repeated job decisions without decorative chrome. No redraws. The product face is JobCompass's existing pale neutral ground, Segoe UI and restrained green match evidence. Its signature is the employer opportunity connected to the actual CV evidence, eligibility check and explicit recipient-bound decision.

The screen renders existing account-scoped catalogue and matching data:

- Employer name and source platform, with a text initial rather than an invented company logo.
- Full role title and supplied location.
- Workplace, employment type and salary, with absent data named explicitly.
- Employer summary with the full posting available in the native detail dialog.
- Actual matching reasons, without fabricated percentages or interview probabilities.
- Additional skills mentioned by the posting, distinct from confirmed CV experience.
- Real eligibility/readiness findings and any requirements needing attention.
- Current undecided count and queued count, derived from existing services.
- Optional pass reasons using the existing explicit-feedback behavior.
- Exact CV, recipient and submission disclosure when automatic processing is authorized.

The role is the largest surface and the first substantive content. Search and matching explanations use native disclosures. Decision buttons stay reachable while reading on desktop and phone; touch targets, labelled icons, focus, busy states, reduced-motion behavior, failed-save recovery, undo and keyboard shortcuts are preserved. Keyboard arrows on a disclosure must never create an application decision.

The redesign does not add model calls, change matching weights, grant employer permissions, alter queue semantics or mark applications submitted. The existing private-account, owner-preview and uncertain-outcome safeguards remain authoritative.

Browser verification uses the existing fictional Example Labs and other release fixtures. These are test data, never production claims. The source lint and rendered Taste inspector are checked alongside the actual desktop, tablet, phone and dark screenshots. No visual check spends provider credits or submits a real employer application.
