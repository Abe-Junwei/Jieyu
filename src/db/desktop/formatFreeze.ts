/**
 * D14 pin for the desktop project library.
 * The record is the frozen DDL, user_version, and rejection rule.
 * A later table change needs a new decision and a new record. There is no migrator.
 */
import { createHash } from 'node:crypto';
import {
  DESKTOP_PROJECT_APPLICATION_ID,
  DESKTOP_PROJECT_SCHEMA_SQL,
  DESKTOP_PROJECT_USER_VERSION,
} from './schema';

export const DESKTOP_FORMAT_FREEZE_RECORD_PATH = 'src/db/desktop/formatFreeze.record.json';

const FROZEN_REJECTION = 'project.sqlite is not a Jieyu project library';

export type DesktopFormatFreezeRecord = {
  userVersion: number;
  applicationId: number;
  schemaSha256: string;
  journalMode: string;
  migrator: boolean;
  rejection: string;
  tables: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    return null;
  }
  return value;
}

export function parseDesktopFormatFreezeRecord(raw: unknown): DesktopFormatFreezeRecord {
  const tables = isRecord(raw) ? stringList(raw.tables) : null;
  if (
    !isRecord(raw) ||
    typeof raw.userVersion !== 'number' ||
    typeof raw.applicationId !== 'number' ||
    typeof raw.schemaSha256 !== 'string' ||
    typeof raw.journalMode !== 'string' ||
    typeof raw.migrator !== 'boolean' ||
    typeof raw.rejection !== 'string' ||
    tables === null
  ) {
    throw new Error('desktop format freeze record is incomplete');
  }
  return {
    userVersion: raw.userVersion,
    applicationId: raw.applicationId,
    schemaSha256: raw.schemaSha256,
    journalMode: raw.journalMode,
    migrator: raw.migrator,
    rejection: raw.rejection,
    tables,
  };
}

function schemaTables(sql: string): string[] {
  return [...sql.matchAll(/^CREATE TABLE ([A-Za-z0-9_]+) \(/gm)].map((match) => match[1] ?? '');
}

/** Empty means the live schema still matches the frozen record. */
export function checkDesktopFormatFreeze(record: DesktopFormatFreezeRecord): string[] {
  const violations: string[] = [];
  if (record.userVersion !== DESKTOP_PROJECT_USER_VERSION) {
    violations.push(
      `user_version ${DESKTOP_PROJECT_USER_VERSION} does not match ${record.userVersion}`,
    );
  }
  if (record.applicationId !== DESKTOP_PROJECT_APPLICATION_ID) {
    violations.push(
      `application_id ${DESKTOP_PROJECT_APPLICATION_ID} does not match ${record.applicationId}`,
    );
  }
  const hash = createHash('sha256').update(DESKTOP_PROJECT_SCHEMA_SQL).digest('hex');
  if (record.schemaSha256 !== hash) {
    violations.push(`schema sha256 ${hash} does not match ${record.schemaSha256}`);
  }
  if (record.tables.join('\n') !== schemaTables(DESKTOP_PROJECT_SCHEMA_SQL).join('\n')) {
    violations.push('table list does not match the schema');
  }
  if (record.journalMode !== 'delete') violations.push('journal_mode is not delete');
  if (record.migrator !== false) violations.push('a migrator is not part of this freeze');
  if (record.rejection !== FROZEN_REJECTION) {
    violations.push('rejection message does not match the open rule');
  }
  return violations;
}
