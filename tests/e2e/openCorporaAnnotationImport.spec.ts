/**
 * Real transcription-page import of local open-corpus EAF and FLEx files.
 * The annotation files are gitignored. Each case skips when the file is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { setupFieldProjectWithMediaAndSegments } from './_helpers/transcriptionProjectFlow';

const TABAQ = join(process.cwd(), 'tests/fixtures/open-corpora/elan/tabaq.eaf');
const SUNDANESE = join(
  process.cwd(),
  'tests/fixtures/open-corpora/flex/sundanese-north-wind.flextext',
);

const ANNOTATION_INPUT =
  'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]';

type ImportSnapshot = {
  texts: string[];
  tierKeys: string[];
  tierLabels: string[];
  noteTexts: string[];
  tokenForms: string[];
  tokenGlosses: string[];
  morphGlosses: string[];
};

async function readImportSnapshot(page: Page): Promise<ImportSnapshot> {
  return page.evaluate(async () => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          layer_unit_contents: { toArray: () => Promise<Array<{ text?: string }>> };
          tier_definitions: {
            toArray: () => Promise<Array<{ key?: string; name?: Record<string, string> }>>;
          };
          user_notes: { toArray: () => Promise<Array<{ content?: Record<string, string> }>> };
          unit_tokens: {
            toArray: () => Promise<
              Array<{ form?: Record<string, string>; gloss?: Record<string, string> }>
            >;
          };
          unit_morphemes: {
            toArray: () => Promise<Array<{ gloss?: Record<string, string> }>>;
          };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const texts = (await dexie.layer_unit_contents.toArray()).map((row) => row.text ?? '');
    const tiers = await dexie.tier_definitions.toArray();
    const notes = await dexie.user_notes.toArray();
    const tokens = await dexie.unit_tokens.toArray();
    const morphs = await dexie.unit_morphemes.toArray();
    return {
      texts,
      tierKeys: tiers.map((tier) => tier.key ?? ''),
      tierLabels: tiers.flatMap((tier) => Object.values(tier.name ?? {})),
      noteTexts: notes.flatMap((note) => Object.values(note.content ?? {})),
      tokenForms: tokens.flatMap((token) => Object.values(token.form ?? {})),
      tokenGlosses: tokens.flatMap((token) => Object.values(token.gloss ?? {})),
      morphGlosses: morphs.flatMap((morph) => Object.values(morph.gloss ?? {})),
    };
  });
}

async function passImportDialogs(page: Page, shotPrefix: string): Promise<void> {
  const start = page.getByRole('button', { name: /开始导入标注|Start annotation import/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await start.click();

  const roleDialog = page.getByRole('dialog', {
    name: /选择每一层的角色|Choose what each tier is/i,
  });
  const mismatchDialog = page.getByRole('dialog', {
    name: /时间轴长度不一致|Timeline length mismatch/i,
  });

  const first = await Promise.race([
    roleDialog.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'role' as const),
    mismatchDialog.waitFor({ state: 'visible', timeout: 25_000 }).then(() => 'mismatch' as const),
    page.waitForTimeout(8_000).then(() => 'quiet' as const),
  ]);

  if (first === 'role') {
    console.log(`ROLE ${shotPrefix}\n${await roleDialog.innerText()}`);
    await page.screenshot({
      path: `/opt/cursor/artifacts/${shotPrefix}-tier-roles.png`,
      fullPage: true,
    });
    await roleDialog.getByRole('button', { name: /^(确认导入|Import)$/ }).click();
    await expect(roleDialog).toBeHidden({ timeout: 20_000 });
  }

  const mismatchVisible =
    first === 'mismatch' ||
    (await mismatchDialog.isVisible().catch(() => false)) ||
    (await mismatchDialog
      .waitFor({ state: 'visible', timeout: first === 'quiet' ? 2_000 : 25_000 })
      .then(() => true)
      .catch(() => false));

  if (mismatchVisible) {
    console.log(`MISMATCH ${shotPrefix}\n${await mismatchDialog.innerText()}`);
    await page.screenshot({
      path: `/opt/cursor/artifacts/${shotPrefix}-mismatch.png`,
      fullPage: true,
    });
    await mismatchDialog.getByRole('checkbox').check();
    await mismatchDialog.getByRole('button', { name: /^(确认导入|Import)$/ }).click();
    await expect(mismatchDialog).toBeHidden({ timeout: 90_000 });
  }
}

test.describe('open-corpus annotation import', () => {
  test('imports Tabaq EAF through the transcription page', async ({ page }) => {
    test.skip(!existsSync(TABAQ), 'tabaq.eaf is not in this checkout');
    test.setTimeout(240_000);

    await setupFieldProjectWithMediaAndSegments(page);
    await page.locator(ANNOTATION_INPUT).setInputFiles({
      name: 'tabaq.eaf',
      mimeType: 'application/xml',
      buffer: readFileSync(TABAQ),
    });
    await passImportDialogs(page, 'tabaq-eaf');

    let snapshot: ImportSnapshot = {
      texts: [],
      tierKeys: [],
      tierLabels: [],
      noteTexts: [],
      tokenForms: [],
      tokenGlosses: [],
      morphGlosses: [],
    };
    await expect
      .poll(
        async () => {
          snapshot = await readImportSnapshot(page);
          const texts = snapshot.texts.join('\n');
          const notes = snapshot.noteTexts.join('\n');
          const layers = [...snapshot.tierKeys, ...snapshot.tierLabels].join('\n');
          return (
            texts.includes('aay idaye') &&
            texts.includes('Tabaq wedding') &&
            notes.includes('Sudanese Ar. yes') &&
            !layers.includes('ph@NHK')
          );
        },
        { timeout: 90_000 },
      )
      .toBe(true);

    const joinedTexts = snapshot.texts.join('\n');
    const joinedNotes = snapshot.noteTexts.join('\n');
    const joinedLabels = [...snapshot.tierKeys, ...snapshot.tierLabels].join('\n');
    expect(joinedTexts).toContain('aay idaye fɪtʊŋgala t̪aanɪnɪda');
    expect(joinedTexts).toContain('yes, if there is wedding , Tabaq wedding');
    expect(joinedTexts).not.toContain('10/Apr/2013');
    expect(joinedNotes).toContain('aay = Sudanese Ar. yes');
    expect(joinedNotes).not.toContain('10/Apr/2013');
    expect(joinedLabels).not.toContain('ph@NHK');
    expect(joinedLabels).not.toContain('nt@NHK');
    expect(joinedLabels).not.toContain('dt@NHK');

    const sentence = page.getByText('aay idaye fɪtʊŋgala t̪aanɪnɪda').first();
    await sentence.scrollIntoViewIfNeeded();
    await expect(sentence).toBeVisible();
    await expect(page.getByText('yes, if there is wedding , Tabaq wedding').first()).toBeVisible();
    await page.screenshot({
      path: '/opt/cursor/artifacts/tabaq-eaf-imported.png',
      fullPage: true,
    });
  });

  test('imports Sundanese FLEx through the transcription page', async ({ page }) => {
    test.skip(!existsSync(SUNDANESE), 'sundanese flextext is not in this checkout');
    test.setTimeout(240_000);

    await setupFieldProjectWithMediaAndSegments(page);
    await page.locator(ANNOTATION_INPUT).setInputFiles({
      name: 'sundanese-north-wind.flextext',
      mimeType: 'application/xml',
      buffer: readFileSync(SUNDANESE),
    });
    await passImportDialogs(page, 'sundanese-flex');

    let snapshot: ImportSnapshot = {
      texts: [],
      tierKeys: [],
      tierLabels: [],
      noteTexts: [],
      tokenForms: [],
      tokenGlosses: [],
      morphGlosses: [],
    };
    await expect
      .poll(
        async () => {
          snapshot = await readImportSnapshot(page);
          const texts = snapshot.texts.join('\n');
          return (
            texts.includes('Èta carita') &&
            snapshot.tokenForms.includes('Èta') &&
            snapshot.tokenGlosses.includes('that') &&
            snapshot.morphGlosses.includes('ACT')
          );
        },
        { timeout: 90_000 },
      )
      .toBe(true);

    expect(snapshot.texts.join('\n')).toContain('Èta carita téh nyaritakeun');
    expect(snapshot.texts.join('\n')).toContain(
      'This story tells that the North Wind and the Sun wanted to know who was the best.',
    );
    expect(snapshot.texts).not.toContain('that');
    expect(snapshot.tokenForms).toContain('Èta');
    expect(snapshot.tokenGlosses).toContain('that');
    expect(snapshot.morphGlosses).toContain('ACT');

    const sentence = page.locator('.app-side-pane-segment-list-item-text', {
      hasText: 'Èta carita',
    });
    await sentence.first().scrollIntoViewIfNeeded();
    await expect(sentence.first()).toBeVisible();
    await page.screenshot({
      path: '/opt/cursor/artifacts/sundanese-flex-imported.png',
      fullPage: true,
    });
  });
});
