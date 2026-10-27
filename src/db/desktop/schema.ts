/** ADR-0085 初始表集。foreign_keys 与 journal_mode 按连接设置，不在这里。 */

export const DESKTOP_PROJECT_APPLICATION_ID = 0x4a59504a;

/** SQLite header offset 60. Bump when the table set changes; D14 freezes it. */
export const DESKTOP_PROJECT_USER_VERSION = 19;

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
  name TEXT NOT NULL CHECK (length(name) > 0),
  pseudonym TEXT CHECK (pseudonym IS NULL OR length(pseudonym) > 0),
  gender TEXT CHECK (gender IS NULL OR length(gender) > 0),
  birth_year INTEGER,
  language_ids_json TEXT CHECK (
    language_ids_json IS NULL OR (
      json_valid(language_ids_json) AND json_type(language_ids_json) = 'array'
    )
  ),
  dialect TEXT CHECK (dialect IS NULL OR length(dialect) > 0),
  accent TEXT CHECK (accent IS NULL OR length(accent) > 0),
  role TEXT CHECK (role IS NULL OR role IN ('speaker', 'translator', 'annotator', 'researcher')),
  consent_status TEXT CHECK (
    consent_status IS NULL OR consent_status IN ('granted', 'restricted', 'anonymous')
  ),
  access_rights TEXT CHECK (
    access_rights IS NULL OR access_rights IN ('open', 'restricted', 'confidential')
  ),
  address TEXT CHECK (address IS NULL OR length(address) > 0),
  notes_json TEXT CHECK (
    notes_json IS NULL OR (json_valid(notes_json) AND json_type(notes_json) = 'object')
  ),
  field_revisions_json TEXT NOT NULL DEFAULT '{"name":0,"pseudonym":0,"gender":0,"birthYear":0,"languageIds":0,"dialect":0,"accent":0,"role":0,"consentStatus":0,"accessRights":0,"address":0,"notes":0}' CHECK (
    json_valid(field_revisions_json) AND json_type(field_revisions_json) = 'object'
  ),
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
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  lifecycle_generation INTEGER NOT NULL DEFAULT 0 CHECK (lifecycle_generation >= 0),
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
  provenance_json TEXT CHECK (
    provenance_json IS NULL OR (
      json_valid(provenance_json) AND json_type(provenance_json) = 'object'
    )
  ),
  updated_at TEXT NOT NULL
);

CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  token_index INTEGER NOT NULL CHECK (token_index >= 0),
  form_json TEXT NOT NULL CHECK (json_valid(form_json) AND json_type(form_json) = 'object'),
  gloss_json TEXT NOT NULL CHECK (json_valid(gloss_json) AND json_type(gloss_json) = 'object'),
  pos TEXT CHECK (pos IS NULL OR length(pos) > 0),
  provenance_json TEXT CHECK (
    provenance_json IS NULL OR (
      json_valid(provenance_json) AND json_type(provenance_json) = 'object'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (unit_id, token_index)
);

CREATE TABLE morphemes (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES tokens(id),
  morpheme_index INTEGER NOT NULL CHECK (morpheme_index >= 0),
  form_json TEXT NOT NULL CHECK (json_valid(form_json) AND json_type(form_json) = 'object'),
  gloss_json TEXT NOT NULL CHECK (json_valid(gloss_json) AND json_type(gloss_json) = 'object'),
  pos TEXT CHECK (pos IS NULL OR length(pos) > 0),
  provenance_json TEXT CHECK (
    provenance_json IS NULL OR (
      json_valid(provenance_json) AND json_type(provenance_json) = 'object'
    )
  ),
  surface_parts_json TEXT NOT NULL CHECK (
    json_valid(surface_parts_json) AND json_type(surface_parts_json) = 'array'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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
  lexeme_id TEXT NOT NULL,
  sense_id TEXT CHECK (sense_id IS NULL OR length(sense_id) > 0),
  role TEXT CHECK (role IS NULL OR role IN ('exact', 'stem', 'gloss_candidate', 'manual')),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  provenance_json TEXT CHECK (
    provenance_json IS NULL OR (
      json_valid(provenance_json) AND json_type(provenance_json) = 'object'
    )
  ),
  attachment TEXT NOT NULL DEFAULT 'active' CHECK (attachment IN ('active', 'detached')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX token_lexeme_links_target ON token_lexeme_links(target_type, target_id);
CREATE INDEX token_lexeme_links_lexeme ON token_lexeme_links(lexeme_id, sense_id);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  anchor_kind TEXT NOT NULL CHECK (anchor_kind IN (
    'project', 'manuscript', 'layer', 'unit', 'unit_text',
    'token', 'morpheme', 'analysis_node'
  )),
  project_id TEXT CHECK (project_id IS NULL OR length(project_id) > 0),
  manuscript_id TEXT CHECK (manuscript_id IS NULL OR length(manuscript_id) > 0),
  layer_id TEXT CHECK (layer_id IS NULL OR length(layer_id) > 0),
  unit_id TEXT CHECK (unit_id IS NULL OR length(unit_id) > 0),
  unit_text_id TEXT CHECK (unit_text_id IS NULL OR length(unit_text_id) > 0),
  token_id TEXT CHECK (token_id IS NULL OR length(token_id) > 0),
  morpheme_id TEXT CHECK (morpheme_id IS NULL OR length(morpheme_id) > 0),
  node_id TEXT CHECK (node_id IS NULL OR length(node_id) > 0),
  view TEXT CHECK (view IS NULL OR view IN ('timeline', 'waveform')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json) AND json_type(content_json) = 'object'),
  category TEXT CHECK (category IS NULL OR category IN (
    'comment', 'question', 'todo', 'linguistic', 'fieldwork', 'correction', 'topic'
  )),
  provenance_json TEXT CHECK (
    provenance_json IS NULL OR (
      json_valid(provenance_json) AND json_type(provenance_json) = 'object'
    )
  ),
  attachment TEXT NOT NULL DEFAULT 'active' CHECK (attachment IN ('active', 'detached')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (anchor_kind = 'project'
      AND project_id IS NOT NULL
      AND manuscript_id IS NULL AND layer_id IS NULL AND unit_id IS NULL
      AND unit_text_id IS NULL AND token_id IS NULL AND morpheme_id IS NULL
      AND node_id IS NULL AND view IS NULL)
    OR (anchor_kind = 'manuscript'
      AND manuscript_id IS NOT NULL
      AND layer_id IS NULL AND unit_id IS NULL
      AND unit_text_id IS NULL AND token_id IS NULL AND morpheme_id IS NULL
      AND node_id IS NULL AND view IS NULL)
    OR (anchor_kind = 'layer'
      AND manuscript_id IS NOT NULL AND layer_id IS NOT NULL
      AND unit_id IS NULL AND unit_text_id IS NULL AND token_id IS NULL
      AND morpheme_id IS NULL AND node_id IS NULL AND view IS NULL)
    OR (anchor_kind = 'unit'
      AND manuscript_id IS NOT NULL AND unit_id IS NOT NULL
      AND layer_id IS NULL AND unit_text_id IS NULL AND token_id IS NULL
      AND morpheme_id IS NULL AND node_id IS NULL)
    OR (anchor_kind = 'unit_text'
      AND manuscript_id IS NOT NULL AND unit_id IS NOT NULL AND unit_text_id IS NOT NULL
      AND layer_id IS NULL AND token_id IS NULL AND morpheme_id IS NULL
      AND node_id IS NULL AND view IS NULL)
    OR (anchor_kind = 'token'
      AND manuscript_id IS NOT NULL AND unit_id IS NOT NULL AND token_id IS NOT NULL
      AND layer_id IS NULL AND unit_text_id IS NULL AND morpheme_id IS NULL
      AND node_id IS NULL AND view IS NULL)
    OR (anchor_kind = 'morpheme'
      AND manuscript_id IS NOT NULL AND unit_id IS NOT NULL
      AND token_id IS NOT NULL AND morpheme_id IS NOT NULL
      AND layer_id IS NULL AND unit_text_id IS NULL AND node_id IS NULL AND view IS NULL)
    OR (anchor_kind = 'analysis_node'
      AND manuscript_id IS NOT NULL AND unit_id IS NOT NULL AND node_id IS NOT NULL
      AND layer_id IS NULL AND unit_text_id IS NULL AND token_id IS NULL
      AND morpheme_id IS NULL AND view IS NULL)
  )
);

CREATE INDEX notes_unit ON notes(unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX notes_token ON notes(unit_id, token_id) WHERE token_id IS NOT NULL;
CREATE INDEX notes_morpheme ON notes(unit_id, morpheme_id) WHERE morpheme_id IS NOT NULL;
CREATE INDEX notes_node ON notes(unit_id, node_id) WHERE node_id IS NOT NULL;

CREATE TABLE analysis_candidates (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  kind TEXT NOT NULL CHECK (kind IN ('suggestion', 'review-snapshot')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'rejected', 'accepted', 'stored')),
  graph_json TEXT NOT NULL CHECK (json_valid(graph_json) AND json_type(graph_json) = 'object'),
  graph_fingerprint TEXT NOT NULL,
  manuscript_generation INTEGER NOT NULL CHECK (manuscript_generation >= 0),
  analysis_generation INTEGER NOT NULL CHECK (analysis_generation >= 0),
  text TEXT NOT NULL,
  projection_json TEXT NOT NULL CHECK (
    json_valid(projection_json) AND json_type(projection_json) = 'object'
  ),
  links_json TEXT NOT NULL CHECK (json_valid(links_json) AND json_type(links_json) = 'array'),
  notes_json TEXT NOT NULL CHECK (json_valid(notes_json) AND json_type(notes_json) = 'array'),
  definition_revisions_json TEXT NOT NULL CHECK (
    json_valid(definition_revisions_json) AND json_type(definition_revisions_json) = 'array'
  ),
  redacted_definition_ids_json TEXT NOT NULL CHECK (
    json_valid(redacted_definition_ids_json) AND json_type(redacted_definition_ids_json) = 'array'
  ),
  actor_json TEXT CHECK (
    actor_json IS NULL OR (json_valid(actor_json) AND json_type(actor_json) = 'object')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kind = 'suggestion' AND status IN ('pending', 'rejected', 'accepted')) OR
    (kind = 'review-snapshot' AND status = 'stored')
  )
);

CREATE INDEX analysis_candidates_unit ON analysis_candidates(unit_id, kind, status);

CREATE TABLE custom_field_definitions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'project', 'manuscript', 'layer', 'unit', 'media', 'source', 'speaker', 'note',
    'conversation', 'message', 'language', 'orthography', 'orthography-bridge',
    'lexeme', 'lexeme-sense', 'analysis-node', 'analysis-relation'
  )),
  name_json TEXT NOT NULL CHECK (json_valid(name_json) AND json_type(name_json) = 'object'),
  description_json TEXT CHECK (
    description_json IS NULL OR (json_valid(description_json) AND json_type(description_json) = 'object')
  ),
  placeholder_json TEXT CHECK (
    placeholder_json IS NULL OR (json_valid(placeholder_json) AND json_type(placeholder_json) = 'object')
  ),
  help_text_json TEXT CHECK (
    help_text_json IS NULL OR (json_valid(help_text_json) AND json_type(help_text_json) = 'object')
  ),
  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'number', 'boolean', 'select', 'multiselect', 'url', 'ref'
  )),
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  default_value_json TEXT CHECK (default_value_json IS NULL OR json_valid(default_value_json)),
  pattern TEXT,
  min_value REAL,
  max_value REAL,
  target_types_json TEXT CHECK (
    target_types_json IS NULL OR (
      json_valid(target_types_json) AND json_type(target_types_json) = 'array'
    )
  ),
  cardinality TEXT CHECK (cardinality IS NULL OR cardinality IN ('one', 'many')),
  min_items INTEGER CHECK (min_items IS NULL OR min_items >= 0),
  max_items INTEGER CHECK (max_items IS NULL OR max_items >= 0),
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (pattern IS NULL OR field_type IN ('text', 'url')),
  CHECK ((min_value IS NULL AND max_value IS NULL) OR field_type = 'number'),
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value),
  CHECK (min_items IS NULL OR max_items IS NULL OR min_items <= max_items),
  CHECK (
    (field_type = 'ref' AND target_types_json IS NOT NULL AND cardinality IS NOT NULL) OR
    (field_type <> 'ref' AND target_types_json IS NULL AND cardinality IS NULL
      AND min_items IS NULL AND max_items IS NULL)
  ),
  CHECK (cardinality IS NULL OR cardinality <> 'one' OR max_items IS NULL OR max_items <= 1),
  CHECK (cardinality IS NULL OR cardinality <> 'one' OR min_items IS NULL OR min_items <= 1)
);

