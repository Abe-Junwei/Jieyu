/** ADR-0085 初始表集。foreign_keys 与 journal_mode 按连接设置，不在这里。 */

export const DESKTOP_PROJECT_APPLICATION_ID = 0x4a59504a;

/** SQLite header offset 60. Bump when the table set changes; D14 freezes it. */
export const DESKTOP_PROJECT_USER_VERSION = 5;

export const DESKTOP_PROJECT_SCHEMA_SQL = `
CREATE TABLE project (
  id TEXT PRIMARY KEY,
  title_json TEXT NOT NULL CHECK (json_valid(title_json) AND json_type(title_json) = 'object'),
  settings_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings_json) AND json_type(settings_json) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  relpath TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  filename TEXT NOT NULL,
  duration REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE speakers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE manuscripts (
  id TEXT PRIMARY KEY,
  title_json TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES media(id),
  logical_duration_sec REAL CHECK (logical_duration_sec IS NULL OR logical_duration_sec > 0),
  time_mapping_json TEXT CHECK (
    time_mapping_json IS NULL OR (
      json_valid(time_mapping_json) AND json_type(time_mapping_json) = 'object'
    )
  ),
  time_mapping_history_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(time_mapping_history_json) AND json_type(time_mapping_history_json) = 'array'
  ),
  export_timeline_mode TEXT CHECK (
    export_timeline_mode IS NULL OR export_timeline_mode IN ('document', 'media')
  ),
  tier_roles_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(tier_roles_json) AND json_type(tier_roles_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE languages (
  id TEXT PRIMARY KEY,
  name_json TEXT NOT NULL CHECK (json_valid(name_json) AND json_type(name_json) = 'object'),
  language_code TEXT CHECK (language_code IS NULL OR length(language_code) > 0),
  canonical_tag TEXT CHECK (canonical_tag IS NULL OR length(canonical_tag) > 0),
  iso6391 TEXT CHECK (iso6391 IS NULL OR iso6391 GLOB '[a-z][a-z]'),
  iso6392b TEXT CHECK (iso6392b IS NULL OR iso6392b GLOB '[a-z][a-z][a-z]'),
  iso6392t TEXT CHECK (iso6392t IS NULL OR iso6392t GLOB '[a-z][a-z][a-z]'),
  iso6393 TEXT CHECK (iso6393 IS NULL OR iso6393 GLOB '[a-z][a-z][a-z]'),
  autonym TEXT CHECK (autonym IS NULL OR length(autonym) > 0),
  glottocode TEXT CHECK (glottocode IS NULL OR glottocode GLOB '[a-z][a-z][a-z][a-z][0-9][0-9][0-9][0-9]'),
  wikidata_id TEXT CHECK (wikidata_id IS NULL OR length(wikidata_id) > 0),
  scope TEXT CHECK (scope IS NULL OR scope IN (
    'individual', 'macrolanguage', 'collection', 'special', 'private-use'
  )),
  macrolanguage TEXT CHECK (macrolanguage IS NULL OR length(macrolanguage) > 0),
  genus TEXT CHECK (genus IS NULL OR length(genus) > 0),
  subfamily TEXT CHECK (subfamily IS NULL OR length(subfamily) > 0),
  branch TEXT CHECK (branch IS NULL OR length(branch) > 0),
  classification_path TEXT CHECK (classification_path IS NULL OR length(classification_path) > 0),
  modality TEXT CHECK (modality IS NULL OR modality IN ('spoken', 'signed', 'written', 'mixed')),
  language_type TEXT CHECK (language_type IS NULL OR language_type IN (
    'living', 'historical', 'extinct', 'ancient', 'constructed', 'special'
  )),
  endangerment_level TEXT CHECK (endangerment_level IS NULL OR endangerment_level IN (
    'safe', 'vulnerable', 'definitely_endangered', 'severely_endangered', 'critically_endangered', 'extinct'
  )),
  aes_status TEXT CHECK (aes_status IS NULL OR aes_status IN (
    'not_endangered', 'threatened', 'shifting', 'moribund', 'nearly_extinct', 'extinct'
  )),
  endangerment_source TEXT CHECK (endangerment_source IS NULL OR length(endangerment_source) > 0),
  endangerment_assessment_year INTEGER,
  speaker_count_l1 INTEGER CHECK (speaker_count_l1 IS NULL OR speaker_count_l1 >= 0),
  speaker_count_l2 INTEGER CHECK (speaker_count_l2 IS NULL OR speaker_count_l2 >= 0),
  speaker_count_source TEXT CHECK (speaker_count_source IS NULL OR length(speaker_count_source) > 0),
  speaker_count_year INTEGER,
  speaker_trend TEXT CHECK (speaker_trend IS NULL OR speaker_trend IN (
    'growing', 'stable', 'shrinking', 'unknown'
  )),
  countries_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(countries_json) AND json_type(countries_json) = 'array'),
  countries_official_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(countries_official_json) AND json_type(countries_official_json) = 'array'
  ),
  macroarea TEXT CHECK (macroarea IS NULL OR macroarea IN (
    'Africa', 'Eurasia', 'Papunesia', 'Australia', 'North America', 'South America'
  )),
  administrative_divisions_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(administrative_divisions_json) AND json_type(administrative_divisions_json) = 'array'
  ),
  intergenerational_transmission TEXT CHECK (
    intergenerational_transmission IS NULL OR intergenerational_transmission IN (
      'all_ages', 'adults_only', 'elderly_only', 'very_few', 'none'
    )
  ),
  domains_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(domains_json) AND json_type(domains_json) = 'array'),
  official_status TEXT CHECK (official_status IS NULL OR official_status IN (
    'national', 'regional', 'recognized_minority', 'none'
  )),
  egids TEXT CHECK (egids IS NULL OR length(egids) > 0),
  documentation_level TEXT CHECK (documentation_level IS NULL OR documentation_level IN (
    'undocumented', 'marginally', 'fragmentary', 'fair', 'well_documented'
  )),
  dialects_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dialects_json) AND json_type(dialects_json) = 'array'),
  vernaculars_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(vernaculars_json) AND json_type(vernaculars_json) = 'array'
  ),
  writing_systems_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(writing_systems_json) AND json_type(writing_systems_json) = 'array'
  ),
  literacy_rate REAL CHECK (literacy_rate IS NULL OR literacy_rate >= 0),
  latitude REAL,
  longitude REAL,
  location_id TEXT CHECK (location_id IS NULL OR length(location_id) > 0),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'built-in-generated', 'built-in-reviewed', 'user-override', 'user-custom'
  )),
  review_status TEXT CHECK (review_status IS NULL OR review_status IN ('needs-review', 'verified')),
  visibility TEXT CHECK (visibility IS NULL OR visibility IN ('visible', 'hidden')),
  notes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(notes_json) AND json_type(notes_json) = 'object'),
  custom_fields_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(custom_fields_json) AND json_type(custom_fields_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX languages_iso6393 ON languages(iso6393) WHERE iso6393 IS NOT NULL;
CREATE UNIQUE INDEX languages_glottocode ON languages(glottocode) WHERE glottocode IS NOT NULL;

CREATE TABLE language_display_names (
  id TEXT PRIMARY KEY,
  language_id TEXT NOT NULL REFERENCES languages(id),
  locale TEXT NOT NULL CHECK (length(locale) > 0),
  role TEXT NOT NULL CHECK (role IN (
    'preferred', 'autonym', 'exonym', 'historical', 'menu', 'academic', 'search'
  )),
  value TEXT NOT NULL CHECK (length(value) > 0),
  is_preferred INTEGER NOT NULL DEFAULT 0 CHECK (is_preferred IN (0, 1)),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'built-in-generated', 'built-in-reviewed', 'user-override', 'user-custom'
  )),
  review_status TEXT CHECK (review_status IS NULL OR review_status IN ('needs-review', 'verified')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE language_aliases (
  id TEXT PRIMARY KEY,
  language_id TEXT NOT NULL REFERENCES languages(id),
  alias TEXT NOT NULL CHECK (length(alias) > 0),
  normalized_alias TEXT NOT NULL CHECK (length(normalized_alias) > 0),
  locale TEXT CHECK (locale IS NULL OR length(locale) > 0),
  alias_type TEXT NOT NULL CHECK (alias_type IN ('search', 'display', 'legacy', 'short', 'variant')),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'built-in-generated', 'built-in-reviewed', 'user-override', 'user-custom'
  )),
  review_status TEXT CHECK (review_status IS NULL OR review_status IN ('needs-review', 'verified')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX language_aliases_normalized ON language_aliases(normalized_alias);

-- This slice does not delete languages. The foreign key is NO ACTION, not CASCADE.
CREATE TABLE language_catalog_history (
  id TEXT PRIMARY KEY,
  language_id TEXT NOT NULL REFERENCES languages(id),
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  summary TEXT NOT NULL CHECK (length(summary) > 0),
  changed_fields_json TEXT CHECK (
    changed_fields_json IS NULL OR (
      json_valid(changed_fields_json) AND json_type(changed_fields_json) = 'array'
    )
  ),
  reason TEXT CHECK (reason IS NULL OR length(reason) > 0),
  reason_code TEXT CHECK (reason_code IS NULL OR length(reason_code) > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE orthographies (
  id TEXT PRIMARY KEY,
  language_id TEXT NOT NULL REFERENCES languages(id),
  name_json TEXT NOT NULL CHECK (json_valid(name_json) AND json_type(name_json) = 'object'),
  abbreviation TEXT CHECK (abbreviation IS NULL OR length(abbreviation) > 0),
  type TEXT CHECK (type IS NULL OR type IN ('phonemic', 'phonetic', 'practical', 'historical', 'other')),
  script_tag TEXT CHECK (script_tag IS NULL OR length(script_tag) > 0),
  locale_tag TEXT CHECK (locale_tag IS NULL OR length(locale_tag) > 0),
  region_tag TEXT CHECK (region_tag IS NULL OR length(region_tag) > 0),
  variant_tag TEXT CHECK (variant_tag IS NULL OR length(variant_tag) > 0),
  direction TEXT CHECK (direction IS NULL OR direction IN ('ltr', 'rtl', 'ttb', 'btt')),
  catalog_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(catalog_metadata_json) AND json_type(catalog_metadata_json) = 'object'
  ),
  exemplar_characters_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(exemplar_characters_json) AND json_type(exemplar_characters_json) = 'object'
  ),
  normalization_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(normalization_json) AND json_type(normalization_json) = 'object'
  ),
  collation_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(collation_json) AND json_type(collation_json) = 'object'
  ),
  font_preferences_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(font_preferences_json) AND json_type(font_preferences_json) = 'object'
  ),
  input_hints_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(input_hints_json) AND json_type(input_hints_json) = 'object'
  ),
  bidi_policy_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(bidi_policy_json) AND json_type(bidi_policy_json) = 'object'
  ),
  conversion_rules_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(conversion_rules_json) AND json_type(conversion_rules_json) = 'object'
  ),
  notes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(notes_json) AND json_type(notes_json) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE orthography_bridges (
  id TEXT PRIMARY KEY,
  source_orthography_id TEXT NOT NULL REFERENCES orthographies(id),
  target_orthography_id TEXT NOT NULL REFERENCES orthographies(id),
  name_json TEXT CHECK (name_json IS NULL OR (json_valid(name_json) AND json_type(name_json) = 'object')),
  engine TEXT NOT NULL CHECK (engine IN ('table-map', 'icu-rule', 'manual')),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json) AND json_type(rules_json) = 'object'),
  sample_input TEXT,
  sample_output TEXT,
  sample_cases_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(sample_cases_json) AND json_type(sample_cases_json) = 'array'
  ),
  notes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(notes_json) AND json_type(notes_json) = 'object'),
  is_reversible INTEGER NOT NULL DEFAULT 0 CHECK (is_reversible IN (0, 1)),
  status TEXT CHECK (status IS NULL OR status IN ('draft', 'active', 'deprecated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE layers (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id),
  key TEXT NOT NULL,
  name_json TEXT NOT NULL,
  tier_type TEXT NOT NULL CHECK (tier_type IN (
    'time-aligned', 'time-subdivision', 'symbolic-subdivision', 'symbolic-association'
  )),
  content_type TEXT NOT NULL CHECK (content_type IN (
    'transcription', 'translation', 'gloss', 'pos', 'note', 'custom'
  )),
  language_id TEXT REFERENCES languages(id),
  orthography_id TEXT REFERENCES orthographies(id),
  parent_id TEXT,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (manuscript_id, key),
  UNIQUE (id, manuscript_id),
  FOREIGN KEY (parent_id, manuscript_id) REFERENCES layers (id, manuscript_id)
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  layer_id TEXT NOT NULL REFERENCES layers(id),
  speaker_id TEXT REFERENCES speakers(id),
  parent_unit_id TEXT,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL CHECK (end_time >= start_time),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  analysis_graph_json TEXT CHECK (
    analysis_graph_json IS NULL OR (
      json_valid(analysis_graph_json) AND json_type(analysis_graph_json) = 'object'
    )
  ),
  analysis_generation INTEGER NOT NULL DEFAULT 0 CHECK (analysis_generation >= 0),
  graph_fingerprint TEXT NOT NULL DEFAULT '' CHECK (
    graph_fingerprint = '' OR length(graph_fingerprint) = 64
  ),
  CHECK (
    (analysis_graph_json IS NULL AND graph_fingerprint = '') OR
    (analysis_graph_json IS NOT NULL AND length(graph_fingerprint) = 64)
  )
);

CREATE TRIGGER units_parent_same_manuscript_insert
BEFORE INSERT ON units
WHEN NEW.parent_unit_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'parent unit must belong to the same manuscript')
  WHERE (
    SELECT layers.manuscript_id
    FROM units
    JOIN layers ON layers.id = units.layer_id
    WHERE units.id = NEW.parent_unit_id
  ) IS NOT (
    SELECT manuscript_id FROM layers WHERE id = NEW.layer_id
  );
END;

CREATE TRIGGER units_parent_same_manuscript_update
BEFORE UPDATE OF parent_unit_id, layer_id ON units
WHEN NEW.parent_unit_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'parent unit must belong to the same manuscript')
  WHERE (
    SELECT layers.manuscript_id
    FROM units
    JOIN layers ON layers.id = units.layer_id
    WHERE units.id = NEW.parent_unit_id
  ) IS NOT (
    SELECT manuscript_id FROM layers WHERE id = NEW.layer_id
  );
END;

CREATE TABLE unit_texts (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  token_index INTEGER NOT NULL,
  form TEXT NOT NULL,
  UNIQUE (unit_id, token_index)
);

CREATE TABLE morphemes (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES tokens(id),
  morpheme_index INTEGER NOT NULL,
  form TEXT NOT NULL,
  UNIQUE (token_id, morpheme_index)
);

CREATE TABLE lexemes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('entry', 'resource')),
  entry_json TEXT CHECK (
    entry_json IS NULL OR (json_valid(entry_json) AND json_type(entry_json) = 'object')
  ),
  resource_json TEXT CHECK (
    resource_json IS NULL OR (json_valid(resource_json) AND json_type(resource_json) = 'object')
  ),
  jieyu_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(jieyu_json) AND json_type(jieyu_json) = 'object'
  ),
  tags_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(tags_json) AND json_type(tags_json) = 'object'
  ),
  access_rights TEXT CHECK (
    access_rights IS NULL OR access_rights IN ('open', 'restricted', 'confidential')
  ),
  provenance_json TEXT CHECK (
    provenance_json IS NULL OR (
      json_valid(provenance_json) AND json_type(provenance_json) = 'object'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kind = 'entry' AND entry_json IS NOT NULL AND resource_json IS NULL) OR
    (kind = 'resource' AND resource_json IS NOT NULL AND entry_json IS NULL)
  )
);

CREATE UNIQUE INDEX lexemes_one_resource ON lexemes(kind) WHERE kind = 'resource';

CREATE TABLE token_lexeme_links (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('token', 'morpheme')),
  target_id TEXT NOT NULL,
  lexeme_id TEXT NOT NULL REFERENCES lexemes(id),
  sense_id TEXT CHECK (sense_id IS NULL OR length(sense_id) > 0),
  role TEXT CHECK (role IS NULL OR role IN ('exact', 'stem', 'gloss_candidate', 'manual')),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  provenance_json TEXT CHECK (
    provenance_json IS NULL OR (
      json_valid(provenance_json) AND json_type(provenance_json) = 'object'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX token_lexeme_links_target ON token_lexeme_links(target_type, target_id);
CREATE INDEX token_lexeme_links_lexeme ON token_lexeme_links(lexeme_id, sense_id);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('layer', 'unit', 'token', 'morpheme')),
  target_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id),
  label TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER project_title_nonempty_insert
BEFORE INSERT ON project
WHEN NEW.title_json IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'project title needs a nonempty string')
  WHERE NOT EXISTS (
    SELECT 1 FROM json_each(NEW.title_json)
    WHERE json_each.type = 'text' AND json_each.value <> ''
  );
END;

CREATE TRIGGER project_title_nonempty_update
BEFORE UPDATE OF title_json ON project
WHEN NEW.title_json IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'project title needs a nonempty string')
  WHERE NOT EXISTS (
    SELECT 1 FROM json_each(NEW.title_json)
    WHERE json_each.type = 'text' AND json_each.value <> ''
  );
END;
`;
