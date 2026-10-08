/**
 * rev5 切片 2B-D：来源记录身份（T12、T14 的 E2E 部分）。
 * rev5 slice 2B-D: source record identity (E2E halves of T12 and T14).
 */
import { test, expect, type Page } from '@playwright/test';

import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

type SourceRow = {
  id: string;
  textId: string;
  originalName: string;
  displayName: string;
  sha256?: string;
  mediaId?: string;
};

function eaf(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="2026-10-09T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="e2e-field-sample.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./e2e-field-sample.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="200" />
  </TIME_ORDER>
  <TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>${value}</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;
}

async function readSources(page: Page, textId: string): Promise<SourceRow[]> {
  return page.evaluate(async (id) => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          source_records: {
            where: (k: string) => { equals: (v: string) => { toArray: () => Promise<unknown[]> } };
          };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    return (await dexie.source_records.where('textId').equals(id).toArray()) as SourceRow[];
  }, textId);
}

async function importAnnotationFile(
  page: Page,
  name: string,
  body: string,
  expectPlan?: { kind: string; text?: RegExp },
): Promise<void> {
  const input = page.locator(
    'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
  );
  await input.setInputFiles({
    name,
    mimeType: 'application/xml',
    buffer: Buffer.from(body, 'utf-8'),
  });
  const start = page.getByRole('button', { name: /开始导入标注|Start annotation import/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  if (expectPlan) {
    // 导入前先预览来源身份 | Source identity is previewed before importing
    const plan = page.getByTestId('annotation-import-source-plan');
    await expect(plan).toHaveAttribute('data-plan', expectPlan.kind, { timeout: 15_000 });
    if (expectPlan.text) await expect(plan).toContainText(expectPlan.text);
  }
  await start.click();
}

test.describe('Slice 2B-D: source record identity', () => {
  test('T12: Story.eaf then story.eaf with different content keep two records', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await waitForDexie(page);

    await importAnnotationFile(page, 'Story.eaf', eaf('first telling'), { kind: 'new' });
    await expect
      .poll(async () => (await readSources(page, project.textId)).length, { timeout: 60_000 })
      .toBe(1);

    await importAnnotationFile(page, 'story.eaf', eaf('second telling'), {
      kind: 'new',
      text: /story \(2\)\.eaf/,
    });
    await expect
      .poll(async () => (await readSources(page, project.textId)).length, { timeout: 60_000 })
      .toBe(2);

    const rows = await readSources(page, project.textId);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows.map((row) => row.displayName).sort()).toEqual(['Story.eaf', 'story (2).eaf']);
    expect(rows.map((row) => row.originalName).sort()).toEqual(['Story.eaf', 'story.eaf']);
    expect(rows[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.sha256).not.toBe(rows[1]?.sha256);

    // 文件列表按显示名区分两份 | The file list shows both, by display name
    await page.goto('/');
    const board = page.getByRole('region', {
      name: /Audio and transcription board|音频与转写语料看板/,
    });
    await expect(board.getByRole('link', { name: 'Story.eaf', exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expect(board.getByRole('link', { name: 'story (2).eaf', exact: true })).toBeVisible();
  });

  test('T14: same-name recordings never auto-link; a manual link survives a reload', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await waitForDexie(page);

    await page.evaluate(async ({ textId }) => {
      type Table = { put: (row: unknown) => Promise<unknown> };
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            media_items: Table;
            source_records: Table;
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      const at = '2099-10-09T00:00:00.000Z';
      for (const id of ['media_session_1', 'media_session_2']) {
        await dexie.media_items.put({
          id,
          textId,
          filename: 'session.wav',
          duration: 3,
          isOfflineCached: false,
          timelineKind: 'acoustic',
          byteLocation: 'none',
          availability: 'missing',
          createdAt: at,
        });
      }
      await dexie.source_records.put({
        id: '2bd00000-0000-4000-8000-000000000014',
        textId,
        originalName: 'session.eaf',
        displayName: 'session.eaf',
        format: 'eaf',
        importedAt: at,
        importBatchId: '2bd00000-0000-4000-8000-0000000000b1',
        storedBytes: false,
        linkedMediaFilename: 'session.wav',
        updatedAt: at,
      });
    }, project);

    await page.goto('/');
    const select = page.getByTestId('project-file-link-select');
    await expect(select).toBeVisible({ timeout: 25_000 });
    // 两条同名录音：不自动关联，也不给建议 | Two same-name recordings: no link, no suggestion
    await expect(select).toHaveValue('');
    await expect(select.locator('option', { hasText: /建议|suggested/i })).toHaveCount(0);
    expect((await readSources(page, project.textId))[0]?.mediaId).toBeUndefined();

    await select.selectOption('media_session_2');
    await expect
      .poll(async () => (await readSources(page, project.textId))[0]?.mediaId, {
        timeout: 15_000,
      })
      .toBe('media_session_2');

    await page.reload();
    await expect(page.getByTestId('project-file-link-select')).toHaveValue('media_session_2', {
      timeout: 25_000,
    });
    expect((await readSources(page, project.textId))[0]?.mediaId).toBe('media_session_2');
  });
});
