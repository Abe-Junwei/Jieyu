/** ADR-0085 初始表集。foreign_keys 与 journal_mode 按连接设置，不在这里。 */

export const DESKTOP_PROJECT_APPLICATION_ID = 0x4a59504a;

/** SQLite header offset 60. Bump when the table set changes; D14 freezes it. */
export const DESKTOP_PROJECT_USER_VERSION = 1;

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
  language_id TEXT,
  orthography_id TEXT,
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
  updated_at TEXT NOT NULL
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
