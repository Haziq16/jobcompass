# ATS development benchmark

Engine 2026-11-03.1. 29 scenarios, 29 passed.

Structured candidate fields: 72 exact matches, 0 extra predictions, 8 missed expected fields. Precision 100.0%; recall 90.0%.

Layout/text-risk checks: 20/20. Export tests cover intact text, loss, reordering and additions. Requirement tests cover demonstrated wording, negation, learning, citizenship and years.

Small, synthetic English-focused development corpus. Not employer ATS accuracy, population accuracy, interview prediction or multilingual certification. PDF fixtures use a simple text layer; complex fonts and OCR are not benchmarked.

Rerun: node --import=tsx scripts/ats-benchmark.ts --publish. Independent expected fields live in scripts/ats-fixtures.ts. Exact kind/value matching is used; confidence labels do not prove correctness. No real CVs, model calls or external uploads are used.
