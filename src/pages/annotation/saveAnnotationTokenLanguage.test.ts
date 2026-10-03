import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { saveAnnotationTokenLanguage } from './saveAnnotationTokenLanguage';

describe('saveAnnotationTokenLanguage', () => {
  const now = '2026-09-30T00:00:00.000Z';

  beforeEach(async () => {
    await db.unit_tokens.clear();
  });

  it('keeps a gloss committed while the language read is still open', async () => {
    await db.unit_tokens.put({
      id: 'tok-lang',
      textId: 'text-lang',
      unitId: 'unit-lang',
      form: { default: 'dog' },
      gloss: { default: 'OLD' },
      pos: 'N',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sawRead = false;
    const original = db.unit_tokens.get.bind(db.unit_tokens);
    db.unit_tokens.get = ((key: string) => {
      const result = original(key);
      if (key !== 'tok-lang') return result;
      return result.then(async (row) => {
        sawRead = true;
        await gate;
        return row;
      });
    }) as typeof db.unit_tokens.get;
    try {
      const languageSave = saveAnnotationTokenLanguage('unit-lang', 'tok-lang', 'eng');
      await viWaitFor(() => sawRead);
      await LinguisticService.units.updateTokenGloss('tok-lang', 'NEW-HUMAN', 'default');
      release();
      await languageSave;
    } finally {
      db.unit_tokens.get = original;
    }
    const requery = await db.unit_tokens.get('tok-lang');
    expect(requery?.languageId).toBe('eng');
    expect(requery?.gloss?.default).toBe('NEW-HUMAN');
    expect(requery?.pos).toBe('N');
  });

  it('keeps a newer gloss when clearing language after a stale read', async () => {
    await db.unit_tokens.put({
      id: 'tok-lang-clear',
      textId: 'text-lang',
      unitId: 'unit-lang',
      form: { default: 'dog' },
      gloss: { default: 'OLD' },
      pos: 'N',
      languageId: 'bod',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sawRead = false;
    const original = db.unit_tokens.get.bind(db.unit_tokens);
    db.unit_tokens.get = ((key: string) => {
      const result = original(key);
      if (key !== 'tok-lang-clear') return result;
      return result.then(async (row) => {
        sawRead = true;
        await gate;
        return row;
      });
    }) as typeof db.unit_tokens.get;
    try {
      const languageSave = saveAnnotationTokenLanguage('unit-lang', 'tok-lang-clear', '');
      await viWaitFor(() => sawRead);
      await LinguisticService.units.updateTokenGloss('tok-lang-clear', 'NEW-HUMAN', 'default');
      release();
      await languageSave;
    } finally {
      db.unit_tokens.get = original;
    }
    const requery = await db.unit_tokens.get('tok-lang-clear');
    expect(requery?.languageId).toBeUndefined();
    expect(requery?.gloss?.default).toBe('NEW-HUMAN');
    expect(requery?.pos).toBe('N');
  });
});

async function viWaitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 2000) throw new Error('language read did not start');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
