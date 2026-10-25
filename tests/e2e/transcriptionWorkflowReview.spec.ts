import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import {
  importMediaViaDialog,
  readSegmentText,
  seedThreeSegmentsOnCurrentProject,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';
import { createTranscriptionAndTranslationLayersViaLeftRail } from './_helpers/layerCreationFlow';
import { buildMinimalWavBytes } from './_helpers/minimalWav';
import { trackPageErrors } from './_helpers/pageErrorFilter';

async function prepare(page: Page) {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);
  await importMediaViaDialog(page, {
    name: 'workflow-review.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(buildMinimalWavBytes(8)),
  });
  await createTranscriptionAndTranslationLayersViaLeftRail(page, {
    transcription: {
      languageSearch: 'Chinese',
      optionName: /Chinese|中文|汉语|zho/i,
      iso6393: 'zho',
    },
    translation: { languageSearch: 'French', optionName: /French|法语|fra/i, iso6393: 'fra' },
  });
  const project = await seedThreeSegmentsOnCurrentProject(page);
  await page.goto(
    `/transcription?textId=${project.textId}&mediaId=${project.mediaId}&unitId=seg_e2e_a&unitKind=segment`,
  );
  await expect(page.locator('.app-side-pane-segment-list-item-btn').first()).toContainText('alpha');
  return project;
}

async function openChat(page: Page) {
  const window = page.locator('.transcription-chat-window');
  if (!(await window.isVisible()))
    await page.locator('.transcription-chat-window-trigger:not(.is-hidden)').click();
  await expect(page.getByTestId('ai-chat-composer-input')).toBeVisible();
  return window;
}

test('paired and multi-track editing preserve text while playback and auxiliary panels remain usable', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  const project = await prepare(page);
  const play = page.getByRole('button', { name: /^Play$|^播放$/ }).first();
  await expect(play).toBeEnabled();
  const clock = page
    .locator('.waveform-left-status-item')
    .filter({ hasText: /Current|当前/ })
    .locator('.waveform-left-status-value');
  await page.getByRole('button', { name: /^Forward 10 seconds$|^前进 10 秒$/ }).click();
  await expect(clock).toContainText('00:08');
  await page.getByRole('button', { name: /^Back 10 seconds$|^后退 10 秒$/ }).click();
  await expect(clock).toContainText('00:00');
  const initialTime = await clock.innerText();
  await play.click();
  const pause = page.getByRole('button', { name: /^Pause$|^暂停$/ }).first();
  await expect(pause).toBeVisible();
  await expect.poll(() => clock.innerText()).not.toBe(initialTime);
  await pause.click();
  await page.getByTestId('left-rail-workspace-layout-toggle').click();
  const editor = page.locator('textarea.timeline-paired-reading-source-input').first();
  await expect(editor).toHaveValue('alpha');
  await editor.fill('IPA ʃa');
  await editor.press('End');
  await editor.press('Space');
  await expect(editor).toHaveValue('IPA ʃa ');
  await expect(play).toBeVisible();
  await editor.press('Backspace');
  await editor.press('Tab');
  await expect.poll(() => readSegmentText(page, 'seg_e2e_a', project.layerId)).toBe('IPA ʃa');
  await page.reload();
  await page.locator('.app-side-pane-segment-list-item-btn').filter({ hasText: 'IPA ʃa' }).click();
  await expect
    .poll(() =>
      page
        .locator('textarea.timeline-paired-reading-source-input')
        .evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLTextAreaElement).value).includes('IPA ʃa'),
        ),
    )
    .toBe(true);
  await page.getByTestId('left-rail-workspace-layout-toggle').click();
  await expect(page.locator('.timeline-lane-header').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('saved-multi-track.png') });
  expect(errors).toEqual([]);
});

test('acoustic and AI combinations preserve desktop bounds and editing space', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors = trackPageErrors(page);
  await prepare(page);
  await page.getByTestId('transcription-acoustic-inspector-toggle').click();
  await expect(page.getByTestId('transcription-acoustic-inspector')).toBeVisible();
  const chat = await openChat(page);
  const measurements: unknown[] = [];
  for (const [width, height, scale] of [
    [1440, 1000, 1],
    [1280, 720, 1],
    [1280, 720, 1.4],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      (value) => document.documentElement.style.setProperty('--ui-font-scale', String(value)),
      scale,
    );
    await expect(chat).toBeVisible();
    const bounds = await page.evaluate(() => {
      const selectors = [
        '.app-shell-body',
        '.app-main-transcription',
        '.transcription-screen',
        '.transcription-list-panel',
        '.transcription-chat-window',
        '.transcription-acoustic-inspector',
        '.transcription-list-main',
        '.transcription-waveform-area',
        '.transcription-list-toolbar',
      ];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        return {
          selector,
          rect: rect && {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            bottom: rect.bottom,
            right: rect.right,
          },
        };
      });
    });
    measurements.push({ width, height, scale, bounds });
    expect
      .soft(bounds.find((item) => item.selector === '.transcription-list-main')?.rect?.height)
      .toBeGreaterThanOrEqual(96);
    expect
      .soft(bounds.find((item) => item.selector === '.transcription-list-toolbar')?.rect?.bottom)
      .toBeLessThanOrEqual(height + 2);
    await page.screenshot({ path: info.outputPath(`panels-${width}-${height}-${scale}.png`) });
    const box = await chat.boundingBox();
    expect
      .soft(
        box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width + 2 &&
          box.y + box.height <= height + 2,
      )
      .toBe(true);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect.soft(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  }
  writeFileSync(info.outputPath('panel-measurements.json'), JSON.stringify(measurements, null, 2));
  expect(errors).toEqual([]);
});

test('modal dismissal and IME escape do not minimize the background AI window', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await prepare(page);
  const chat = await openChat(page);
  await page
    .locator('.left-rail-layer-actions-root')
    .getByRole('button', { name: /新建转写层|Create transcription layer/i })
    .click();
  const dialog = page.locator('.layer-action-dialog');
  await expect(dialog).toBeVisible();
  const focusable = dialog.locator(
    'button:enabled:visible, input:enabled:visible, select:enabled:visible, textarea:enabled:visible, [tabindex="0"]:visible',
  );
  await focusable.last().focus();
  await page.keyboard.press('Tab');
  await expect(focusable.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(focusable.last()).toBeFocused();
  await focusable
    .first()
    .dispatchEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.soft(chat).not.toHaveClass(/is-minimized/);
  await page.screenshot({ path: info.outputPath('after-modal-escape.png') });
  if (await chat.evaluate((el) => el.classList.contains('is-minimized')))
    await page.keyboard.press('Control+j');
  const input = page.getByTestId('ai-chat-composer-input');
  await input.focus();
  await input.dispatchEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true });
  await expect.soft(chat).not.toHaveClass(/is-minimized/);
});
