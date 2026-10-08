/**
 * JY-03：归属不可变中间件 | Ownership immutability middleware (JY-03)
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type LayerUnitDocType } from './index';
import {
  JieyuOwnershipImmutabilityError,
  createOwnershipImmutabilityMiddleware,
} from './ownershipImmutabilityMiddleware';
import { JIEYU_OWNERSHIP_IMMUTABLE_FIELDS } from './ownershipImmutabilityRules';

type Row = { id?: string; textId?: string; note?: string };

class ProbeDb extends Dexie {
  inbound!: Dexie.Table<Row, string>;
  outbound!: Dexie.Table<Row, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ inbound: 'id, textId', outbound: ', textId' });
    // 一个会在写入前改写值的 hook，用来证明中间件看到的是 hooks 之后的最终值
    // A hook that rewrites values before the write, proving the middleware sees post-hook values
    this.use(createOwnershipImmutabilityMiddleware({ inbound: ['textId'], outbound: ['textId'] }));
    this.inbound.hook('updating', (mods) => {
      if ((mods as Row).note === 'hook-moves') return { textId: 'p-hook' };
      return undefined;
    });
  }
}

let probe: ProbeDb;
let probeIndex = 0;

beforeEach(async () => {
  probeIndex += 1;
  probe = new ProbeDb(`ownership-probe-${probeIndex}`);
  await probe.open();
  await probe.inbound.put({ id: 'r1', textId: 'p-a', note: 'x' });
  await probe.outbound.put({ textId: 'p-a', note: 'x' }, 'k1');
});

afterEach(async () => {
  probe.close();
  await Dexie.delete(probe.name);
});

describe('ownership immutability middleware (inbound keys)', () => {
  it('rejects put / bulkPut that move an existing row and keeps the row', async () => {
    await expect(probe.inbound.put({ id: 'r1', textId: 'p-b' })).rejects.toBeInstanceOf(
      JieyuOwnershipImmutabilityError,
    );
    await expect(
      probe.inbound.bulkPut([
        { id: 'new', textId: 'p-b' },
        { id: 'r1', textId: 'p-b' },
      ]),
    ).rejects.toThrow(/cannot be moved/);
    expect(await probe.inbound.get('r1')).toMatchObject({ textId: 'p-a' });
    expect(await probe.inbound.get('new')).toBeUndefined();
  });

  it('allows same-owner rewrites and brand-new rows', async () => {
    await probe.inbound.put({ id: 'r1', textId: 'p-a', note: 'edited' });
    await probe.inbound.bulkPut([{ id: 'r2', textId: 'p-b' }]);
    expect(await probe.inbound.get('r1')).toMatchObject({ note: 'edited' });
    expect(await probe.inbound.get('r2')).toMatchObject({ textId: 'p-b' });
  });

  it('allows filling a missing owner on a legacy row', async () => {
    await probe.inbound.put({ id: 'legacy', note: 'no owner' });
    await probe.inbound.put({ id: 'legacy', textId: 'p-a' });
    expect(await probe.inbound.get('legacy')).toMatchObject({ textId: 'p-a' });
  });

  it('compares FINAL values for update / bulkUpdate / modify(object) / modify(function)', async () => {
    await expect(probe.inbound.update('r1', { textId: 'p-b' })).rejects.toBeInstanceOf(
      JieyuOwnershipImmutabilityError,
    );
    await expect(
      probe.inbound.bulkUpdate([{ key: 'r1', changes: { textId: 'p-b' } }]),
    ).rejects.toThrow(/cannot be moved/);
    await expect(probe.inbound.where('id').equals('r1').modify({ textId: 'p-b' })).rejects.toThrow(
      /cannot be moved/,
    );
    await expect(
      probe.inbound.toCollection().modify((row) => {
        row.textId = 'p-b';
      }),
    ).rejects.toThrow(/cannot be moved/);
    // 非归属字段照常可改 | Non-owner fields stay editable
    await probe.inbound.update('r1', { note: 'ok' });
    await probe.inbound.toCollection().modify((row) => {
      row.note = 'ok-2';
    });
    expect(await probe.inbound.get('r1')).toMatchObject({ textId: 'p-a', note: 'ok-2' });
  });

  it('sees values after Dexie hooks (sits below the hooks middleware)', async () => {
    await expect(probe.inbound.update('r1', { note: 'hook-moves' })).rejects.toThrow(
      /cannot be moved to "p-hook"/,
    );
    expect(await probe.inbound.get('r1')).toMatchObject({ textId: 'p-a', note: 'x' });
  });

  it('rolls back the whole transaction', async () => {
    await expect(
      probe.transaction('rw', probe.inbound, async () => {
        await probe.inbound.put({ id: 'r9', textId: 'p-a' });
        await probe.inbound.put({ id: 'r1', textId: 'p-b' });
      }),
    ).rejects.toThrow(/cannot be moved/);
    expect(await probe.inbound.get('r9')).toBeUndefined();
  });
});

describe('ownership immutability middleware (outbound keys)', () => {
  it('uses req.keys for outbound-key tables', async () => {
    await expect(probe.outbound.put({ textId: 'p-b' }, 'k1')).rejects.toBeInstanceOf(
      JieyuOwnershipImmutabilityError,
    );
    await expect(probe.outbound.bulkPut([{ textId: 'p-b' }], ['k1'])).rejects.toThrow(
      /cannot be moved/,
    );
    await probe.outbound.put({ textId: 'p-a', note: 'same owner' }, 'k1');
    await probe.outbound.put({ textId: 'p-b' }, 'k2');
    expect(await probe.outbound.get('k1')).toMatchObject({ textId: 'p-a', note: 'same owner' });
  });
});

describe('ownership immutability on the main database', () => {
  const NOW = '2026-10-09T00:00:00.000Z';

  beforeEach(async () => {
    await db.open();
    await Promise.all([db.layer_units.clear(), db.unit_tokens.clear(), db.speakers.clear()]);
  });

  it('covers project content and catalog owners; tokens keep their project', async () => {
    expect(JIEYU_OWNERSHIP_IMMUTABLE_FIELDS.layer_units).toEqual(['textId']);
    expect(JIEYU_OWNERSHIP_IMMUTABLE_FIELDS.speakers).toEqual(['textId']);
    expect(JIEYU_OWNERSHIP_IMMUTABLE_FIELDS.structural_rule_profiles).toEqual(['projectId']);
    expect(JIEYU_OWNERSHIP_IMMUTABLE_FIELDS.unit_tokens).toEqual(['textId']);
    expect(JIEYU_OWNERSHIP_IMMUTABLE_FIELDS.unit_morphemes).toEqual(['textId']);
    // 父引用不可变明确不覆盖（见规则文件说明）| Parent-ref immutability is documented as not covered
    expect(JIEYU_OWNERSHIP_IMMUTABLE_FIELDS.token_lexeme_links).toBeUndefined();

    const unit: LayerUnitDocType = {
      id: 'u-private',
      textId: 'proj-private',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.layer_units.put(unit);
    await expect(db.layer_units.put({ ...unit, textId: 'proj-shared' })).rejects.toBeInstanceOf(
      JieyuOwnershipImmutabilityError,
    );
    await expect(db.layer_units.update('u-private', { textId: 'proj-shared' })).rejects.toThrow(
      /cannot be moved/,
    );
    expect((await db.layer_units.get('u-private'))?.textId).toBe('proj-private');

    await db.speakers.put({
      id: 'spk',
      textId: 'proj-private',
      name: 'A',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await expect(
      db.speakers.put({
        id: 'spk',
        textId: 'proj-shared',
        name: 'A',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).rejects.toThrow(/cannot be moved/);

    await db.unit_tokens.put({
      id: 'tok',
      textId: 'proj-private',
      unitId: 'u-private',
      form: { default: 'a' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await expect(db.unit_tokens.update('tok', { textId: 'proj-shared' })).rejects.toThrow(
      /at field "textId"/,
    );
    // 同项目内改指父单元是合法编辑（拆分 / 合并）| Repointing inside a project is a legit edit
    await db.unit_tokens.update('tok', { unitId: 'u-private-2' });
  });
});
