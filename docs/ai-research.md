# Résumé / ATS research notes

Implementation updated 3 November 2026; upstream research reviewed 21 October 2026. These projects informed the design; JobCompass's matching, diagnostics and validation code is an original TypeScript implementation. Their popularity or feature claims do not establish measured accuracy against employers' ATS products.

| Project                                                               | Observed licence                                                            | Relevant design idea                                                            | JobCompass implementation                                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Resume Matcher](https://github.com/srbhr/Resume-Matcher)             | [Apache-2.0](https://github.com/srbhr/Resume-Matcher/blob/main/LICENSE)     | Job-specific résumé selection, preservation checks, provider choice             | Evidence-linked requirement review, validated original excerpts, user-selected provider/model     |
| [OpenResume](https://github.com/xitanggg/open-resume)                 | [AGPL-3.0](https://github.com/xitanggg/open-resume/blob/main/LICENSE)       | Visible parser output and recognisable résumé sections                          | Original PDF/DOCX candidate parser with source references, geometry risks and an editable preview |
| [Reactive Resume](https://github.com/reactive-resume/reactive-resume) | [MIT](https://github.com/reactive-resume/reactive-resume/blob/main/LICENSE) | User-controlled résumé editing, portable output and privacy-conscious workflows | Private snapshots, explicit provider consent, editable Word drafts and verified exports           |

The runtime PDF extractor is [unpdf](https://github.com/unjs/unpdf), pinned at 1.9.1 with an MIT licence and a serverless PDF.js build. Import bounds page count and releases the document's loading task after extraction. Literal text symbols are retained for the user's preview.

Primary source details:

- OpenResume's [section grouping](https://github.com/xitanggg/open-resume/blob/main/src/app/lib/parse-resume-from-pdf/group-lines-into-sections.ts) demonstrates that structural parsing uses heuristics and highlights the importance of a visible preview. JobCompass independently checks PDF item coordinates and stream order; it does not copy OpenResume code or claim to detect every layout.
- Resume Matcher's [tailored-résumé validation](https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/app/mcp_server/tools/validate_tailored_resume.py) and [prompt guardrail tests](https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/tests/unit/test_prompt_guardrails.py) illustrate separating model instructions from preservation checks. JobCompass independently verifies exact source quotes, flags new skill/metric claims against saved evidence, and reads exported Word body text back against the saved revision.
- Reactive Resume's [README](https://github.com/reactive-resume/reactive-resume/blob/main/README.md) describes résumé and cover-letter editing. JobCompass provides private editable Word drafts, with separate original-format and clean-layout export paths.

The accuracy strategy is to make uncertainty visible and auditable: show the actual job requirement, quote the relevant résumé text, distinguish direct and transferable evidence, and ask for missing information. The implementation has no benchmark proving a particular ATS pass rate and does not market one.

## Reproducible local checks

The source-linked parser report, requirement classification and export readback run without model calls. `/api/ai/ats` stays behind the existing AI Studio account gate, checks ownership and saved revision, and returns private no-store responses. Saved PDF and Word sources can be inspected without re-uploading.

See [benchmark results and known gaps](ats-benchmark.md) for the 20 synthetic files and independently authored expected fields. These measure development regressions, not employer ATS acceptance or interview outcomes. There is no OCR claim; empty text layers require a readable original or reviewed transcription. Word readback verifies readable body text rather than rendered pagination.
