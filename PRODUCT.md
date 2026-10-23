# JobCompass

JobCompass helps people discover employer-posted opportunities, save a private shortlist, prepare application documents and track application progress. People may use it repeatedly on a desktop while working on a CV, or briefly on a phone to review a job.

Public signup creates separate accounts. The website is public and the source repository is private. Account information, stored CVs, notes, applications, AI connections and review history belong to the signed-in workspace.

Discovery uses a shared catalogue of public Greenhouse, Lever and Ashby boards, with polling and source-availability limits. Personalized ranking uses the account's saved CV text and preferences. Skill mentions are evidence of a mention, not verified proficiency.

The optional AI Studio is currently owner-only and uses an explicitly selected personal provider key. Reviews and tailoring require explicit consent, have request safeguards and do not retry automatically. Uploaded DOCX templates retain their original document formatting; users review wording and final pagination. ATS readiness findings are heuristic parsing checks, not certification. Application submission remains the user's action on the employer's site.

The current product stack is Next.js, React, TypeScript, PostgreSQL, Prisma and Better Auth, with shared CSS and Lucide icons. Preserve the working routes, private data boundaries, provider safeguards, original document handling and manual submission confirmation while improving the interface.

Swipe matching is an owner-only website preview by default. Right swipes queue a job; they never submit applications. Match setup, decisions, priorities and undo persist per account. Work-authorization and sponsorship entries are context, not verified eligibility. Explicit negative pass reasons can gently affect ranking; ordinary passes do not infer broad preferences. Offline applications and native apps remain deferred. See docs/swipe-matching.md.

Application profile is an owner-only extension of swipe matching: seven confirmed fact sections, original CV suggestion review, an answer library and a missing-answer inbox. Questions are pasted by the user; this release does not automate employer forms or submit applications. Reuse requires matching meaning/context and fresh confirmation.
