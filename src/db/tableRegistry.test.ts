import { describe, expect, it } from 'vitest';
import { JIEYU_BASELINE_STORES } from './engine';
import {
  JIEYU_DATA_CLASS_IN_JYB,
  JIEYU_LOCAL_DB_REGISTRY,
  JIEYU_MAIN_TABLE_REGISTRY,
  LEGACY_RESET_DB_NAMES,
  PROJECT_CATALOG_TABLES,
  PROJECT_CATALOG_TEXT_ID_TABLES,
} from './tableRegistry';

describe('table registry (catalog list + data classification in one place)', () => {
  it('registers every baseline table exactly once', () => {
    expect(Object.keys(JIEYU_MAIN_TABLE_REGISTRY).sort()).toEqual(
      Object.keys(JIEYU_BASELINE_STORES).sort(),
    );
  });

  it('every catalog table declares an ownership field', () => {
    for (const name of PROJECT_CATALOG_TABLES) {
      expect(JIEYU_MAIN_TABLE_REGISTRY[name].ownerField, name).toBeDefined();
    }
    expect(PROJECT_CATALOG_TABLES).toContain('structural_rule_profiles');
    expect(PROJECT_CATALOG_TEXT_ID_TABLES).not.toContain('structural_rule_profiles');
    expect(PROJECT_CATALOG_TEXT_ID_TABLES).toContain('speakers');
    expect(PROJECT_CATALOG_TEXT_ID_TABLES).toContain('orthography_bridges');
  });

  it('credentials, collaboration state, derived data and recovery never go into JYB', () => {
    expect(JIEYU_DATA_CLASS_IN_JYB.credential).toBe(false);
    expect(JIEYU_DATA_CLASS_IN_JYB.collab_state).toBe(false);
    expect(JIEYU_DATA_CLASS_IN_JYB.derived).toBe(false);
    expect(JIEYU_DATA_CLASS_IN_JYB.recovery).toBe(false);
    expect(JIEYU_DATA_CLASS_IN_JYB.private_log).toBe(false);
  });

  it('8.1 reset scope: exactly five prompt-delete databases; voice, behavior and acoustic kept', () => {
    expect([...LEGACY_RESET_DB_NAMES].sort()).toEqual(
      [
        'jieyu-project-memory',
        'jieyu_collab_client_state',
        'jieyu_pre_migration_backups',
        'jieyu_recovery',
        'jieyudb_v2',
      ].sort(),
    );
    expect(JIEYU_LOCAL_DB_REGISTRY['jieyu-voice-sessions'].resetPolicy).toBe('keep');
    expect(JIEYU_LOCAL_DB_REGISTRY['jieyu-user-behavior'].resetPolicy).toBe('keep');
    expect(JIEYU_LOCAL_DB_REGISTRY['jieyu-acoustic-analysis'].resetPolicy).toBe('keep');
    expect(JIEYU_LOCAL_DB_REGISTRY.jieyu.resetPolicy).toBe('main');
  });
});
