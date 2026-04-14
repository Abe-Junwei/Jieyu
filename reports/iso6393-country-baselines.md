# ISO 639-3 country baselines (build rules)

Generated: 2026-04-14T01:15:31.886Z (from last `npm run data:iso6393-country-baselines`).

## Pinned inputs

- **Glottolog CLDF** `languages.csv`:  
  `https://raw.githubusercontent.com/glottolog/glottolog-cldf/v5.3/cldf/languages.csv`
- **CLDR supplemental**:  
  `https://raw.githubusercontent.com/unicode-org/cldr/release-46/common/supplemental/supplementalData.xml`

## Distribution (`distributionByIso6393`)

- Rows with `Level === "language"` only.
- Read `Countries` (space-separated ISO 3166-1 alpha-2); merge **all** languoids that share the same `ISO639P3code` into one sorted, deduped list per ISO 639-3.

## Official status (`officialByIso6393`)

- Scan `<territory type="XX">` blocks (two-letter regions only).
- For each `<languagePopulation />` with `officialStatus` in: **official**, **official_regional**, **de_facto_official**.
- Map BCP47 language subtag to ISO 639-3 (direct 3-letter, ISO 639-1 expansion via `iso-639-3`, IANA `language-tags` macrolanguage extlang paths). Skip unmapped tags.
- Territories: keep **alpha-2** only; skip UN M.49 numerics and other non–alpha-2 `type`.

## Macrolanguages

- For each ISO 639-3 row with `scope === "macrolanguage"` and an `iso6391` macrolanguage subtag, enumerate IANA extlang entries and map them to 639-3.
- **Per macrolanguage code** `M`:  
  `distribution[M] = union(direct Glottolog for M, union of distribution[member])`  
  `official[M] = union(direct CLDR for M, union of official[member])`  
  then sort/dedupe ISO2.

## Artifact size check

- Pretty-printed JSON is gzip-compressed in memory; build **fails** if gzip size exceeds **200000** bytes (see script constant).

## Machine-readable report

- `.tmp/iso6393-country-baselines-report.json` — counts and symmetric-diff sample vs official/distribution.
