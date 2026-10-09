// @vitest-environment node
/**
 * T57：冻结后基线 schema 不能再改；新版本必须声明 tier；rewriting 必须带 upgrader 和合成夹具测试。
 * T57: after the freeze the baseline schema cannot change; new versions declare a tier; rewriting
 * versions need an upgrader and a synthetic fixture test.
 *
 * 冻结时写记录：`npm run schema:freeze-record`（要求 JIEYU_DATA_FROZEN 为 true）。
 * Write the record at freeze time with `npm run schema:freeze-record` (requires JIEYU_DATA_FROZEN).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JIEYU_DATA_FROZEN } from '../../config/dataFreeze';
import { resolveMigrationPolicy } from './migrationPolicy';
import {
  buildSchemaFreezeRecord,
  checkSchemaFreeze,
  normalizeStoreSpec,
  parseSchemaFreezeRecord,
  SCHEMA_FREEZE_RECORD_PATH,
  type SchemaFreezeRecord,
} from './schemaFreeze';
import { JIEYU_SCHEMA_VERSIONS, type JieyuSchemaVersion } from './schemaVersions';
import {
  SYNTH_LEDGER_ADDITIVE,
  SYNTH_LEDGER_REWRITING,
  SYNTH_V1,
  SYNTH_V2_REWRITING,
  SYNTH_V3_UNDECLARED,
} from './__fixtures__/syntheticLedgers';

const repoRoot = process.cwd();
const fileExists = (path: string): boolean => existsSync(join(repoRoot, path));
const UPGRADERS_DIR = 'src/db/migration/upgraders';

function readRecordJson(): unknown {
  const path = join(repoRoot, SCHEMA_FREEZE_RECORD_PATH);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as unknown) : undefined;
}

function collectUpgraderSources(): { path: string; source: string }[] {
  const root = join(repoRoot, UPGRADERS_DIR);
  if (!existsSync(root)) return [];
  const result: { path: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\./.test(name)) {
        result.push({ path: relative(repoRoot, full), source: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return result;
}

const recordFrom = (versions: readonly JieyuSchemaVersion[]): SchemaFreezeRecord =>
  buildSchemaFreezeRecord(versions, null, new Date('2026-10-09T00:00:00Z'));

describe('T57 主库 schema 冻结检查 | main-DB schema freeze check', () => {
  it('当前账本满足冻结规则 | the current ledger satisfies every freeze rule', () => {
    if (process.env.JIEYU_WRITE_SCHEMA_FREEZE_RECORD === '1') {
      if (!JIEYU_DATA_FROZEN) {
        throw new Error('flip JIEYU_DATA_FROZEN to true before writing the freeze record');
      }
      const existing = parseSchemaFreezeRecord(readRecordJson());
      const record = buildSchemaFreezeRecord(JIEYU_SCHEMA_VERSIONS, existing);
      writeFileSync(
        join(repoRoot, SCHEMA_FREEZE_RECORD_PATH),
        `${JSON.stringify(record, null, 2)}\n`,
      );
    }
    const violations = checkSchemaFreeze({
      versions: JIEYU_SCHEMA_VERSIONS,
      frozen: JIEYU_DATA_FROZEN,
      recordJson: readRecordJson(),
      fileExists,
      upgraderSources: collectUpgraderSources(),
    });
    expect(violations).toEqual([]);
  });

  it('冻结后阻断策略不能关闭 | blocking policy cannot be switched off once frozen', () => {
    const policy = resolveMigrationPolicy(
      { gate: false, blockRewritingWithoutVerifiedSnapshot: false, abortUpgradeWhenBlocked: false },
      true,
    );
    expect(policy.gate).toBe(true);
    expect(policy.blockRewritingWithoutVerifiedSnapshot).toBe(true);
    expect(policy.abortUpgradeWhenBlocked).toBe(true);
  });
});

describe('T57 冻结规则（合成账本）| freeze rules on synthetic ledgers', () => {
  it('冻结但没有记录 → 违规 | frozen without a record is a violation', () => {
    const violations = checkSchemaFreeze({
      versions: [SYNTH_V1],
      frozen: true,
      recordJson: undefined,
      fileExists,
    });
    expect(violations.map((item) => item.kind)).toEqual(['missing-freeze-record']);
    expect(
      checkSchemaFreeze({ versions: [SYNTH_V1], frozen: false, recordJson: undefined, fileExists }),
    ).toEqual([]);
  });

  it('修改或删除已冻结的基线 → 违规 | changing or removing the frozen baseline fails', () => {
    const record = recordFrom([SYNTH_V1]);
    const changed: JieyuSchemaVersion = {
      version: 1,
      stores: { items: 'id, name, extra', notes: 'id, itemId' },
    };
    expect(
      checkSchemaFreeze({ versions: [changed], frozen: true, recordJson: record, fileExists }).map(
        (item) => item.kind,
      ),
    ).toEqual(['frozen-version-changed']);
    expect(
      checkSchemaFreeze({
        versions: [{ version: 2, stores: { items: 'id' } }],
        frozen: true,
        recordJson: record,
        fileExists,
        baselineVersion: 2,
      }).map((item) => item.kind),
    ).toEqual(['baseline-mismatch', 'frozen-version-removed']);
  });

  it('只调整索引顺序或空白不算修改 | reordering indexes or whitespace is not a change', () => {
    const record = recordFrom([SYNTH_V1]);
    const reordered: JieyuSchemaVersion = {
      version: 1,
      stores: { notes: 'id,itemId', items: 'id ,  name' },
    };
    expect(
      checkSchemaFreeze({ versions: [reordered], frozen: true, recordJson: record, fileExists }),
    ).toEqual([]);
    expect(normalizeStoreSpec('id, b, a')).toBe('id,a,b');
    expect(normalizeStoreSpec('id, a, b')).not.toBe(normalizeStoreSpec('a, id, b'));
  });

  it('冻结后新增 additive / rewriting 版本可以通过 | new declared versions after the freeze pass', () => {
    const record = recordFrom([SYNTH_V1]);
    for (const ledger of [SYNTH_LEDGER_ADDITIVE, SYNTH_LEDGER_REWRITING]) {
      expect(
        checkSchemaFreeze({ versions: ledger, frozen: true, recordJson: record, fileExists }),
      ).toEqual([]);
    }
  });

  it('新版本不声明 tier → 违规（并按 rewriting 要求 upgrader 和夹具）| undeclared tier fails', () => {
    const kinds = checkSchemaFreeze({
      versions: [...SYNTH_LEDGER_ADDITIVE, SYNTH_V3_UNDECLARED],
      frozen: true,
      recordJson: recordFrom([SYNTH_V1]),
      fileExists,
    }).map((item) => item.kind);
    expect(kinds).toEqual([
      'undeclared-tier',
      'rewriting-missing-upgrader',
      'rewriting-missing-fixture-test',
    ]);
  });

  it('声明 additive 但删除索引 → 违规 | declared additive while removing an index fails', () => {
    const violations = checkSchemaFreeze({
      versions: [SYNTH_V1, { version: 2, tier: 'additive', stores: { items: 'id' } }],
      frozen: false,
      recordJson: undefined,
      fileExists,
    });
    expect(violations.map((item) => item.kind)).toEqual(['additive-requires-rewrite']);
    expect(violations[0]?.message).toContain('index-removed');
  });

  it('rewriting 缺 upgrader 或夹具文件不存在 → 违规 | rewriting without upgrader/fixture fails', () => {
    const noUpgrader: JieyuSchemaVersion = {
      version: 2,
      tier: 'rewriting',
      stores: { items: 'id, name, displayName' },
      fixtureTest: 'src/db/migration/does-not-exist.test.ts',
    };
    expect(
      checkSchemaFreeze({
        versions: [SYNTH_V1, noUpgrader],
        frozen: false,
        recordJson: undefined,
        fileExists,
      }).map((item) => item.kind),
    ).toEqual(['rewriting-missing-upgrader', 'rewriting-missing-fixture-test']);
    expect(fileExists(SYNTH_V2_REWRITING.fixtureTest ?? '')).toBe(true);
  });

  it('upgrader 调用 fetch / WebCrypto → 违规 | upgraders calling fetch or WebCrypto fail', () => {
    const networked: JieyuSchemaVersion = {
      ...SYNTH_V2_REWRITING,
      upgrade: async () => {
        await fetch('https://example.invalid');
      },
    };
    const kinds = checkSchemaFreeze({
      versions: [SYNTH_V1, networked],
      frozen: false,
      recordJson: undefined,
      fileExists,
      upgraderSources: [
        {
          path: 'src/db/migration/upgraders/v2.ts',
          source: 'export const up = () => crypto.subtle.digest("SHA-256", new Uint8Array());',
        },
      ],
    }).map((item) => item.kind);
    expect(kinds).toEqual(['forbidden-api-in-upgrader', 'forbidden-api-in-upgrader']);
  });

  it('冻结记录只追加，不改写已冻结版本 | the record only appends and refuses drift', () => {
    const record = recordFrom([SYNTH_V1]);
    const extended = buildSchemaFreezeRecord(SYNTH_LEDGER_ADDITIVE, record);
    expect(extended.frozenAt).toBe(record.frozenAt);
    expect(extended.versions.map((item) => item.version)).toEqual([1, 2]);
    expect(extended.versions[0]).toEqual(record.versions[0]);
    expect(() =>
      buildSchemaFreezeRecord([{ version: 1, stores: { items: 'id' } }], record),
    ).toThrow(/refusing/);
    expect(parseSchemaFreezeRecord({ formatVersion: 99 })).toBeNull();
    expect(
      checkSchemaFreeze({
        versions: [SYNTH_V1],
        frozen: true,
        recordJson: { nope: 1 },
        fileExists,
      }).map((item) => item.kind),
    ).toEqual(['invalid-freeze-record']);
  });
});