CREATE TABLE custom_field_options (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES custom_field_definitions(id),
  label_json TEXT NOT NULL CHECK (json_valid(label_json) AND json_type(label_json) = 'object'),
  sort_order INTEGER NOT NULL
);

CREATE INDEX custom_field_options_definition ON custom_field_options(definition_id, sort_order);

CREATE TABLE custom_field_values (
  definition_id TEXT NOT NULL REFERENCES custom_field_definitions(id),
  target_type TEXT NOT NULL CHECK (target_type IN (
    'project', 'manuscript', 'layer', 'unit', 'media', 'source', 'speaker', 'note',
    'conversation', 'message', 'orthography', 'orthography-bridge'
  )),
  target_id TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (definition_id, target_type, target_id)
);

CREATE INDEX custom_field_values_target ON custom_field_values(target_type, target_id);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id),
  label TEXT NOT NULL,
  external_id TEXT NOT NULL,
  field_revisions_json TEXT NOT NULL DEFAULT '{"label":0,"externalId":0}' CHECK (
    json_valid(field_revisions_json) AND json_type(field_revisions_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE diagnostic_deliveries (
  origin_project_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  event_seq INTEGER NOT NULL CHECK (event_seq >= 0),
  payload_hash TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK (
    json_valid(summary_json) AND json_type(summary_json) = 'object'
  ),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
  PRIMARY KEY (origin_project_id, operation_id, event_seq)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) > 0),
  mode TEXT CHECK (mode IS NULL OR mode IN ('assistant', 'analysis', 'review')),
  provider_id TEXT CHECK (provider_id IS NULL OR length(provider_id) > 0),
  model TEXT CHECK (model IS NULL OR length(model) > 0),
  archived INTEGER CHECK (archived IS NULL OR archived IN (0, 1)),
  cleared_at TEXT CHECK (cleared_at IS NULL OR length(cleared_at) > 0),
  field_revisions_json TEXT NOT NULL DEFAULT '{"title":0,"mode":0,"providerId":0,"model":0,"archived":0,"clearedAt":0}' CHECK (
    json_valid(field_revisions_json) AND json_type(field_revisions_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bibliography (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) > 0),
  authors_json TEXT CHECK (
    authors_json IS NULL OR (json_valid(authors_json) AND json_type(authors_json) = 'array')
  ),
  year INTEGER,
  publisher TEXT CHECK (publisher IS NULL OR length(publisher) > 0),
  doi TEXT CHECK (doi IS NULL OR length(doi) > 0),
  url TEXT CHECK (url IS NULL OR length(url) > 0),
  citation_key TEXT CHECK (citation_key IS NULL OR length(citation_key) > 0),
  source_type TEXT CHECK (
    source_type IS NULL OR source_type IN ('book', 'article', 'thesis', 'fieldnotes', 'grammar', 'other')
  ),
  notes_json TEXT CHECK (
    notes_json IS NULL OR (json_valid(notes_json) AND json_type(notes_json) = 'object')
  ),
  access_rights TEXT CHECK (
    access_rights IS NULL OR access_rights IN ('open', 'restricted', 'confidential')
  ),
  field_revisions_json TEXT NOT NULL DEFAULT '{"title":0,"authors":0,"year":0,"publisher":0,"doi":0,"url":0,"citationKey":0,"sourceType":0,"notes":0,"accessRights":0}' CHECK (
    json_valid(field_revisions_json) AND json_type(field_revisions_json) = 'object'
  ),
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

CREATE TABLE model_runs (
  id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(id),
  media_id TEXT NOT NULL REFERENCES media(id),
  layer_id TEXT NOT NULL REFERENCES layers(id),
  lifecycle_generation INTEGER NOT NULL CHECK (lifecycle_generation >= 0),
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  model_version TEXT NOT NULL CHECK (length(model_version) > 0),
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256) > 0),
  capability TEXT NOT NULL CHECK (capability = 'transcribe'),
  params_json TEXT NOT NULL CHECK (json_valid(params_json) AND json_type(params_json) = 'object'),
  range_start REAL NOT NULL,
  range_end REAL NOT NULL CHECK (range_end >= range_start),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error', 'cancelled', 'interrupted')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) > 0),
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  pending_count INTEGER NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  abandoned_count INTEGER NOT NULL DEFAULT 0 CHECK (abandoned_count >= 0),
  CHECK (
    (status = 'running' AND finished_at IS NULL) OR
    (status <> 'running' AND finished_at IS NOT NULL)
  ),
  CHECK (
    (status = 'error' AND error_code IS NOT NULL) OR
    (status <> 'error' AND error_code IS NULL)
  )
);

CREATE TABLE transcription_acceptances (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL REFERENCES model_runs(id),
  candidate_id TEXT NOT NULL CHECK (length(candidate_id) > 0),
  unit_id TEXT NOT NULL REFERENCES units(id),
  created_at TEXT NOT NULL,
  UNIQUE (run_id, candidate_id)
);

CREATE TABLE reception_batches (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'import', 'accept')),
  created_at TEXT NOT NULL
);

CREATE TABLE local_id_map (
  batch_id TEXT NOT NULL REFERENCES reception_batches(id),
  scope TEXT NOT NULL CHECK (scope IN ('node', 'relation', 'note')),
  local_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY (batch_id, scope, local_id)
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
