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

**Job library / Shortlist / Applications:** Which job needs my next action? Keep titles, employer context, status and genuine actions prominent. Employer navigation never implies submission.

**Profile / Settings:** What am I changing, and when is it saved? Keep labels near inputs, retain explicit save behavior, and keep destructive actions separate.

## Verification

Use the actual app in desktop, tablet and phone layouts. Exercise navigation, focus/Escape, filters, job details, CV previews, editing and downloads. Taste Skill measurements are evidence, not a quality score. A long paginated job list is intentionally below the fold; its items are not separate dashboard sections. Peer job cards can vary in content, so judge blank-space warnings in context. Inspect fictional fixture screens for private CV flows and never use live paid requests as a design check.

Job lifecycle: Discover searches employer listings; saving adds a private copy to Shortlist and the complete Job library. Preparing creates an Applications tracker. Search uses the same query and named-location form in discovery and private collections; skipped status is a filter separate from browse layout. On phones, advanced filters, Studio tools and upload preferences use disclosures. Keep document controls and the next action near the current application; preserve explicit review and provider consent.

## Swipe discovery, 23 October 2026

Operate mode: one employer opportunity is the primary decision surface. Preserve the Achromatic Ledger typography and neutral shell. A quiet second card indicates continuation; green carries matching evidence and queue confirmation. Provide labelled Pass, Save for later, Interested and Undo controls alongside pointer gestures. Keep eligibility uncertainty visible, use a native detail dialog, and preserve reduced-motion support. Queue rows prioritise the role title, real state and next action. Responsive website layouts do not imply native mobile support.

**Application profile:** confirmation is the signature control. Keep seven sections navigable, drafts visibly distinct from confirmed facts, and CV extraction behind a source review. Use the existing neutral tokens and compact page title. Answer-library rows show question, answer, context and freshness together; expired or changed facts lead to review rather than silent reuse.

**Fill application:** show the queued role, selected CV and hiring country before one explicit Connect and fill action. Put the real employer-form report beside the next steps. Browser setup is a secondary, one-time task; keep unsupported-control and missing-answer explanations precise. The employer overlay must use isolated styles, legible text, labelled recheck/inbox actions and an explicit no-submission status.

## Automatic applications

Recovery is the primary task surface: show worker presence and actual allowance, then active tasks with states and exact blockers. Completed/stopped work belongs in history; configuration is reachable by a direct page anchor below the task list. A requirement-conflict/unknown/supported-form message precedes the swipe gesture. Application setup pairs current CV/employer authorization with the job-specific answer inbox and manual companion continuation. Confirmed and uncertain outcomes never carry generic restart instructions. Use the existing neutral surfaces, readable definition lists, native details and status text; avoid decorative metrics. See docs/application-reliability.md.

Operate mode, preserving Achromatic Ledger. A persistent processing status and pause action lead the page; explicit application rules share a responsive grid with four recent notifications. Task rows show actual states, employer context, missing-input links and outcome resolution. Latest 50 tasks are labeled as such. Desktop, tablet, phone and dark theme are verified with fixture-backed task history.

Recipient-specific automatic applications: when enabled, a plain disclosure above the draggable job card identifies the employer, original CV and confirmed contact/answer data. The positive action reads Authorise & apply (or Authorise & fill). Disclosure text is part of the keyboard-accessible card description and remains visible before a gesture, including on phones. Normal queue-only cards retain their existing behavior.
