# Résumé / ATS research notes

Reviewed 21 October 2026. These projects informed the design; JobCompass's matching, diagnostics and validation code is an original TypeScript implementation. Their popularity or feature claims do not establish measured accuracy against employers' ATS products.

| Project                                                               | Observed licence                                                            | Relevant design idea                                                            | JobCompass implementation                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Resume Matcher](https://github.com/srbhr/Resume-Matcher)             | [Apache-2.0](https://github.com/srbhr/Resume-Matcher/blob/main/LICENSE)     | Job-specific résumé selection, preservation checks, provider choice             | Evidence-linked requirement review, validated original excerpts, user-selected provider/model |
| [OpenResume](https://github.com/xitanggg/open-resume)                 | [AGPL-3.0](https://github.com/xitanggg/open-resume/blob/main/LICENSE)       | Visible parser output and recognisable résumé sections                          | Existing PDF/DOCX extraction, editable text preview and simple heading checks                 |
| [Reactive Resume](https://github.com/reactive-resume/reactive-resume) | [MIT](https://github.com/reactive-resume/reactive-resume/blob/main/LICENSE) | User-controlled résumé editing, portable output and privacy-conscious workflows | Private snapshots, explicit provider consent and downloadable text outlines                   |

The runtime PDF extractor is [unpdf](https://github.com/unjs/unpdf), pinned at 1.9.1 with an MIT licence and a serverless PDF.js build. Import bounds page count and releases the document's loading task after extraction. Literal text symbols are retained for the user's preview.

Primary source details:

- OpenResume's [section grouping](https://github.com/xitanggg/open-resume/blob/main/src/app/lib/parse-resume-from-pdf/group-lines-into-sections.ts) demonstrates that structural parsing uses heuristics and highlights the importance of a visible preview. JobCompass's plain-text checks explicitly do not claim to recreate its PDF-position parsing or detect all layouts.
- Resume Matcher's [tailored-résumé validation](https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/app/mcp_server/tools/validate_tailored_resume.py) and [prompt guardrail tests](https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/tests/unit/test_prompt_guardrails.py) illustrate separating model instructions from preservation checks. JobCompass independently verifies exact source quotes and avoids generated candidate claims in its extractive outline.
- Reactive Resume's [README](https://github.com/reactive-resume/reactive-resume/blob/main/README.md) describes résumé and cover-letter editing. JobCompass keeps the current release scoped to a review and evidence outline rather than representing it as a complete résumé builder.

The accuracy strategy is to make uncertainty visible and auditable: show the actual job requirement, quote the relevant résumé text, distinguish direct and transferable evidence, and ask for missing information. The implementation has no benchmark proving a particular ATS pass rate and does not market one.
