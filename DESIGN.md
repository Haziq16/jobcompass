# JobCompass interface

JobCompass is a working job-search application. Its interface should make a useful next action easy to find: search a role, save a job, prepare a CV, or update an application.

## Direction

This refinement combines Impeccable's Operate guidance with Taste Skill's **Achromatic Ledger** app direction (seed `1631018160`). Preserve the compass mark and green for meaningful status and evidence. Use neutral navigation, near-black primary actions, flat surfaces and aligned, readable content. The signature product element is the application path from a selected job through the original CV, evidence review, tailored document and explicit submission confirmation.

The existing application routes, wording with factual meaning, account boundaries and document formatting remain authoritative. This is an interface refinement, with no new claims about job freshness, ATS compatibility or model accuracy.

## Shared system

- Use the installed Segoe UI face, with Arial/sans-serif fallbacks. Do not declare an unloaded font. Keep Word document fonts inside their sandboxed preview unchanged.
- Page titles: 28px desktop, 24px phone. Section titles: 18–22px. Body and controls: 14–16px. Secondary metadata: 12–13px. Tabular numerals for changing counts and aligned values.
- Primary text `--release-ink`; secondary text `--release-muted`; neutral background and white surfaces. Use the equivalent neutral dark tokens in dark mode. Avoid decorative gradients and resting shadows.
- A 232px sidebar and two 32px content gutters frame desktop work. At 1100px and below, navigation becomes a labelled, keyboard-accessible disclosure. Phones use 16px gutters and controls at least 44px tall.
- One strong action per task. Secondary controls use a surface and border; selections use a neutral fill. Keep visible focus, disabled explanations and reduced-motion support.

## Screen priorities

**Discover:** Which opportunities should I consider? Search and results lead. Advanced filters and timing explanations use a disclosure. On a phone, repeated catalogue totals yield to the results count and feed status so jobs appear in the first viewport.

**AI Studio:** What is the next step for this application? Keep the selected job and five application stages visible. CV, ATS readiness and recommendations form one compact utility strip, with the document/review workspace taking most of the space. Provider settings remain a separate native dialog. No background model calls.

**My jobs / Saved / Applications:** Which job needs my next action? Keep titles, employer context, status and genuine actions prominent. Employer navigation never implies submission.

**Profile / Settings:** What am I changing, and when is it saved? Keep labels near inputs, retain explicit save behavior, and keep destructive actions separate.

## Verification

Use the actual app in desktop, tablet and phone layouts. Exercise navigation, focus/Escape, filters, job details, CV previews, editing and downloads. Taste Skill measurements are evidence, not a quality score. A long paginated job list is intentionally below the fold; its items are not separate dashboard sections. Peer job cards can vary in content, so judge blank-space warnings in context. Inspect fictional fixture screens for private CV flows and never use live paid requests as a design check.
