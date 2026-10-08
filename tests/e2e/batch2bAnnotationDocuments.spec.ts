/**
 * rev5 切片 2B-E：标注文档身份与可预览的事务替换（T18、T22 的 E2E 部分）。
 * rev5 slice 2B-E: annotation document identity and previewed transactional replace (E2E halves of T18/T22).
 */
import { test, expect, type Page } from '@playwright/test';

import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

type DocState = {
  defaultDocumentId?: string;
  documents: Array<{ id: string; isDefault: boolean; sourceIds?: string[] }>;
  unitIds: string[];
  sourceCount: number;
  tierDocumentIds: Array<string | null>;
};

function eaf(values: string[]): string {
  // 样例录音只有 0.3 秒，语段都放在里面 | The sample recording is 0.3 s; keep every segment inside it
  const slots = values
    .map(
      (_, i) =>
        `<TIME_SLOT TIME_SLOT_ID="ts${2 * i + 1}" TIME_VALUE="${i * 90}" />` +
        `<TIME_SLOT TIME_SLOT_ID="ts${2 * i + 2}" TIME_VALUE="${i * 90 + 60}" />`,
    )
    .join('\n    ');
  const annotations = values
    .map(
      (value, i) => `<ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${i + 1}" TIME_SLOT_REF1="ts${2 * i + 1}" TIME_SLOT_REF2="ts${2 * i + 2}">
        <ANNOTATION_VALUE>${value}</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>`,
    )
    .join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="2026-10-09T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="e2e-field-sample.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./e2e-field-sample.wav" />
  </HEADER>
  <TIME_ORDER>
    ${slots}
  </TIME_ORDER>
  <TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt">
    ${annotations}
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;
}

async function readDocState(page: Page, textId: string): Promise<DocState> {
  return page.evaluate(async (id) => {
    type Where = { equals: (v: string) => { toArray: () => Promise<unknown[]> } };
    type Table = { where: (k: string) => Where; get: (k: string) => Promise<unknown> };
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          texts: Table;
          annotation_documents: Table;
          layer_units: Table;
          source_records: Table;
          tier_definitions: Table;
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const text = (await dexie.texts.get(id)) as { defaultDocumentId?: string } | undefined;
    const documents = (await dexie.annotation_documents
      .where('textId')
      .equals(id)
      .toArray()) as DocState['documents'];
    const units = (await dexie.layer_units.where('textId').equals(id).toArray()) as Array<{
      id: string;
    }>;
    const sources = await dexie.source_records.where('textId').equals(id).toArray();
    const tiers = (await dexie.tier_definitions.where('textId').equals(id).toArray()) as Array<{
      key: string;
      documentId?: string;
    }>;
    return {
      ...(text?.defaultDocumentId ? { defaultDocumentId: text.defaultDocumentId } : {}),
      documents,
      unitIds: units.map((u) => u.id).sort(),
      sourceCount: sources.length,
      tierDocumentIds: tiers
        .filter((tier) => tier.key.startsWith('bridge_'))
        .map((tier) => tier.documentId ?? null),
    };
  }, textId);
}

async function pickAnnotationFile(page: Page, name: string, body: string): Promise<void> {
  const input = page.locator(
    'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
  );
  await input.setInputFiles({ name, mimeType: 'application/xml', buffer: Buffer.from(body) });
  await expect(
    page.getByRole('button', { name: /开始导入标注|Start annotation import/i }),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('Slice 2B-E: annotation documents', () => {
  test('T18/T22: re-import previews the replace; cancel keeps everything; confirm replaces in place', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await waitForDexie(page);

    // 新建项目即有一个 UUID 默认文档 | A new project already has one UUID default document
    const initial = await readDocState(page, project.textId);
    expect(initial.defaultDocumentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(initial.documents).toEqual([
      expect.objectContaining({ id: initial.defaultDocumentId, isDefault: true }),
    ]);

    await pickAnnotationFile(page, 'Story.eaf', eaf(['one', 'two', 'three']));
    await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();
    await expect
      .poll(async () => (await readDocState(page, project.textId)).sourceCount, { timeout: 60_000 })
      .toBe(1);
    await expect
      .poll(async () => (await readDocState(page, project.textId)).unitIds.length, {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(3);
    const afterFirst = await readDocState(page, project.textId);
    expect(afterFirst.defaultDocumentId).toBe(initial.defaultDocumentId);
    expect(afterFirst.documents).toHaveLength(1);
    expect(afterFirst.documents[0]?.sourceIds).toHaveLength(1);
    expect(afterFirst.tierDocumentIds.length).toBeGreaterThan(0);
    for (const docId of afterFirst.tierDocumentIds) {
      expect([null, initial.defaultDocumentId]).toContain(docId);
    }

    // 再次导入：先看到替换预览，取消后数据不变 | Re-import: preview first; cancel changes nothing
    await pickAnnotationFile(page, 'Story-v2.eaf', eaf(['uno']));
    const preview = page.getByTestId('annotation-import-replace-preview');
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toHaveAttribute('data-unit-count', String(afterFirst.unitIds.length));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(取消|Cancel)$/ })
      .click();
    await expect(preview).toBeHidden();
    expect(await readDocState(page, project.textId)).toEqual(afterFirst);

    // 确认后在同一文档里替换 | Confirm replaces inside the same document
    await pickAnnotationFile(page, 'Story-v2.eaf', eaf(['uno']));
    await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();
    await expect
      .poll(async () => (await readDocState(page, project.textId)).sourceCount, { timeout: 60_000 })
      .toBe(2);
    const afterReplace = await readDocState(page, project.textId);
    expect(afterReplace.defaultDocumentId).toBe(initial.defaultDocumentId);
    expect(afterReplace.documents).toHaveLength(1);
    expect(afterReplace.documents[0]?.sourceIds).toHaveLength(2);
    expect(afterReplace.unitIds.length).toBeLessThan(afterFirst.unitIds.length);
    for (const id of afterReplace.unitIds) expect(afterFirst.unitIds).not.toContain(id);
  });
});
