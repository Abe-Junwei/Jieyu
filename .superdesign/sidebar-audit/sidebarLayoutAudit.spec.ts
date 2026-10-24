import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { importMediaViaDialog, seedThreeSegmentsOnCurrentProject, waitForDexie } from './_helpers/transcriptionProjectFlow';
import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';

test('capture expanded sidebar geometry and live summaries', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);
  await importMediaViaDialog(page, { name: 'sidebar-audit.wav', mimeType: 'audio/wav', buffer: Buffer.from(buildMinimalWavBytes(4)) });
  await createTranscriptionAndTranslationLayersViaLeftRail(page, {
    transcription: { languageSearch: 'Chinese', optionName: /Chinese|中文|汉语|zho/i, iso6393: 'zho' },
    translation: { languageSearch: 'French', optionName: /French|法语|fra/i, iso6393: 'fra' },
  });
  const project = await seedThreeSegmentsOnCurrentProject(page);
  const eaf = `<?xml version="1.0" encoding="UTF-8"?><ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="2026-10-24T00:00:00Z" FORMAT="3.0" VERSION="3.0"><HEADER MEDIA_FILE="" TIME_UNITS="milliseconds"><MEDIA_DESCRIPTOR MEDIA_URL="sidebar-audit.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./sidebar-audit.wav" /></HEADER><TIME_ORDER><TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0"/><TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000"/></TIME_ORDER><TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt"><ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>Sidebar review sentence</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION></TIER><LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false"/></ANNOTATION_DOCUMENT>`;
  await page.locator('input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]').setInputFiles({ name: 'sidebar.eaf', mimeType: 'application/xml', buffer: Buffer.from(eaf) });
  await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();
  await expect.poll(() => page.evaluate(async () => (globalThis as any).__jieyuDexie__.source_records.count()), { timeout: 60_000 }).toBeGreaterThan(0);
  const scope = `?textId=${project.textId}&mediaId=${project.mediaId}`;
  const observations: unknown[] = [];
  for (const [width, height, paneWidth, scale] of [
    [1440, 900, 272, 1], [1280, 720, 240, 1], [1280, 720, 420, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ paneWidth, scale }) => {
      localStorage.setItem('jieyu-side-pane-width', String(paneWidth));
      document.documentElement.style.setProperty('--ui-font-scale', String(scale));
    }, { paneWidth, scale });
    for (const [name, route] of [
      ['home', '/'], ['transcription', `/transcription${scope}`],
      ['annotation', `/annotation${scope}`], ['lexicon', '/lexicon'],
      ['corpus', `/corpus${scope}`], ['analysis', `/analysis${scope}`],
    ]) {
      await page.goto(route);
      await expect(page.locator('.app-side-pane')).toBeVisible();
      await page.locator('.app-side-pane-resizer').focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < (paneWidth === 240 ? 2 : paneWidth === 420 ? 7 : 0); i++) {
        await page.keyboard.press(paneWidth === 240 ? 'ArrowLeft' : 'ArrowRight');
      }
      await page.evaluate((scale) => document.documentElement.style.setProperty('--ui-font-scale', String(scale)), scale);
      await expect(page.locator('.app-side-pane-title')).not.toHaveText('');
      // Allow asynchronous workspace data and portal placement to settle before measurement.
      await page.waitForTimeout(1000);
      const geometry = await page.locator('.app-side-pane').evaluate((pane) => {
        const rect = pane.getBoundingClientRect();
        return {
          text: (pane as HTMLElement).innerText,
          width: rect.width,
          height: rect.height,
          children: Array.from(pane.querySelectorAll('.app-side-pane-body-slot > *, .app-side-pane-group, .app-side-pane-segment-list-scroll, .annotation-document-tools')).map((el) => {
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return { className: el.className, top: r.top, bottom: r.bottom, height: r.height, width: r.width, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowY: style.overflowY };
          }),
        };
      });
      observations.push({ name, width, height, paneWidth, scale, geometry });
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${paneWidth}-${scale}.png`) });
    }
  }
  for (const [name, selector] of [['language-metadata', '.lm-shell'], ['structural-profiles', '.lm-shell'], ['orthographies', '.om-shell'], ['orthography-bridges', '.ob-shell']]) {
    await page.goto(`/assets/${name}`);
    await expect(page.locator(selector).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`asset-${name}.png`) });
    observations.push({ name, shell: await page.locator(selector).first().innerText() });
  }
  await page.goto('/lexicon');
  await page.getByTestId('lexicon-entry-create').click();
  await page.getByTestId('lexicon-entry-headword').fill('Sidebar review long headword with several words');
  await page.getByTestId('lexicon-entry-translation').fill('original glossary');
  await page.getByTestId('lexicon-entry-save').click();
  await expect(page.getByTestId('lexicon-entry-delete')).toBeVisible();
  await expect(page.locator('.app-side-pane')).toContainText('original glossary');
  await page.getByTestId('lexicon-entry-translation').fill('updated glossary');
  await page.getByTestId('lexicon-entry-save').click();
  await page.waitForTimeout(600);
  observations.push({ name: 'lexicon-gloss-update', sidebar: await page.locator('.app-side-pane').innerText(), editor: await page.getByTestId('lexicon-entry-translation').inputValue() });
  await page.screenshot({ path: info.outputPath('lexicon-stale-summary.png') });
  await page.getByTestId('lexicon-entry-translation').fill('A long dictionary definition with detailed linguistic notes. '.repeat(40));
  await page.getByTestId('lexicon-entry-headword').fill('Long summary entry');
  await page.getByTestId('lexicon-entry-save').click();
  await expect(page.locator('.app-side-pane')).toContainText('A long dictionary definition');
  observations.push({ name: 'lexicon-long-summary', bounds: await page.locator('.app-side-pane-feature-stack').evaluate((el) => ({ height: el.getBoundingClientRect().height, bottom: el.getBoundingClientRect().bottom, scrollHeight: el.scrollHeight, parentBottom: el.parentElement?.getBoundingClientRect().bottom, parentOverflow: el.parentElement && getComputedStyle(el.parentElement).overflowY })) });
  await page.screenshot({ path: info.outputPath('lexicon-long-summary.png') });
  await page.goto(`/corpus${scope}`);
  await expect(page.locator('.corpus-library-workspace input[type="checkbox"]').first()).toBeVisible();
  const before = await page.locator('.app-side-pane').innerText();
  await page.locator('.corpus-library-workspace input[type="checkbox"]').first().check();
  await expect(page.getByTestId('corpus-library-copy-plain')).toBeEnabled();
  observations.push({ name: 'corpus-basket-update', before, after: await page.locator('.app-side-pane').innerText() });
  await page.screenshot({ path: info.outputPath('corpus-stale-basket.png') });
  writeFileSync(info.outputPath('observations.json'), JSON.stringify(observations, null, 2));
  await page.locator('.app-left-rail-footer button').last().click();
  if (await page.getByRole('tablist').isVisible()) {
    await page.screenshot({ path: info.outputPath('settings.png') });
    const firstTab = page.getByRole('tab').first();
    await firstTab.focus();
    await page.keyboard.press('ArrowDown');
    observations.push({ name: 'settings-arrow-key', focused: await page.evaluate(() => document.activeElement?.textContent), selected: await page.getByRole('tab', { selected: true }).innerText() });
    await page.keyboard.press('Escape');
  }
  writeFileSync(info.outputPath('observations.json'), JSON.stringify(observations, null, 2));
  await info.attach('sidebar-observations', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
});
