# ISO 639-3 country baselines (build rules)

This file is overwritten on each successful `npm run data:iso6393-country-baselines` run (including a `Generated:` timestamp). The rules below mirror `scripts/build-iso6393-country-baselines.mjs`.

## Pinned inputs

- **Glottolog CLDF** `languages.csv`: `https://raw.githubusercontent.com/glottolog/glottolog-cldf/v5.3/cldf/languages.csv`
- **CLDR supplemental**: `https://raw.githubusercontent.com/unicode-org/cldr/release-46/common/supplemental/supplementalData.xml`

## Distribution (`distributionByIso6393`)

- Rows with `Level === "language"` only.
- Read `Countries` (space-separated ISO 3166-1 alpha-2); merge all languoids that share the same `ISO639P3code` into one sorted, deduped list per ISO 639-3.

## Official status (`officialByIso6393`)

- Scan `<territory type="XX">` blocks (two-letter regions only).
- For each `<languagePopulation />` with `officialStatus` in: **official**, **official_regional**, **de_facto_official**.
- Map BCP47 language subtag to ISO 639-3 (direct 3-letter, ISO 639-1 expansion via `iso-639-3`, IANA `language-tags` macrolanguage extlang paths). Unmapped tags are skipped.
- Territories: keep **alpha-2** only; skip UN M.49 numerics and other non–alpha-2 `type`.

## Macrolanguages

- For each ISO 639-3 row with `scope === "macrolanguage"` and an `iso6391` macrolanguage subtag, enumerate IANA extlang entries and map them to 639-3.
- Per macrolanguage code `M`: `distribution[M]` and `official[M]` are the union of any direct Glottolog/CLDR rows for `M` with the union over members, then ISO2 sort/dedupe.

## Artifact size check

- Pretty-printed JSON is gzip-compressed in memory; the build **fails** if gzip size exceeds **200000** bytes (see `MAX_ARTIFACT_GZIP_BYTES` in the script).

## Machine-readable report

- `.tmp/iso6393-country-baselines-report.json` — counts and symmetric-diff sample between distribution and official sets.
