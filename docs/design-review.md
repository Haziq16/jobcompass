# Workspace design refinement

Reviewed on 22 October 2026 using Impeccable's Operate/craft guidance and Taste Skill's app-screen workflow. Direction: **Achromatic Ledger**, seed `1631018160`, adapted to JobCompass's existing compass identity and green status accent. No photography, illustrative dashboards or invented product data were added.

## What changed

- Replaced the unloaded Inter declaration with an installed UI font stack. Standardized desktop/phone titles, raised tiny labels, removed decorative kickers and retained readable secondary metadata.
- Made navigation neutral and compact. Tablet and phone layouts use an accessible Menu disclosure; choosing a destination closes it. Keyboard Escape returns focus to the menu control.
- Moved advanced discovery filters and timing explanations behind a disclosure. Mobile omits repeated totals, keeps the result count and feed status, and puts the first job in the first viewport.
- Replaced AI Studio's gradient hero and three icon cards with a normal task header and one divided utility strip. Preserved the selected job, five application stages, provider dialog and original-format document workspace.
- Kept Word template formatting, request safeguards, private account data and explicit submission confirmation unchanged. Improved light/dark tokens and sign-out contrast. Fixed a tablet-only inherited grid rule that squeezed the draft queue into two narrow columns.

## Evidence and boundaries

| Measurement              | Before                                                        | After                                          |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| Discovery hard findings  | 3                                                             | 0 at 1440, 768 and 390px                       |
| Discovery title          | 36px desktop / 30px phone                                     | 28px / 24px                                    |
| Declared primary UI font | Inter, not loaded                                             | Segoe UI, rendered                             |
| Tiny tracked kickers     | Present                                                       | Removed from primary workspace headers         |
| Phone navigation         | All destinations permanently visible                          | Collapsed, labelled Menu                       |
| AI Studio hard findings  | Earlier UI used a decorative gradient and tiny toolkit labels | 0 in light/dark responsive fixture inspections |

Discovery before/after captures used the local catalogue while its normal background refresh progressed. Listing counts therefore differ between captures; this is not a change caused by the design work. AI Studio was inspected using the actual loaded CSS and markup captured from fictional browser fixtures. The separate live browser test exercises interactive state, document rendering, edits, downloads and application handoff. Static design captures do not test those behaviors.

Remaining measured warnings have bounded reasons:

- A paginated list intentionally contains more job cards than fit in one viewport. It is not an overview with 30 unrelated sections.
- Secondary metadata stays at 12–13px; job titles, controls and primary content carry more weight. No text is below the 11px measured floor.
- Employer descriptions and salary availability vary, so peer job cards can contain different amounts of space. The layout preserves a stable scan grid.
- The draft queue and CV editor are independent panes. Stretching the queue to match the full editor height would add empty space without helping the task.
- The source scanner also warns about `box-shadow: none` resets and remaining nondecorative employer-context labels. Rendered checks determine whether an actual defect exists.

## Visual critique

The screen questions are **which job should I consider?** for discovery and **what is the next step for this application?** for AI Studio. Search/results and the selected job/document now dominate those screens respectively.

1. The primary task is readable first; secondary settings and timing explanations recede.
2. Content shares consistent canvas edges. The tablet draft queue remains a usable single column instead of two squeezed columns.
3. Neutral chrome carries navigation. Green is reserved for status, evidence and the current application stage; Word document colours remain in the user's template.
4. Counts and ATS findings still come from the existing data. No new vanity numbers or fabricated completion percentages were introduced.
5. Empty, loading, disabled and missing-data states retain their existing meanings. Repeated mobile catalogue totals are omitted in favor of the result count.
6. There are no charts or legends to reconcile. Word formatting is shown in the sandboxed preview and checked by the document workflow tests.
7. Phone/tablet navigation folds, search stays reachable and horizontal overflow is checked. The full CV editor remains vertically scrollable by design.

This is a functional application refinement, not a claimed external jury rating. `DESIGN.md` records the shared direction and `PRODUCT.md` records the product constraints for future changes.

## P1 workflow fixes, 22 October 2026

The critique's lifecycle and mobile issues were addressed with a shared query/location search form, Discover / Shortlist / Applications / Job library navigation, explicit preparation copy and profile-setup links. Named-location filters combine with the job query; description skills are searchable, and old country-code links remain supported. Skipped status is a separate filter and can be restored in either layout. Advanced filters are collapsed initially.

Studio tools and upload preferences use disclosures. Once a CV is loaded, replacement/reuse controls collapse; source-view tabs fit one phone row. The continuation action follows the accuracy checkbox and never overlays the document. The original DOCX preview styles were not changed. Job save/view controls have at least 44px hit targets.

Profile load failures now offer Retry. Save failures keep the current editor draft and say it was not saved. Password recovery was explicitly deferred by the user ("SKIP FOR NOW"); no pretend email-reset flow was added. The two P2 findings remain outside this change.

Verification: 72 integration checks passed; a targeted final query/location/description-skill test also passed. The expanded browser release suite passed with fictional accounts, a simulated profile 503 and simulated AI, including first library card top below 650px at 390x844, CV editor top below 844px, non-overlapping continuation, 44px save targets, separate status/layout filters, and original-format CV round trips. Phone, tablet and desktop screenshots were reviewed. Physical iOS/Android devices were not available; these are browser viewport checks.
