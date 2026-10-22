# Employer candidate registry provenance

`src/data/catalog-candidates.json` contains employer identifiers and display names adapted from FreeHire's MIT-licensed source configuration at commit `96b53a2c7b1e545bbad0868e16ec85a2eba4f36a` (the revision before retirement of `sources/`). Upstream: https://github.com/strelov1/freehire/tree/96b53a2c7b1e545bbad0868e16ec85a2eba4f36a/sources . The MIT notice is retained in `docs/freehire-license.txt`.

This copies board configuration, not FreeHire's hosted job dataset. These are unverified candidates, not advertised active employers. JobCompass fetches and validates the employer endpoints itself; a complete valid snapshot and storage admission are required before activation. Candidates are deduplicated by platform/token, restricted to supported host patterns and ordered by a stable identity hash before insertion. EU Lever entries retain their region. No third-party executables or crawlers were run.

Source-file SHA-256 values:

- `greenhouse.yml`: `528bf5cf56e65ebe57269b055abdcad64f0aaddf3a201d0b8087dcde3fc5d6e2`
- `lever.yml`: `fb3443789c6a739890f8ca14c5ef787efad2611c300c6a2d2a7680c23ebcfc87`
- `ashby.yml`: `d9a7fc9f9ea8ea54294d75f12910321d2277d668d5011399dd0bbdc75effc6f5`
- `workable.yml`: `8710a39f6945c8768664279f159a2665f0b235e56161561afcf87995ddf4cc60`
- `recruitee.yml`: `3b21c187911f42bf30f75d3fd52cd8b26cd56ca470a19af52644f4a2155e9c12`
