import type { DesktopReadHost } from '../../src/desktop/projectReadHost';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page, type Locator,
} from '@playwright/test';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type FlowWindow = Window & { jieyuDesktop: Required<DesktopReadHost> };

const folder = process.env.JIEYU_DESKTOP_FLOW_FOLDER;
const devServer = process.env.JIEYU_VITE_DEV_SERVER;
const packagedApp = process.env.JIEYU_PACKAGED_APP;
const openFolder = /^(Open folder|打开文件夹|app\.desktopRead\.openFolder)$/;
const textLabel = /^(Text|正文|app\.desktopRead\.text)$/;
const saveText = /^(Save text|保存正文|app\.desktopRead\.saveText)$/;
const boundaryLabel = /^(Literature boundary|文献边界|app\.desktopRead\.boundary)$/;
const moveBoundary = /^(Move boundary|移动边界|app\.desktopRead\.moveBoundary)$/;
const edited = '0.0–0.2 edited';
const restoreAction = /^(Restore|恢复)$/;
const confirmRestore = /^(Continue restore|继续恢复)$/;
const cancelRestore = /^(Cancel|取消)$/;
const openCopy = /^(Open restored copy|打开恢复副本)$/;
const restoredMark = /Restored to |已恢复到 /;
const occupiedText =
  /^(That folder is not empty, so nothing was written|那个文件夹不是空的，没有写入)$/;
const restoreFailed = /^(Restore did not finish|没有恢复)$/;
const openFailed = /^(The restored copy did not open|没有打开恢复副本)$/;
const unreadableFolder = /^(Could not read this folder|没能读出这个文件夹)$/;
const reminderOpen = /^(Deletion reminders|删除提醒)$/;
const purgeManuscript = /^(Purge manuscript|清除文稿)$/;
const purgeConfirmTitle = /^(Purge this manuscript|清除这篇文稿)$/;
const purgeConfirm = /^(Confirm purge|确认清除)$/;
const deletedClip = /Manuscript Clip|文稿 Clip/;
const userDataOf = new WeakMap<ElectronApplication, string>();

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`desktop locale smoke: ${locale}`, async () => {
    const app = await launch(`locale-${locale}`, undefined, undefined, undefined, locale);
    try {
      const page = await app.firstWindow();
      expect(await page.evaluate(() => navigator.language)).toBe(locale);
      const label = locale === 'en-US' ? 'Open folder' : '打开文件夹';
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    } finally {
      await app.close();
    }
  });
}

test('renderer has no IndexedDB databases and stays on the desktop surface', async () => {
  const app = await launch('surface');
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: openFolder })).toBeVisible();
    await expect(page.getByTestId('desktop-unavailable')).toHaveCount(0);
    const names = await page.evaluate(async () => {
      const listed = await indexedDB.databases();
      return listed.map((item) => item.name ?? '').filter((name) => name !== '');
    });
    expect(names).toEqual([]);
  } finally {
    await app.close();
  }
});

test('transcription workspace seeks a segment and space starts playback', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const app = await launch('tx-readonly');
  try {
    await stubFolderDialog(app, folder);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Play|播放)$/ })).toBeEnabled();
    // 转写壳样式随桌面入口加载：主区铺满、侧栏顶对齐。
    const shell = await page.evaluate(() => ({
      main: getComputedStyle(document.querySelector('.app-main-transcription') as Element)
        .paddingTop,
      side: getComputedStyle(document.querySelector('.app-side-pane') as Element).top,
    }));
    expect(shell).toEqual({ main: '0px', side: '0px' });
    await waitForAudio(page);
    const segment = page.locator('.timeline-annotation', { hasText: 'two' });
    await segment.click();
    await expect(segment).toHaveClass(/timeline-annotation-selected/);
    const audio = page.locator('audio');
    await expect
      .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime))
      .toBeGreaterThan(0.3);
    await expect
      .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).paused))
      .toBe(true);
    await page.keyboard.press('Space');
    await expect
      .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).paused))
      .toBe(false);
  } finally {
    await app.close();
  }
});

test('speaker lanes split an overlap and keep the lock after reopen', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-speaker-lanes-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app: ElectronApplication | undefined = await launch('speaker-lanes');
  let again: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const { layerId } = await clipLayer(page, sessionId);
    const units = await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId });
    const target = units.find((unit) => unit.text === 'two') ?? units[0];
    if (target?.startMs == null || target.endMs == null) throw new Error('clip unit missing');
    const ada = await desktopCall<{ id: string }>(page, sessionId, 'speakers.create', {
      name: 'Ada',
    });
    const bai = await desktopCall<{ id: string }>(page, sessionId, 'speakers.create', {
      name: 'Bai',
    });
    await desktopCall(page, sessionId, 'speakers.assign', {
      speakerId: ada.id,
      unitIds: [target.id],
    });
    const other = await desktopCall<{ id: string }>(page, sessionId, 'units.create', {
      layerId,
      startMs: target.startMs,
      endMs: target.endMs,
      text: 'overlap',
    });
    await desktopCall(page, sessionId, 'speakers.assign', {
      speakerId: bai.id,
      unitIds: [other.id],
    });
    await desktopCall(page, sessionId, 'layers.replaceLaneLocks', {
      layerId,
      locks: [{ speakerId: bai.id, laneIndex: 1 }],
    });
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    await page.locator('.desktop-tx-layer-name').first().click({ button: 'right' });
    await page.getByRole('button', { name: /说话人轨道|Speaker tracks/ }).click();
    await page.getByRole('menuitemradio', { name: /^(自动分轨|Split overlaps)$/ }).click();
    await expect(page.getByTestId('speaker-name').filter({ hasText: 'Ada' })).toBeVisible();
    await expect(page.getByTestId('speaker-name').filter({ hasText: 'Bai' })).toBeVisible();
    const tops = await page
      .getByTestId('speaker-name')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBeGreaterThan(1);
    await app.close();
    app = undefined;
    again = await launch('speaker-lanes-again');
    await stubFolderDialog(again, copy);
    const reopened = await again.firstWindow();
    await rememberChosenSession(again);
    await reopened.getByRole('button', { name: openFolder }).click();
    await expect(reopened.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const nextSession = await chosenSessionId(again);
    const manuscripts = await desktopCall<{ id: string; title: Record<string, string> }[]>(
      reopened,
      nextSession,
      'manuscripts.list',
      {},
    );
    const clip = manuscripts.find((item) => item.title.und === 'Clip');
    if (clip === undefined) throw new Error('clip manuscript missing');
    const locks = await desktopCall<{ speakerId: string; laneIndex: number }[]>(
      reopened,
      nextSession,
      'layers.listLaneLocks',
      { manuscriptId: clip.id },
    );
    expect(locks).toEqual([{ layerId, speakerId: bai.id, laneIndex: 1 }]);
  } finally {
    await app?.close();
    await again?.close();
  }
});

test('layer structure creates a translation layer and reads it back', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-layer-structure-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app: ElectronApplication | undefined = await launch('layer-structure');
  let again: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    const layers = page.getByRole('button', { name: /^(层|Layers)\s*\d*$/ });
    const expand = page.getByRole('button', { name: /^(展开功能面板|Expand feature panel)$/ });
    await expect(async () => {
      if (await layers.isVisible()) return;
      await expand.first().click();
      await expect(layers).toBeVisible();
    }).toPass();
    await layers.click();
    await openLayerHeaderMenu(page);
    await page.getByRole('button', { name: /^(新建层|New layer)$/ }).click();
    await page.getByRole('menuitem', { name: /^(新建翻译层|New translation layer)$/ }).click();
    const created = page.locator('.desktop-tx-layer-name', {
      hasText: /^(译文|Translation)$/,
    });
    await expect(created).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const listed = await desktopCall<{ key: string; contentType: string }[]>(
      page,
      sessionId,
      'layers.list',
      {
        manuscriptId: (
          await desktopCall<{ id: string; title: Record<string, string> }[]>(
            page,
            sessionId,
            'manuscripts.list',
            {},
          )
        ).find((item) => item.title.und === 'Clip')?.id,
      },
    );
    expect(listed.some((item) => item.contentType === 'translation')).toBe(true);
    await app.close();
    app = undefined;
    again = await launch('layer-structure-again');
    await stubFolderDialog(again, copy);
    const reopened = await again.firstWindow();
    await reopened.getByRole('button', { name: openFolder }).click();
    await expect(reopened.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await reopened.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(
      reopened.locator('.desktop-tx-layer-name', {
        hasText: /^(译文|Translation)$/,
      }),
    ).toBeVisible();
  } finally {
    await app?.close();
    await again?.close();
  }
});

test('oral clip records, plays, transcribes, reopens, then delete drops the file', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-oral-clip-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const model = await startOralModel();
  const mic = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
  const shown = { JIEYU_DESKTOP_HIDE_WINDOW: '0' };
  let app: ElectronApplication | undefined = await launch('oral-clip', undefined, shown, mic);
  let again: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    await openLayers(page);
    await openLayerHeaderMenu(page);
    await page.getByRole('button', { name: /^(新建层|New layer)$/ }).click();
    await page.getByRole('menuitem', { name: /^(新建口译|New interpretation)$/ }).click();
    await expect(
      page.locator('.desktop-tx-layer-name', { hasText: /^(口译|Interpretation)$/ }),
    ).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const record = page
      .getByRole('button', { name: /^(开始录音翻译|Start recording translation)$/ })
      .first();
    await record.scrollIntoViewIfNeeded();
    await record.click();
    const stop = page.locator('.timeline-translation-audio-btn-recording');
    await expect(stop).toBeVisible();
    await expect(stop).toHaveCSS('width', '24px');
    const recordingStatus = page.locator('.timeline-translation-audio-controls-recording .timeline-translation-audio-status').first();
    const visibleStatus = await recordingStatus.boundingBox();
    const recordingCard = await recordingStatus.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," timeline-annotation ")]').boundingBox();
    expect(visibleStatus?.x).toBeGreaterThanOrEqual(recordingCard?.x ?? Infinity);
    await page.screenshot({ path: test.info().outputPath('oral-recording-controls.png') });
    await page.waitForTimeout(1200);
    // The stop glyph sits on the layer chevron. A locator box waits out the
    // recording clock, and a click there folds the group instead of ending the take.
    const stopAt = await page.evaluate(() => {
      const status = document.querySelector(
        '.timeline-translation-audio-controls-recording .timeline-translation-audio-status',
      );
      if (!(status instanceof HTMLElement)) return null;
      const rect = status.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      const onControl =
        top instanceof Element &&
        top.closest('.timeline-translation-audio-controls-recording') !== null &&
        top.closest('.desktop-tx-layer-chevron') === null;
      return onControl ? { x, y } : null;
    });
    if (stopAt === null) throw new Error('recording status is not clickable');
    await page.mouse.click(stopAt.x, stopAt.y);
    const play = page
      .getByRole('button', { name: /^(播放录音翻译|Play recorded translation)$/ })
      .first();
    await expect(play).toBeVisible();
    const clipAudio = page.locator('.timeline-translation-audio-controls audio').first();
    await play.click({ timeout: 15_000 });
    await expect
      .poll(() => clipAudio.evaluate((element) => (element as HTMLAudioElement).paused))
      .toBe(false);
    await stubFolderDialog(app, model.file);
    await grantOralModel(page, sessionId);
    await oralCardAction(page, page.locator('.timeline-annotation').filter({has: page.locator('.timeline-translation-audio-controls')}).first(), /^(语音转文字（STT）|Transcribe recording \(STT\))$/);
    await chooseOralTarget(page, sessionId);
    await expect(page.getByText(/转写已放进文字层|transcript is in the text layer/)).toBeVisible();
    const pair = await findOralPair(page, sessionId);
    const clips = await desktopCall<{ unitId: string }[]>(page, sessionId, 'recordings.list', {
      layerId: pair.audioLayerId,
    });
    expect(clips).toHaveLength(1);
    const read = await desktopCall<{ mimeType: string; bytes: Uint8Array }>(
      page,
      sessionId,
      'recordings.read',
      { unitId: clips[0]?.unitId, layerId: pair.audioLayerId },
    );
    expect(read.mimeType).toBe('audio/wav');
    expect(read.bytes.byteLength).toBeGreaterThan(44);
    const draft = await desktopCall<{ rawInput: string; provenanceJson: string | null } | null>(
      page,
      sessionId,
      'units.readTextDraft',
      { unitId: clips[0]?.unitId, textLayerId: pair.textLayerId },
    );
    expect(draft?.rawInput).toBe('口译一句');
    expect(JSON.parse(draft?.provenanceJson ?? '')).toMatchObject({
      method: 'auto-transcription',
      model: 'app.jieyu.oral-mock',
    });
    await app.close();
    app = undefined;
    again = await launch('oral-clip-again', undefined, shown);
    await stubFolderDialog(again, copy);
    const reopened = await again.firstWindow();
    await rememberChosenSession(again);
    await reopened.getByRole('button', { name: openFolder }).click();
    await expect(reopened.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await reopened.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    const replay = reopened
      .getByRole('button', { name: /^(播放录音翻译|Play recorded translation)$/ })
      .first();
    await expect(replay).toBeVisible();
    const reopenedSession = await chosenSessionId(again);
    const kept = await desktopCall<{ rawInput: string } | null>(
      reopened,
      reopenedSession,
      'units.readTextDraft',
      { unitId: clips[0]?.unitId, textLayerId: pair.textLayerId },
    );
    expect(kept?.rawInput).toBe('口译一句');
    await oralCardAction(reopened, reopened.locator('.timeline-annotation').filter({has: reopened.locator('.timeline-translation-audio-controls')}).first(), /^(删除录音翻译|Delete recorded translation)$/);
    await expect(
      reopened.getByRole('button', { name: /^(播放录音翻译|Play recorded translation)$/ }),
    ).toHaveCount(0);
    await again.close();
    again = undefined;
    expect(oralAttachmentCounts(copy)).toEqual({ clips: 0, files: 0 });
    expect(
      existsSync(join(copy, 'attachments', 'objects'))
        ? readdirSync(join(copy, 'attachments', 'objects'))
        : [],
    ).toEqual([]);
  } finally {
    await model.close();
    await app?.close();
    await again?.close();
  }
});

test('layer hosts moves a translation layer to another host', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-layer-hosts-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app: ElectronApplication | undefined = await launch('layer-hosts');
  let again: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const manuscriptId = (
      await desktopCall<{ id: string; title: Record<string, string> }[]>(
        page,
        sessionId,
        'manuscripts.list',
        {},
      )
    ).find((item) => item.title.und === 'Clip')?.id;
    const listed = await desktopCall<{ id: string; contentType: string }[]>(
      page,
      sessionId,
      'layers.list',
      { manuscriptId },
    );
    const host = listed.find((item) => item.contentType === 'transcription');
    if (manuscriptId === undefined || host === undefined) throw new Error('clip layer missing');
    const second = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-hanzi',
      name: { zh: '汉字转写', en: 'Hanzi', und: 'Hanzi' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      sortOrder: 1,
    });
    const translation = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId,
      key: 'tl-en',
      name: { zh: '英语', en: 'English', und: 'English' },
      tierType: 'symbolic-association',
      contentType: 'translation',
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    const layers = page.getByRole('button', { name: /^(层|Layers)\s*\d*$/ });
    const expand = page.getByRole('button', { name: /^(展开功能面板|Expand feature panel)$/ });
    await expect(async () => {
      if (await layers.isVisible()) return;
      await expand.first().click();
      await expect(layers).toBeVisible();
    }).toPass();
    await layers.click();
    const hostsMenu = await openLayerHeaderMenu(page, /英语|English/);
    await hostsMenu.getByRole('button', { name: /^(层|Layer)$/ }).click();
    await page.getByRole('menuitem', { name: /^(依附关系…|Hosts…)$/ }).click();
    await page.getByRole('checkbox', { name: /^(汉字转写|Hanzi)$/ }).click();
    await page.getByRole('radio', { name: /^(汉字转写 首选|Hanzi Preferred)$/ }).click();
    await page.getByRole('button', { name: /^(保存|Save)$/ }).click();
    const names = page.locator('.desktop-tx-layer-list__line .desktop-tx-context__name');
    await expect(names.nth(2)).toHaveText(/^(英语|English)$/);
    const saved = await desktopCall<{ hostLayerId: string; isPreferred: boolean }[]>(
      page,
      sessionId,
      'layers.listLinks',
      { manuscriptId },
    );
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hostLayerId: second.id, isPreferred: true }),
      ]),
    );
    await app.close();
    app = undefined;
    again = await launch('layer-hosts-again');
    await stubFolderDialog(again, copy);
    const reopened = await again.firstWindow();
    await reopened.getByRole('button', { name: openFolder }).click();
    await reopened.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    const againLayers = reopened.getByRole('button', { name: /^(层|Layers)\s*\d*$/ });
    const againExpand = reopened.getByRole('button', {
      name: /^(展开功能面板|Expand feature panel)$/,
    });
    await expect(async () => {
      if (await againLayers.isVisible()) return;
      await againExpand.first().click();
      await expect(againLayers).toBeVisible();
    }).toPass();
    await againLayers.click();
    await expect(
      reopened.locator('.desktop-tx-layer-list__line .desktop-tx-context__name').nth(2),
    ).toHaveText(/^(英语|English)$/);
    expect(translation.id).not.toBe(second.id);
  } finally {
    await app?.close();
    await again?.close();
  }
});

test('layer drag reparents a transcription layer only on release', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-layer-drag-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app: ElectronApplication | undefined = await launch('layer-drag');
  let again: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const manuscriptId = (
      await desktopCall<{ id: string; title: Record<string, string> }[]>(
        page,
        sessionId,
        'manuscripts.list',
        {},
      )
    ).find((item) => item.title.und === 'Clip')?.id;
    const listed = await desktopCall<{ id: string; contentType: string }[]>(
      page,
      sessionId,
      'layers.list',
      { manuscriptId },
    );
    const host = listed.find((item) => item.contentType === 'transcription');
    if (manuscriptId === undefined || host === undefined) throw new Error('clip layer missing');
    const second = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId,
      key: 'tx-hanzi',
      name: { zh: '汉字转写', en: 'Hanzi', und: 'Hanzi' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      sortOrder: 1,
    });
    const translation = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId,
      key: 'tl-en',
      name: { zh: '英语', en: 'English', und: 'English' },
      tierType: 'symbolic-association',
      contentType: 'translation',
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    await openLayers(page);
    const line = (owner: Page, id: string) =>
      owner.locator(`.desktop-tx-layer-list__line[data-layer-id="${id}"]`);
    const layerMenu = await openLayerHeaderMenu(page, /英语|English/);
    await layerMenu.getByRole('button', { name: /^(层|Layer)$/ }).click();
    await expect(
      page.getByRole('menuitem', { name: /^(回到顶层|Return to the top level)$/ }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /^(层样式|Layer style)$/ })).toHaveCount(0);
    const linksOf = (owner: Page, id: string) =>
      desktopCall<{ layerId: string; hostLayerId: string; isPreferred: boolean }[]>(
        owner,
        sessionId,
        'layers.listLinks',
        { manuscriptId },
      ).then((links) => links.filter((link) => link.layerId === id));
    // An independent root can move above the first root without acquiring a host.
    const rootName = page.locator(
      `[data-layer-id="${second.id}"][data-drag-surface="timeline"] .desktop-tx-layer-name`,
    );
    await rootName.scrollIntoViewIfNeeded();
    const rootBox = await rootName.boundingBox();
    if (rootBox === null) throw new Error('root layer name missing');
    await page.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550);
    const topZone = page.locator('.desktop-tx-drop-root[data-drag-surface="timeline"]');
    await expect(topZone).toBeVisible();
    const topBox = await topZone.boundingBox();
    if (topBox === null) throw new Error('top drop zone missing');
    await page.mouse.move(topBox.x + 30, topBox.y + topBox.height / 2, { steps: 8 });
    await expect(topZone).toHaveClass(/is-active/);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const rows = await desktopCall<{ id: string; sortOrder: number }[]>(
          page,
          sessionId,
          'layers.list',
          { manuscriptId },
        );
        return (
          rows.find((row) => row.id === second.id)!.sortOrder <
          rows.find((row) => row.id === host.id)!.sortOrder
        );
      })
      .toBe(true);
    expect(await linksOf(page, second.id)).toEqual([]);
    expect(await linksOf(page, translation.id)).toEqual([
      expect.objectContaining({ hostLayerId: host.id, isPreferred: true }),
    ]);
    const expandPanel = page.getByRole('button', { name: /^(展开功能面板|Expand feature panel)$/ });
    if (await expandPanel.isVisible()) await expandPanel.click();
    await expect(line(page, second.id)).toBeVisible();
    await dragLayer(page, second.id, host.id, true);
    expect(await linksOf(page, second.id)).toEqual([]);
    await dragLayer(page, second.id, host.id, 'blur');
    expect(await linksOf(page, second.id)).toEqual([]);
    await dragLayer(page, second.id, host.id, false, async () => {
      expect(await linksOf(page, second.id)).toEqual([]);
      await expect(line(page, second.id)).toHaveCSS('z-index', '2');
      await page.screenshot({ path: test.info().outputPath('layer-host-preview.png') });
    });
    await expect.poll(() => linksOf(page, second.id)).toEqual([]);
    await app.close();
    app = undefined;
    const legacy = new Database(join(copy, 'project.sqlite'));
    legacy
      .prepare(
        `INSERT INTO layer_links (
           id, manuscript_id, layer_id, host_layer_id, link_type, is_preferred, sort_order, created_at
         ) VALUES (?, ?, ?, ?, 'direct', 1, 0, ?)`,
      )
      .run(randomUUID(), manuscriptId, second.id, host.id, new Date().toISOString());
    legacy.close();
    again = await launch('layer-drag-again');
    await stubFolderDialog(again, copy);
    const reopened = await again.firstWindow();
    await rememberChosenSession(again);
    await reopened.getByRole('button', { name: openFolder }).click();
    await reopened.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    const againSession = await chosenSessionId(again);
    expect(await linksOfSession(reopened, againSession, manuscriptId, second.id)).toEqual([
      expect.objectContaining({ hostLayerId: host.id, isPreferred: true }),
    ]);
    await openLayers(reopened);
    const returnMenu = await openLayerHeaderMenu(reopened, /汉字转写|Hanzi/);
    await returnMenu.getByRole('button', { name: /^(层|Layer)$/ }).click();
    await reopened.getByRole('menuitem', { name: /^(回到顶层|Return to the top level)$/ }).click();
    await expect
      .poll(() => linksOfSession(reopened, againSession, manuscriptId, second.id))
      .toEqual([]);
    expect(await linksOfSession(reopened, againSession, manuscriptId, translation.id)).toEqual([
      expect.objectContaining({ hostLayerId: host.id, isPreferred: true }),
    ]);
  } finally {
    await app?.close();
    await again?.close();
  }
});

test('drags create on the waveform and on a linked layer row, and texts stay per layer', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-create-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('tx-create');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const clip = await clipLayer(page, sessionId);
    const manuscripts = await desktopCall<{ id: string; title: Record<string, string> }[]>(
      page,
      sessionId,
      'manuscripts.list',
      {},
    );
    const manuscriptId = manuscripts.find((item) => item.title.und === 'Clip')?.id;
    const tl = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId,
      key: 'tl',
      name: { und: 'Gloss' },
      tierType: 'symbolic-association',
      contentType: 'translation',
      sortOrder: 1,
      hosts: [{ hostLayerId: clip.layerId }],
    });
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    await waitForAudio(page);
    const wave = page.getByTestId('desktop-waveform');
    await expect.poll(async () => (await wave.boundingBox())?.width ?? 0).toBeGreaterThan(100);
    const listed = () =>
      desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId: clip.layerId });
    const drag = async (box: { x: number; y: number; width: number }, from: number, to: number) => {
      const y = box.y + 10;
      await page.mouse.move(box.x + (box.width * from) / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + (box.width * (from + to)) / 4, y, { steps: 4 });
      await page.mouse.move(box.x + (box.width * to) / 2, y, { steps: 4 });
      await page.mouse.up();
    };
    const waveBox = await wave.boundingBox();
    if (waveBox === null) throw new Error('waveform missing');
    await drag(waveBox, 1.0, 1.3);
    await expect.poll(async () => (await listed()).length).toBe(3);

    const row = page.locator(`[data-layer-id="${tl.id}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator('.timeline-annotation')).toHaveCount(3);
    const track = row.locator('.desktop-tx-lane__track');
    await track.evaluate(
      (element, span: { duration: number; start: number; end: number }) => {
        const rect = element.getBoundingClientRect();
        const y = rect.top + 4;
        const at = (second: number) => rect.left + (rect.width * second) / span.duration;
        const emit = (type: string, x: number, target: EventTarget) => {
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: x,
              clientY: y,
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1,
              pointerId: 1,
              pointerType: 'mouse',
              view: window,
            }),
          );
        };
        const start = at(span.start);
        const end = at(span.end);
        emit('pointerdown', start, element);
        emit('pointermove', (start + end) / 2, window);
        emit('pointermove', end, window);
        emit('pointerup', end, window);
      },
      { duration: 2, start: 1.5, end: 1.8 },
    );
    await expect.poll(async () => (await listed()).length).toBe(4);
    const spans = (await listed())
      .map((unit) => [unit.startMs ?? 0, unit.endMs ?? 0] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(spans[2]?.[0]).toBeGreaterThanOrEqual(950);
    expect(spans[2]?.[1]).toBeLessThanOrEqual(1350);
    expect(spans[3]?.[0]).toBeGreaterThanOrEqual(1450);

    const first = row.locator('.timeline-annotation').first();
    await first.click();
    await expect(first).toHaveClass(/timeline-annotation-selected/);
    await first.click();
    const input = row.locator('.timeline-annotation-input');
    await input.fill('gloss one');
    await input.evaluate((element) => (element as HTMLInputElement).blur());
    await expect
      .poll(async () =>
        (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId: tl.id })).map(
          (unit) => unit.text,
        ),
      )
      .toContain('gloss one');
    expect((await listed()).map((unit) => unit.text)).toContain('one');
    expect((await listed()).map((unit) => unit.text)).not.toContain('gloss one');

    await first.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^(清空「|Clear “)/ }).click();
    await page
      .getByRole('dialog', { name: /^(清空当前写法？|Clear this writing\?)$/ })
      .getByRole('button', { name: /^(清空本层正文与草稿|Clear this layer’s text and drafts)$/ })
      .click();
    await expect
      .poll(async () =>
        (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId: tl.id })).map(
          (unit) => unit.text,
        ),
      )
      .not.toContain('gloss one');
    expect((await listed()).map((unit) => unit.text)).toContain('one');

    const before = (await listed()).find((unit) => unit.text === 'one');
    const handle = row.locator('.timeline-annotation-resize-handle-end').first();
    const at = await handle.boundingBox();
    if (at === null || before?.endMs == null) throw new Error('row handle missing');
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x - 12, at.y + at.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(async () => (await listed()).find((unit) => unit.id === before.id)?.endMs ?? 0)
      .toBeLessThan(before.endMs);
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('waveform create writes to the selected transcription after a linked card had focus', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-wave-layer-target-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('wave-layer-target');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const clip = await clipLayer(page, sessionId);
    const manuscripts = await desktopCall<{ id: string; title: Record<string, string> }[]>(
      page, sessionId, 'manuscripts.list', {},
    );
    const manuscriptId = manuscripts.find((item) => item.title.und === 'Clip')?.id;
    const linked = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId, key: 'wave-linked', name: { und: 'Linked text' },
      tierType: 'symbolic-association', contentType: 'translation',
      hosts: [{ hostLayerId: clip.layerId }],
    });
    const selected = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId, key: 'wave-selected', name: { und: 'Selected transcription' },
      tierType: 'time-aligned', contentType: 'transcription',
    });
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await waitForAudio(page);
    await page.locator(`[data-layer-id="${linked.id}"] .timeline-annotation`).first().click();
    await page.locator(`[data-layer-id="${selected.id}"] .desktop-tx-layer-name`).click();
    await expect(page.locator(`[data-layer-id="${selected.id}"] .desktop-tx-layer-label`))
      .toHaveClass(/is-focused/);
    const oldCount = (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', {
      layerId: clip.layerId,
    })).length;
    const wave = page.getByTestId('desktop-waveform');
    const box = await wave.boundingBox();
    if (box === null) throw new Error('waveform missing');
    const y = box.y + 10;
    await page.mouse.move(box.x + box.width * 0.75, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => ({
      selected: (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', {
        layerId: selected.id,
      })).length,
      old: (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', {
        layerId: clip.layerId,
      })).length,
    }), { timeout: 5000 }).toEqual({ selected: 1, old: oldCount });
    const [created] = await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId: selected.id });
    if (!created) throw new Error('created unit missing');
    await expect(wave.locator(`[part~="region"][part~="${created.id}"]`)).toBeVisible();
    const nativeBox = await wave.locator(`[part~="region"][part~="${created.id}"]`).boundingBox();
    const cardBox = await page.locator(`[data-layer-id="${selected.id}"] .timeline-annotation[data-unit-id="${created.id}"]`).boundingBox();
    expect(nativeBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(Math.abs(nativeBox!.x - cardBox!.x)).toBeLessThan(3);
    expect(Math.abs(nativeBox!.width - cardBox!.width)).toBeLessThan(3);
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('a subdivision card becomes the edge target and its menu deletes only that child', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-subdiv-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('tx-subdiv');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const { clip, words, parent, left } = await seedWords(page, sessionId);
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    const row = page.locator(`[data-layer-id="${words.id}"]`);
    await expect(row.locator('.timeline-annotation')).toHaveCount(2);
    const card = row.locator('.timeline-annotation').first();
    const other = row.locator('.timeline-annotation').nth(1);
    await other.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /标记为跳过处理|Mark to skip processing/ }).click();
    await expect(other).toHaveClass(/timeline-annotation-skipped/);
    expect(
      (
        await desktopCall<(ListedUnit & { skipProcessing?: boolean })[]>(
          page,
          sessionId,
          'units.list',
          {
            layerId: words.id,
          },
        )
      ).filter((unit) => unit.skipProcessing === true),
    ).toHaveLength(1);
    // The card itself shows the state; a toast here would cover cards and swallow the next click.
    await page.waitForTimeout(500);
    expect(await page.locator('.transcription-toast-container').count()).toBe(0);
    await other.click({ button: 'right', timeout: 3000 });
    await page.getByRole('menuitem', { name: /取消跳过处理|Resume processing/ }).click();
    await expect(other).not.toHaveClass(/timeline-annotation-skipped/);
    await card.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /联动共用边界|Link the shared boundary/ }).waitFor();
    await page.getByRole('menuitem', { name: /删除本子段|Delete this sub-segment/ }).click();
    await expect(page.getByRole('dialog')).toContainText(
      /将删除这一段，撤销后仍用原来的身份|This deletes the segment\. Undo keeps the same identity/,
    );
    await page.getByRole('button', { name: /^(Delete segment|删除句段)$/ }).click();
    await expect
      .poll(async () =>
        (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId: words.id })).map(
          (unit) => unit.id,
        ),
      )
      .not.toContain(left.id);
    const after = await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', {
      layerId: clip.layerId,
    });
    expect(after.find((unit) => unit.id === parent.id)).toMatchObject({
      startMs: parent.startMs,
      endMs: parent.endMs,
    });
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('a linked layer sits under its host with a tree line and folds away, an unlinked one stays a root', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-layer-tree-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('tx-layer-tree');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const { words } = await seedWords(page, sessionId);
    const manuscripts = await desktopCall<{ id: string; title: Record<string, string> }[]>(
      page,
      sessionId,
      'manuscripts.list',
      {},
    );
    const loose = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
      manuscriptId: manuscripts.find((item) => item.title.und === 'Clip')?.id,
      key: 'loose',
      name: { und: 'Loose' },
      tierType: 'symbolic-association',
      contentType: 'translation',
      sortOrder: 2,
    });
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    const row = (id: string) => page.locator(`.desktop-tx-lane[data-layer-id="${id}"]`);
    await expect(row(words.id).locator('.timeline-annotation')).toHaveCount(2);
    await expect(row(words.id).locator('.tree-elbow')).toHaveCount(1);
    await expect(row(loose.id)).toBeVisible();
    await expect(row(loose.id).locator('.tree-elbow')).toHaveCount(0);
    const host = page.getByTestId('desktop-readonly-timeline');
    await expect(host.locator('.tree-elbow')).toHaveCount(0);

    await host
      .getByRole('button', { name: /^(收起 .+ 的从属层|Collapse layers under .+)$/ })
      .click();
    await expect(row(words.id)).toHaveCount(0);
    await expect(host.getByText(/^(\+1 层|\+1 layers)$/)).toBeVisible();
    await expect(row(loose.id)).toBeVisible();

    await host.getByRole('button', { name: /^(展开 .+ 的从属层|Expand layers under .+)$/ }).click();
    await expect(row(words.id).locator('.timeline-annotation')).toHaveCount(2);
    await expect(row(words.id).locator('.tree-elbow')).toHaveCount(1);
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('a subdivision card takes arrow keys and the time box, and a parent drag shows the follow tip', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-subdiv-edge-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('tx-subdiv-edge');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const { clip, words, parent, left, right, mid } = await seedWords(page, sessionId);
    const read = async (layerId: string, id: string) =>
      (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId })).find(
        (unit) => unit.id === id,
      );
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    const row = page.locator(`[data-layer-id="${words.id}"]`);
    await expect(row.locator('.timeline-annotation')).toHaveCount(2);

    await row.locator('.timeline-annotation').first().click();
    await page.keyboard.press('e');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('desktop-edge-focus')).toContainText(/start|起点/i);
    await expect
      .poll(async () => (await read(words.id, left.id))?.startMs)
      .toBe(parent.startMs + 10);
    expect((await read(words.id, left.id))?.endMs).toBe(mid);
    expect((await read(clip.layerId, parent.id))?.startMs).toBe(parent.startMs);

    const stamp = (ms: number) => `00:00:00.${String(ms).padStart(3, '0')}`;
    const end = page.getByRole('textbox', { name: /^(End time|结束时间)$/ });
    await end.fill(stamp(mid - 50));
    await end.blur();
    await expect.poll(async () => (await read(words.id, left.id))?.endMs).toBe(mid - 50);
    await end.fill('00:00:09.000');
    await end.blur();
    await page.waitForTimeout(300);
    expect((await read(words.id, left.id))?.endMs).toBe(mid - 50);

    const main = page.locator('.desktop-tx-lane__track').first();
    await main.locator('.timeline-annotation').first().click();
    const handle = main.locator('.timeline-annotation-resize-handle-end').first();
    const at = await handle.boundingBox();
    if (at === null) throw new Error('parent handle missing');
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x - 40, at.y + at.height / 2, { steps: 8 });
    await expect(page.locator('.desktop-tx-snap')).toContainText(/Children follow|子段跟随/);
    await page.mouse.up();
    await expect
      .poll(async () => (await read(words.id, right.id))?.endMs ?? Infinity)
      .toBeLessThan(parent.endMs);
    expect((await read(clip.layerId, parent.id))?.endMs).toBeLessThan(parent.endMs);
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('waveform handles resize a segment edge and the grip moves it with its children, then undo', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-wave-edge-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('tx-wave-edge');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const { clip, words, parent, left } = await seedWords(page, sessionId);
    const read = async (layerId: string, id: string) =>
      (await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId })).find(
        (unit) => unit.id === id,
      );
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    await waitForAudio(page);
    const seg = page.locator(`[data-wave-unit="${parent.id}"]`);
    await expect(seg).toBeVisible();

    const end = seg.getByTestId('desktop-wave-handle-end');
    const at = await end.boundingBox();
    const span = await seg.boundingBox();
    if (at === null || span === null) throw new Error('wave end handle missing');
    // 按段宽换算拉回 100 毫秒；固定像素在窄波形下会把右子段压到 10 毫秒以下而被拒。
    const pullBack = (100 * span.width) / (parent.endMs - parent.startMs);
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 - pullBack, at.y + at.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(async () => (await read(clip.layerId, parent.id))?.endMs ?? Infinity)
      .toBeLessThan(parent.endMs);
    expect((await read(clip.layerId, parent.id))?.startMs).toBe(parent.startMs);

    const now = await read(clip.layerId, parent.id);
    const grip = seg.getByTestId('desktop-wave-grip');
    const gb = await grip.boundingBox();
    if (gb === null || now?.endMs == null) throw new Error('wave grip missing');
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2 + 15, gb.y + gb.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await read(clip.layerId, parent.id))?.startMs ?? 0)
      .not.toBe(parent.startMs);
    const moved = await read(clip.layerId, parent.id);
    const child = await read(words.id, left.id);
    expect((child?.startMs ?? 0) - parent.startMs).toBe((moved?.startMs ?? 0) - parent.startMs);

    const body = seg.getByTestId('desktop-wave-body');
    await expect(body).toBeVisible();
    const bb = await body.boundingBox();
    if (bb === null) throw new Error('wave body missing');
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 - 10, bb.y + bb.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(async () => (await read(clip.layerId, parent.id))?.startMs ?? Infinity)
      .toBeLessThan(moved?.startMs ?? 0);
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('importing a recording leaves no transcription layer until the button creates one', async () => {
  const stamp = `jieyu-e2e-empty-${Date.now()}`;
  const wavPath = join(tmpdir(), `${stamp}.wav`);
  const created = join(homedir(), 'Documents', '解语', stamp);
  writeFileSync(wavPath, wavSilence(1));
  const app = await launch('empty-import');
  try {
    await stubFolderDialog(app, wavPath);
    const page = await app.firstWindow();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await page.getByRole('button', { name: /^(Import recording…|导入录音…)$/ }).click();
    await expect(page.getByTestId('desktop-no-layers')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^(还没有层|No layers yet)$/ })).toBeVisible();
    await expect(page.locator('.desktop-tx-lane')).toHaveCount(0);
    await page.getByRole('button', { name: /^(新建转写层|New transcription layer)$/ }).click();
    await expect(page.getByTestId('desktop-no-layers')).toHaveCount(0);
    await expect(page.locator('.desktop-tx-lane')).toBeVisible();
  } finally {
    await app.close();
    rmSync(wavPath, { force: true });
    rmSync(created, { recursive: true, force: true });
  }
});

test('does not create a sample project on startup', async () => {
  const app = await launch('no-sample');
  try {
    await app.firstWindow();
    const userData = userDataOf.get(app);
    if (userData === undefined) throw new Error('user data folder missing');
    expect(existsSync(join(userData, 'sample-project'))).toBe(false);
  } finally {
    await app.close();
  }
});

test('transcription edge writes survive close and reopen', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-m4c-edges-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app: ElectronApplication | undefined = await launch('edges');
  let again: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const clip = await clipLayer(page, sessionId);
    const units = await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', {
      layerId: clip.layerId,
    });
    const one = units.find((unit) => unit.text === 'one');
    const two = units.find((unit) => unit.text === 'two');
    if (one === undefined || two === undefined) throw new Error('clip units missing');
    await desktopCall(page, sessionId, 'units.moveSharedBoundary', {
      leftId: one.id,
      rightId: two.id,
      time: 500,
      operationId: 'e2e-shared',
    });
    await desktopCall(page, sessionId, 'units.moveEdge', {
      unitId: two.id,
      edge: 'end',
      time: 900,
      operationId: 'e2e-edge',
    });
    const made = await desktopCall<{ id: string }>(page, sessionId, 'units.create', {
      layerId: clip.layerId,
      startMs: 1000,
      endMs: 1400,
      text: 'made',
      operationId: 'e2e-create',
    });
    await desktopCall(page, sessionId, 'units.putTimeDraft', {
      unitId: made.id,
      edge: 'end',
      rawInput: '00:00:01.',
      baseMs: 1400,
      issue: null,
    });
    await desktopCall(page, sessionId, 'units.delete', {
      unitId: one.id,
      operationId: 'e2e-delete',
    });
    const receipt = await desktopCall<{ status: string }>(page, sessionId, 'units.inspectEdit', {
      operationId: 'e2e-create',
      kind: 'create',
      payload: { layerId: clip.layerId, startMs: 1000, endMs: 1400, text: 'made' },
    });
    expect(receipt.status).toBe('committed');

    await app.close();
    app = undefined;
    again = await launch('edges-again');
    await stubFolderDialog(again, copy);
    const reopened = await again.firstWindow();
    await rememberChosenSession(again);
    await reopened.getByRole('button', { name: openFolder }).click();
    await expect(reopened.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const nextSession = await chosenSessionId(again);
    const nextClip = await clipLayer(reopened, nextSession);
    const readBack = await desktopCall<ListedUnit[]>(reopened, nextSession, 'units.list', {
      layerId: nextClip.layerId,
    });
    expect(readBack.map((unit) => unit.text).sort()).toEqual(['made', 'two']);
    expect(readBack.find((unit) => unit.text === 'two')).toMatchObject({
      startMs: 500,
      endMs: 900,
    });
    const kept = readBack.find((unit) => unit.text === 'made');
    if (kept === undefined) throw new Error('created unit missing');
    const drafts = await desktopCall<TimeDraftRow[]>(reopened, nextSession, 'units.readTimeDraft', {
      unitId: kept.id,
    });
    expect(drafts).toEqual([
      expect.objectContaining({
        edge: 'end',
        rawInput: '00:00:01.',
        baseMs: 1400,
        conflict: false,
      }),
    ]);
    const replay = await desktopCall<{ status: string }>(
      reopened,
      nextSession,
      'units.inspectEdit',
      {
        operationId: 'e2e-create',
        kind: 'create',
        payload: { layerId: nextClip.layerId, startMs: 1000, endMs: 1400, text: 'made' },
      },
    );
    expect(replay.status).toBe('committed');
    const deleted = await desktopCall<{ status: string }>(
      reopened,
      nextSession,
      'units.inspectEdit',
      { operationId: 'e2e-delete', kind: 'delete', payload: { unitId: one.id } },
    );
    expect(deleted.status).toBe('committed');
  } finally {
    await again?.close();
    await app?.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('the read page does not call the old storage port', () => {
  const sources = [
    'src/pages/DesktopProjectReadPage.tsx',
    'src/pages/DesktopProjectReadView.tsx',
    'src/db/desktop/client.ts',
    'src/db/desktop/projectRead.ts',
  ]
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  expect(sources).not.toMatch(/storageCall|storage:call|getDb\(/);
});

test('restores a backup into an empty folder, then plays and edits that copy', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const app = await launch('restore');
  let reopened: ElectronApplication | undefined;
  const occupied = mkdtempSync(join(tmpdir(), 'jieyu-m4c-occupied-'));
  const broken = mkdtempSync(join(tmpdir(), 'jieyu-m4c-broken-'));
  const destination = mkdtempSync(join(tmpdir(), 'jieyu-m4c-restored-'));
  writeFileSync(join(occupied, 'keep.txt'), 'keep');
  let backupFile = '';
  let backupBytes: Buffer | undefined;
  try {
    await stubFolderDialog(app, folder);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take', exact: true })).toBeVisible();
    const sourceHashes = {
      sqlite: fileHash(join(folder, 'project.sqlite')),
      clip: fileHash(join(folder, 'clip.wav')),
      take: fileHash(join(folder, 'take.wav')),
    };
    backupFile = soleBackup(userDataOf.get(app) ?? '', folder);
    const backupHash = fileHash(backupFile);
    backupBytes = readFileSync(backupFile);

    await page.getByRole('button', { name: restoreAction }).click();
    await page.getByRole('dialog').getByRole('button', { name: cancelRestore }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(restoredMark)).toHaveCount(0);

    await restoreInto(page, app, null);
    await expect(page.getByText(restoredMark)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();

    await restoreInto(page, app, occupied);
    await expect(page.getByRole('alert')).toHaveText(occupiedText);
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();

    writeFileSync(backupFile, Buffer.from('not-a-jym'));
    await restoreInto(page, app, broken);
    await expect(page.getByRole('alert')).toHaveText(restoreFailed);
    writeFileSync(backupFile, backupBytes);
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();

    await restoreInto(page, app, destination);
    await expect(page.getByText(destination, { exact: false })).toBeVisible();
    expect(existsSync(join(destination, 'clip.wav'))).toBe(true);
    expect(existsSync(join(destination, 'take.wav'))).toBe(true);
    const restoredSqlite = readFileSync(join(destination, 'project.sqlite'));
    writeFileSync(join(destination, 'project.sqlite'), Buffer.from('not a library'));
    await page.getByRole('button', { name: openCopy }).click();
    await expect(page.getByRole('alert')).toHaveText(openFailed);
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    writeFileSync(join(destination, 'project.sqlite'), restoredSqlite);

    await page.getByRole('button', { name: openCopy }).click();
    await expect(page.getByRole('button', { name: 'Take', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Take', exact: true }).click();
    await expect(page.getByRole('button', { name: '0.3–0.6 three' })).toBeVisible();
    await waitForAudio(page);
    await page.getByRole('button', { name: '0.3–0.6 three' }).click();
    await expect
      .poll(() =>
        page.locator('audio').evaluate((element) => (element as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0.2);
    await page.getByRole('button', { name: 'Clip', exact: true }).click();
    await expect(page.getByRole('button', { name: '0.0–0.4 one' })).toBeVisible();
    await waitForAudio(page);
    await page.getByRole('button', { name: '0.4–0.8 two' }).click();
    await expect
      .poll(() =>
        page.locator('audio').evaluate((element) => (element as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0.3);
    await page.getByRole('button', { name: '0.0–0.4 one' }).click();
    await page.getByRole('textbox', { name: textLabel }).fill('copy-edit');
    await page.getByRole('button', { name: saveText }).click();
    await expect(page.getByRole('button', { name: '0.0–0.4 copy-edit' })).toBeVisible();

    expect(fileHash(join(folder, 'project.sqlite'))).toBe(sourceHashes.sqlite);
    expect(fileHash(join(folder, 'clip.wav'))).toBe(sourceHashes.clip);
    expect(fileHash(join(folder, 'take.wav'))).toBe(sourceHashes.take);
    expect(fileHash(backupFile)).toBe(backupHash);
    await app.close();
    reopened = await launch('restore-again');
    await stubFolderDialog(reopened, destination);
    const again = await reopened.firstWindow();
    await again.getByRole('button', { name: openFolder }).click();
    await expect(again.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await expect(again.getByRole('button', { name: 'Take', exact: true })).toBeVisible();
    await expect(again.getByRole('button', { name: '0.0–0.4 copy-edit' })).toBeVisible();
  } finally {
    if (backupBytes !== undefined && backupFile.length > 0 && existsSync(backupFile)) {
      writeFileSync(backupFile, backupBytes);
    }
    await reopened?.close();
    await app.close();
    rmSync(occupied, { recursive: true, force: true });
    rmSync(broken, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test('rejects an old restore grant after switching projects', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const root = mkdtempSync(join(tmpdir(), 'jieyu-grant-flow-'));
  const firstFolder = join(root, 'first');
  const nextFolder = join(root, 'next');
  const copy = join(root, 'copy');
  for (const dir of [firstFolder, nextFolder, copy]) mkdirSync(dir);
  const app = await launch('restore-grant');
  try {
    const page = await app.firstWindow();
    await stubFolderDialog(app, firstFolder);
    const first = await page.evaluate(() =>
      (window as unknown as FlowWindow).jieyuDesktop.chooseDesktopFolder(),
    );
    if (!('sessionId' in first)) throw new Error('missing first session');
    const days = await page.evaluate(
      (id) => (window as unknown as FlowWindow).jieyuDesktop.listDailyBackups(id),
      first.sessionId,
    );
    await stubFolderDialog(app, copy);
    await page.evaluate(
      ({ id, day }) => (window as unknown as FlowWindow).jieyuDesktop.restoreDailyBackup(id, day),
      {
        id: first.sessionId,
        day: days.days[0]!,
      },
    );
    await stubFolderDialog(app, nextFolder);
    const next = await page.evaluate(() =>
      (window as unknown as FlowWindow).jieyuDesktop.chooseDesktopFolder(),
    );
    if (!('sessionId' in next)) throw new Error('missing next session');
    const refused = await page.evaluate(async (id) => {
      try {
        await (window as unknown as FlowWindow).jieyuDesktop.openRestoredBackup(id);
        return false;
      } catch {
        return true;
      }
    }, first.sessionId);
    expect(refused).toBe(true);
    expect(
      await page.evaluate(
        (id) => (window as unknown as FlowWindow).jieyuDesktop.desktopCall(id, 'project.get', {}),
        next.sessionId,
      ),
    ).toBeTruthy();
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('opens the actual attachment image from the desktop lexicon', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-attachment-flow-'));
  const app = await launch('attachment-image');
  try {
    await stubFolderDialog(app, dir);
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      const host = (window as unknown as FlowWindow).jieyuDesktop;
      const opened = await host.chooseDesktopFolder();
      if (!('sessionId' in opened)) throw new Error('missing attachment session');
      await host.desktopCall(opened.sessionId, 'lexicon.saveEntry', {
        id: 'image-entry',
        entry: { headword: 'image-entry', senses: [] },
      });
      const png = atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aizsAAAAASUVORK5CYII=',
      );
      await host.desktopCall(opened.sessionId, 'attachments.publish', {
        lexemeId: 'image-entry',
        displayName: 'pixel.png',
        kind: 'image',
        mimeType: 'image/png',
        bytes: Uint8Array.from(png, (char) => char.charCodeAt(0)),
        operationId: 'flow-image',
      });
    });
    await page.getByRole('button', { name: openFolder }).click();
    await page.locator('a[href="/lexicon"]').first().click();
    await page.getByRole('button', { name: 'image-entry', exact: true }).click();
    await page.getByRole('button', { name: /^(Open attachment|打开附件)$/ }).click();
    const image = page.getByRole('img', { name: 'pixel.png' });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(1);
    await expect(page.getByRole('link', { name: 'pixel.png' })).toHaveAttribute(
      'download',
      'pixel.png',
    );
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('opens, plays, edits, refuses a second process, and reads the edit back', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-edit-project-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const first = await launch('first');
  let second: ElectronApplication | undefined;
  let third: ElectronApplication | undefined;
  try {
    const page = await editProject(first, copy);
    second = await launch('second');
    const refused = await second.firstWindow();
    await stubFolderDialog(second, copy);
    await refused.getByRole('button', { name: openFolder }).click();
    await expect(refused.getByRole('alert')).toBeVisible();
    await expect(refused.getByRole('button', { name: edited })).toHaveCount(0);
    await second.close();
    second = undefined;
    await expect(page.getByRole('button', { name: edited })).toBeVisible();
    await first.close();
    third = await launch('third');
    const again = await third.firstWindow();
    await stubFolderDialog(third, copy);
    await again.getByRole('button', { name: openFolder }).click();
    await expect(again.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await expect(again.getByRole('button', { name: edited })).toBeVisible();
  } finally {
    await second?.close();
    await third?.close();
    await first.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('saves a text draft when the window closes', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-m4c-draft-save-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('draft-close-save');
  let closed = false;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await openFirstUnit(page);
    await page.getByRole('textbox', { name: textLabel }).fill('saved on close');
    const gone = page.waitForEvent('close');
    await closeFirstWindow(app);
    await gone;
    closed = true;
  } finally {
    if (!closed) await app.close();
    else await app.close().catch(() => {});
  }
  expect(unitTexts(copy)).toContain('saved on close');
  const again = await launch('draft-close-save-reopen');
  try {
    await stubFolderDialog(again, copy);
    const page = await again.firstWindow();
    await openFirstUnit(page);
    await expect(page.getByRole('textbox', { name: textLabel })).toHaveValue('saved on close');
  } finally {
    await again.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

for (const choice of [0, 1, 2]) {
  test(`text close failure: ${['stay', 'retry', 'discard'][choice]}`, async () => {
    if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
    const copy = mkdtempSync(join(tmpdir(), 'jieyu-close-fault-'));
    cpSync(folder, copy, { recursive: true });
    rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
    const app = await launch('close-fault');
    try {
      await stubFolderDialog(app, copy);
      const page = await app.firstWindow();
      await openFirstUnit(page);
      const original = await page.getByRole('textbox', { name: textLabel }).inputValue();
      await injectTextFault(app, 'before', choice);
      await page.getByRole('textbox', { name: textLabel }).fill('close failure draft');
      await closeFirstWindow(app);
      if (choice === 0) {
        await expect.poll(() => faultState(app)).toMatchObject({ asks: 1 });
        await expect(page.getByRole('textbox', { name: textLabel })).toHaveValue(
          'close failure draft',
        );
        expect(unitTexts(copy)).toContain(original);
        expect(unitTexts(copy)).not.toContain('close failure draft');
        await injectTextFault(app, 'none', 1);
        await closeFirstWindow(app);
      }
      await expect.poll(() => app.windows().length).toBe(0);
      await app.close().catch(() => {});
      const again = await launch('close-fault-reopen');
      try {
        await stubFolderDialog(again, copy);
        const reopened = await again.firstWindow();
        await openFirstUnit(reopened);
        await expect(reopened.getByRole('textbox', { name: textLabel })).toHaveValue(
          choice === 2 ? original : 'close failure draft',
        );
        expect(unitTexts(copy)).toContain(choice === 2 ? original : 'close failure draft');
      } finally {
        await again.close();
      }
    } finally {
      await app.close().catch(() => {});
      rmSync(copy, { recursive: true, force: true });
    }
  });
}

test('lost text receipt is inspected without writing twice and survives reopen', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-lost-receipt-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('lost-receipt');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await openFirstUnit(page);
    const before = manuscriptGeneration(copy);
    await injectTextFault(app, 'after', 0);
    await page.getByRole('textbox', { name: textLabel }).fill('receipt lost but committed');
    await page.getByRole('button', { name: saveText }).click();
    await expect.poll(() => faultState(app)).toMatchObject({ writes: 1, inspections: 1 });
    await closeFirstWindow(app);
    await expect.poll(() => app.windows().length).toBe(0);
    expect(manuscriptGeneration(copy)).toBe(before + 1);
    await app.close().catch(() => {});
    const again = await launch('lost-receipt-reopen');
    try {
      await stubFolderDialog(again, copy);
      const reopened = await again.firstWindow();
      await openFirstUnit(reopened);
      await expect(reopened.getByRole('textbox', { name: textLabel })).toHaveValue(
        'receipt lost but committed',
      );
    } finally {
      await again.close();
    }
  } finally {
    await app.close().catch(() => {});
    rmSync(copy, { recursive: true, force: true });
  }
});

test('unknown text result blocks close and newer writes until inspection recovers', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-unknown-receipt-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('unknown-receipt');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await openFirstUnit(page);
    const before = manuscriptGeneration(copy);
    await injectTextFault(app, 'unknown', 0);
    await page.getByRole('textbox', { name: textLabel }).fill('unknown A');
    await page.getByRole('button', { name: saveText }).click();
    await expect.poll(() => faultState(app)).toMatchObject({ writes: 1, inspections: 1 });
    await page.getByRole('textbox', { name: textLabel }).fill('latest B');
    await closeFirstWindow(app);
    await expect.poll(() => faultState(app)).toMatchObject({ writes: 1, asks: 1 });
    await expect(page.getByRole('textbox', { name: textLabel })).toHaveValue('latest B');
    expect(unitTexts(copy)).toContain('unknown A');
    await injectTextFault(app, 'none', 1);
    await closeFirstWindow(app);
    await expect.poll(() => app.windows().length).toBe(0);
    expect(manuscriptGeneration(copy)).toBe(before + 2);
    await app.close().catch(() => {});
    const again = await launch('unknown-receipt-reopen');
    try {
      await stubFolderDialog(again, copy);
      const reopened = await again.firstWindow();
      await openFirstUnit(reopened);
      await expect(reopened.getByRole('textbox', { name: textLabel })).toHaveValue('latest B');
    } finally {
      await again.close();
    }
  } finally {
    await app.close().catch(() => {});
    rmSync(copy, { recursive: true, force: true });
  }
});

test('an unreadable folder stays closed', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const blocked = mkdtempSync(join(tmpdir(), 'jieyu-unreadable-'));
  chmodSync(blocked, 0);
  const app = await launch('unreadable');
  try {
    await stubFolderDialog(app, blocked);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('alert')).toHaveText(unreadableFolder);
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toHaveCount(0);
  } finally {
    await app.close();
    chmodSync(blocked, 0o700);
    rmSync(blocked, { recursive: true, force: true });
  }
});

test('replacing the installed app keeps the project and user data', async () => {
  test.skip(packagedApp === undefined, 'installed app only');
  if (!flowReady(folder) || packagedApp === undefined) return;
  const userData = mkdtempSync(join(tmpdir(), 'jieyu-reinstall-data-'));
  const bundle = resolve(packagedApp, '../../..');
  const spare = mkdtempSync(join(tmpdir(), 'jieyu-reinstall-app-'));
  cpSync(bundle, join(spare, 'app'), { recursive: true });
  let first: ElectronApplication | undefined;
  let second: ElectronApplication | undefined;
  try {
    first = await launch('reinstall-before', userData);
    await stubFolderDialog(first, folder);
    const page = await first.firstWindow();
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await first.close();
    first = undefined;
    const marker = join(userData, 'preferences', 'keep.txt');
    writeFileSync(marker, 'keep');
    const backups = join(userData, 'backups');
    const before = readFileSync(marker);
    const backupBefore = readdirSync(backups, { recursive: true }).map(String).sort();
    rmSync(bundle, { recursive: true, force: true });
    expect(existsSync(packagedApp)).toBe(false);
    cpSync(join(spare, 'app'), bundle, { recursive: true });
    expect(readFileSync(marker).equals(before)).toBe(true);
    expect(readdirSync(backups, { recursive: true }).map(String).sort()).toEqual(backupBefore);
    second = await launch('reinstall-after', userData);
    await stubFolderDialog(second, folder);
    const again = await second.firstWindow();
    await again.getByRole('button', { name: openFolder }).click();
    await expect(again.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    expect(readFileSync(marker, 'utf8')).toBe('keep');
  } finally {
    await first?.close();
    await second?.close();
    if (!existsSync(packagedApp)) cpSync(join(spare, 'app'), bundle, { recursive: true });
    rmSync(userData, { recursive: true, force: true });
    rmSync(spare, { recursive: true, force: true });
  }
});

test('purges a due manuscript from the installed app and reads it back as gone', async () => {
  test.skip(packagedApp === undefined, 'installed app only');
  if (!flowReady(folder) || packagedApp === undefined) return;
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-purge-'));
  rmSync(copy, { recursive: true, force: true });
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  markClipDeleted(copy);
  let app: ElectronApplication | undefined = await launch('purge');
  let reopened: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Take', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toHaveCount(0);
    await expect(page.getByText(deletedClip)).toBeVisible();
    await page.getByRole('button', { name: reminderOpen }).click();
    await page.getByRole('button', { name: purgeManuscript }).click();
    await page
      .getByRole('dialog', { name: purgeConfirmTitle })
      .getByRole('button', { name: purgeConfirm })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(deletedClip)).toHaveCount(0);
    await expect(page.getByText(/The purge did not finish|没有清除/)).toHaveCount(0);
    await app.close();
    app = undefined;
    expect(manuscriptTitles(copy)).not.toContain('Clip');
    reopened = await launch('purge-again');
    await stubFolderDialog(reopened, copy);
    const again = await reopened.firstWindow();
    await again.getByRole('button', { name: openFolder }).click();
    await expect(again.getByRole('button', { name: 'Take', exact: true })).toBeVisible();
    await expect(again.getByRole('button', { name: 'Clip', exact: true })).toHaveCount(0);
    await expect(again.getByText(deletedClip)).toHaveCount(0);
  } finally {
    await app?.close();
    await reopened?.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

async function editProject(app: ElectronApplication, projectFolder: string): Promise<Page> {
  await stubFolderDialog(app, projectFolder);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: openFolder }).click();
  await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clip', exact: true }).click();
  const audio = page.locator('audio');
  await waitForAudio(page);
  await page.getByRole('button', { name: '0.4–0.8 two' }).click();
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime))
    .toBeGreaterThan(0.3);
  await page.getByRole('button', { name: '0.0–0.4 one' }).click();
  await page.getByRole('textbox', { name: textLabel }).fill('edited');
  await page.getByRole('button', { name: saveText }).click();
  await expect(page.getByRole('button', { name: '0.0–0.4 edited' })).toBeVisible();
  await page.getByRole('textbox', { name: boundaryLabel }).fill('0.2');
  await page.getByRole('button', { name: moveBoundary }).click();
  await expect(page.getByRole('button', { name: edited })).toBeVisible();
  await page.getByRole('button', { name: edited }).click();
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime))
    .toBeLessThan(0.05);
  await page.getByRole('button', { name: '0.2–0.8 two' }).click();
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime))
    .toBeGreaterThan(0.1);
  return page;
}

function flowReady(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    (devServer !== undefined || packagedApp !== undefined)
  );
}

type ListedUnit = { id: string; text: string; startMs: number | null; endMs: number | null };
type TimeDraftRow = { edge: string; rawInput: string; baseMs: number; conflict: boolean };

function desktopCall<T>(page: Page, sessionId: string, method: string, args: unknown): Promise<T> {
  return page.evaluate(
    async (input) => {
      const host = (window as unknown as FlowWindow).jieyuDesktop;
      return host.desktopCall(input.sessionId, input.method, input.args);
    },
    { sessionId, method, args },
  ) as Promise<T>;
}

async function openLayerHeaderMenu(page: Page, name?: RegExp) {
  const label = page.locator('.desktop-tx-layer-name', name === undefined ? {} : { hasText: name });
  await label.first().click({ button: 'right' });
  const menu = page.getByRole('dialog', { name: /^(层样式|Layer style)$/ });
  await expect(menu).toBeVisible();
  return menu;
}

async function openLayers(page: Page): Promise<void> {
  const layers = page.getByRole('button', { name: /^(层|Layers)\s*\d*$/ });
  const expand = page.getByRole('button', { name: /^(展开功能面板|Expand feature panel)$/ });
  await expect(async () => {
    if (await layers.isVisible()) return;
    await expand.first().click();
    await expect(layers).toBeVisible();
  }).toPass();
  await layers.click();
}

async function dragLayer(
  page: Page,
  fromId: string,
  toId: string,
  cancel: boolean | 'blur',
  beforeUp?: () => Promise<void>,
): Promise<void> {
  const from = page.locator(
    `.desktop-tx-layer-list__line[data-layer-id="${fromId}"] .desktop-tx-context__row`,
  );
  const to = page.locator(
    `.desktop-tx-layer-list__line[data-layer-id="${toId}"] .desktop-tx-context__row`,
  );
  await from.scrollIntoViewIfNeeded();
  await to.scrollIntoViewIfNeeded();
  const fromBox = await from.boundingBox();
  if (fromBox === null) throw new Error('layer row is not visible');
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  if (cancel) {
    if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.keyboard.press('Escape');
    await expect(page.locator('.desktop-tx-context__row.is-drag-only')).toHaveCount(0);
    await page.mouse.up();
    return;
  }
  const toBox = await to.boundingBox();
  if (toBox === null) throw new Error('drop target is not visible');
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 8 });
  if (beforeUp) await beforeUp();
  await page.mouse.up();
}

function linksOfSession(page: Page, sessionId: string, manuscriptId: string, layerId: string) {
  return desktopCall<{ layerId: string; hostLayerId: string; isPreferred: boolean }[]>(
    page,
    sessionId,
    'layers.listLinks',
    { manuscriptId },
  ).then((links) => links.filter((link) => link.layerId === layerId));
}

async function rememberChosenSession(app: ElectronApplication): Promise<void> {
  await app.evaluate((main) => {
    const electron = main as unknown as {
      ipcMain: { _invokeHandlers: Map<string, (...args: unknown[]) => Promise<unknown>> };
    };
    const original = electron.ipcMain._invokeHandlers.get('desktop:choose-folder');
    if (original === undefined) throw new Error('choose-folder handler missing');
    electron.ipcMain._invokeHandlers.set('desktop:choose-folder', async (...args) => {
      const opened = await original(...args);
      (globalThis as { flowSession?: unknown }).flowSession = opened;
      return opened;
    });
  });
}

function chosenSessionId(app: ElectronApplication): Promise<string> {
  return app.evaluate(() => {
    const opened = (globalThis as { flowSession?: { sessionId?: string; cancelled?: boolean } })
      .flowSession;
    if (opened === undefined || opened.cancelled === true || typeof opened.sessionId !== 'string') {
      throw new Error('opened session missing');
    }
    return opened.sessionId;
  });
}

async function seedWords(page: Page, sessionId: string) {
  const clip = await clipLayer(page, sessionId);
  const manuscripts = await desktopCall<{ id: string; title: Record<string, string> }[]>(
    page,
    sessionId,
    'manuscripts.list',
    {},
  );
  const manuscriptId = manuscripts.find((item) => item.title.und === 'Clip')?.id;
  const words = await desktopCall<{ id: string }>(page, sessionId, 'layers.create', {
    manuscriptId,
    key: 'words',
    name: { und: 'Words' },
    tierType: 'time-subdivision',
    contentType: 'transcription',
    sortOrder: 1,
    hosts: [{ hostLayerId: clip.layerId }],
  });
  const hostUnits = await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', {
    layerId: clip.layerId,
  });
  const parent = hostUnits.find((unit) => unit.startMs !== null && unit.endMs !== null);
  if (parent?.startMs == null || parent.endMs == null) throw new Error('host unit missing');
  const mid = Math.round((parent.startMs + parent.endMs) / 2);
  const make = (startMs: number, endMs: number) =>
    desktopCall<{ id: string }>(page, sessionId, 'units.create', {
      layerId: words.id,
      parentUnitId: parent.id,
      startMs,
      endMs,
      text: '',
    });
  const left = await make(parent.startMs, mid);
  const right = await make(mid, parent.endMs);
  return {
    clip,
    words,
    parent: { ...parent, startMs: parent.startMs, endMs: parent.endMs },
    left,
    right,
    mid,
  };
}

async function grantOralModel(page: Page, sessionId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const host = (window as unknown as FlowWindow).jieyuDesktop;
    if (host.chooseTranscriptionModel === undefined) throw new Error('model chooser missing');
    const granted = await host.chooseTranscriptionModel(id);
    if (!granted || !('modelId' in granted)) throw new Error('model not granted');
  }, sessionId);
}

async function findOralPair(
  page: Page,
  sessionId: string,
): Promise<{ audioLayerId: string; textLayerId: string }> {
  const manuscripts = await desktopCall<{ id: string }[]>(page, sessionId, 'manuscripts.list', {});
  for (const manuscript of manuscripts) {
    const layers = await desktopCall<
      { id: string; modality: string; contentType: string; parentId: string | null }[]
    >(page, sessionId, 'layers.list', { manuscriptId: manuscript.id });
    const audio = layers.find(
      (layer) => layer.modality === 'audio' && layer.contentType === 'translation',
    );
    if (audio !== undefined) {
      const list = await desktopCall<{targets: {id: string}[]}>(page, sessionId,
        'recordings.listTargets', {layerId: audio.id});
      const text = list.targets[0];
      if (text !== undefined) return {audioLayerId: audio.id, textLayerId: text.id};
    }
  }
  throw new Error('oral pair missing');
}

async function oralCardAction(page: Page, card: Locator, label: RegExp): Promise<void> {
  const direct = card.getByRole('button', {name: label});
  if (await direct.isVisible()) await direct.click();
  else {
    await card.getByRole('button', {name: /^(更多|More)$/}).click();
    await page.getByRole('menuitem', {name: label}).click();
  }
}

async function chooseOralTarget(page: Page, sessionId: string): Promise<void> {
  const dialog = page.getByRole('dialog', {name: /文字写到哪一层|Where should the text go/});
  await expect(dialog).toBeVisible();
  const manuscripts = await desktopCall<{id: string}[]>(page, sessionId, 'manuscripts.list', {});
  const layers = await desktopCall<{id: string; modality: string; contentType: string}[]>(page,
    sessionId, 'layers.list', {manuscriptId: manuscripts[0]!.id});
  const audio = layers.find(layer => layer.modality === 'audio' && layer.contentType === 'translation');
  if (!audio) throw new Error('oral audio missing');
  const list = await desktopCall<{targets: {id: string; name: Record<string,string>}[]}>(page,
    sessionId, 'recordings.listTargets', {layerId: audio.id});
  if (list.targets.length === 0) {
    await dialog.getByRole('textbox').fill('Oral target');
    await dialog.getByRole('button', {name: /^(写入|Write)$/}).click();
  } else {
    const name = list.targets[0]!.name;
    await dialog.getByRole('button', {name: name.zh ?? name.en ?? Object.values(name)[0] ?? '', exact: true}).click();
  }
}

function oralAttachmentCounts(projectFolder: string): { clips: number; files: number } {
  const db = new Database(join(projectFolder, 'project.sqlite'), { readonly: true });
  try {
    const clips = db
      .prepare('SELECT COUNT(*) AS n FROM unit_text_audios')
      .get() as { n: number };
    const files = db.prepare('SELECT COUNT(*) AS n FROM attachment_files').get() as { n: number };
    return { clips: clips.n, files: files.n };
  } finally {
    db.close();
  }
}

async function startOralModel(onTranscribe?: () => Promise<void>): Promise<{ file: string; close: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-oral-model-'));
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.end(
        JSON.stringify({
          jieyu: '1',
          status: 'ok',
          model: { id: 'app.jieyu.oral-mock', version: '1' },
        }),
      );
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': req.headers['content-type'] ?? '' },
    }).formData();
    const request = JSON.parse(String(form.get('request'))) as {
      requestId: string;
      range: { end: number };
    };
    await onTranscribe?.();
    res.end(
      JSON.stringify({
        jieyu: '1',
        requestId: request.requestId,
        status: 'ok',
        model: { id: 'app.jieyu.oral-mock', version: '1' },
        result: { segments: [{ start: 0, end: request.range.end, text: '口译一句' }] },
      }),
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('oral model port');
  const file = join(dir, 'jieyu-model.json');
  writeFileSync(
    file,
    JSON.stringify({
      id: 'app.jieyu.oral-mock',
      name: 'Oral mock',
      version: '1',
      minJieyuProtocol: '1',
      license: 'MIT',
      capabilities: { transcribe: { wordTimestamps: false, maxAudioSec: 30 } },
      audio: { accept: [{ format: 'wav-pcm16', sampleRate: 16000, channels: 1 }] },
      transport: {
        kind: 'http',
        baseUrl: `http://127.0.0.1:${address.port}`,
        timeoutSecPerChunk: 30,
      },
    }),
  );
  return {
    file,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          rmSync(dir, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

async function clipLayer(page: Page, sessionId: string): Promise<{ layerId: string }> {
  const manuscripts = await desktopCall<{ id: string; title: Record<string, string> }[]>(
    page,
    sessionId,
    'manuscripts.list',
    {},
  );
  const clip = manuscripts.find((item) => item.title.und === 'Clip');
  if (clip === undefined) throw new Error('clip manuscript missing');
  const layers = await desktopCall<{ id: string }[]>(page, sessionId, 'layers.list', {
    manuscriptId: clip.id,
  });
  const layer = layers[0];
  if (layer === undefined) throw new Error('clip layer missing');
  return { layerId: layer.id };
}

async function launch(
  name: string,
  keepUserData?: string,
  extraEnv?: Record<string, string>,
  chromiumArgs?: readonly string[],
  locale: 'en-US' | 'zh-CN' = 'en-US',
): Promise<ElectronApplication> {
  const userData = keepUserData ?? mkdtempSync(join(tmpdir(), `jieyu-m4c-${name}-`));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.JIEYU_SQLITE_STORAGE_PORT;
  if (extraEnv !== undefined) Object.assign(env, extraEnv);
  if (packagedApp !== undefined) delete env.JIEYU_VITE_DEV_SERVER;
  env.JIEYU_DESKTOP_USER_DATA = userData;
  const args = [...(chromiumArgs ?? [])];
  if (packagedApp === undefined) args.push(join(process.cwd(), 'electron/dist/main.js'));
  const app = await electron.launch(
    packagedApp === undefined
      ? { args, env, locale, timeout: 60_000 }
      : { executablePath: packagedApp, args, env, locale, timeout: 60_000 },
  );
  userDataOf.set(app, userData);
  if (keepUserData === undefined) {
    app.process().on('exit', () => {
      rmSync(userData, { recursive: true, force: true });
    });
  }
  return app;
}

async function restoreInto(
  page: Page,
  app: ElectronApplication,
  picked: string | null,
): Promise<void> {
  await stubDialogQueue(app, [picked]);
  await page.getByRole('button', { name: restoreAction }).click();
  await page.getByRole('dialog').getByRole('button', { name: confirmRestore }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function waitForAudio(page: Page): Promise<void> {
  const audio = page.locator('audio');
  const audioState = await audio.evaluate((element) => {
    const media = element as HTMLAudioElement;
    if (media.readyState >= 1) return media.error?.code ?? 0;
    return new Promise<number>((resolve) => {
      const timer = setTimeout(() => resolve(media.error?.code ?? -2), 5000);
      const finish = () => {
        clearTimeout(timer);
        resolve(media.error?.code ?? 0);
      };
      media.addEventListener('loadedmetadata', finish, { once: true });
      media.addEventListener('error', finish, { once: true });
    });
  });
  if (audioState !== 0) throw new Error(`audio state ${audioState}`);
  const ranged = await audio.evaluate(async (element) => {
    const media = element as HTMLAudioElement;
    const response = await fetch(media.src, { headers: { Range: 'bytes=0-3' } });
    return { status: response.status, body: await response.text() };
  });
  expect(ranged).toEqual({ status: 206, body: 'RIFF' });
}

async function stubDialogQueue(
  app: ElectronApplication,
  picks: Array<string | null>,
): Promise<void> {
  await app.evaluate((main, queue) => {
    const host = main as unknown as {
      dialog: { showOpenDialog: () => Promise<{ filePaths: string[] }> };
    };
    const remaining = [...queue];
    host.dialog.showOpenDialog = () => {
      const next = remaining.shift();
      return Promise.resolve({ filePaths: typeof next === 'string' ? [next] : [] });
    };
  }, picks);
}

function soleBackup(userData: string, projectFolder: string): string {
  const dir = join(userData, 'backups', projectBackupKey(projectFolder));
  const names = readdirSync(dir).filter((name) => /^\d{4}-\d{2}-\d{2}\.jym$/.test(name));
  if (names.length !== 1 || names[0] === undefined) {
    throw new Error(`expected one backup, saw ${names.join(',')}`);
  }
  return join(dir, names[0]);
}

function projectBackupKey(projectFolder: string): string {
  return createHash('sha256').update(resolve(projectFolder)).digest('hex');
}

function markClipDeleted(projectFolder: string): void {
  const db = new Database(join(projectFolder, 'project.sqlite'));
  try {
    const rows = db.prepare('SELECT id, title_json FROM manuscripts').all() as {
      id: string;
      title_json: string;
    }[];
    const clip = rows.find((row) => row.title_json.includes('"Clip"'));
    if (clip === undefined) throw new Error('clip manuscript is missing');
    const past = '2020-01-01T00:00:00.000Z';
    db.prepare(
      `UPDATE manuscripts
       SET deleted_at = ?, retain_until = ?, reminder_shown_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(past, past, past, past, clip.id);
  } finally {
    db.close();
  }
}

function manuscriptTitles(projectFolder: string): string[] {
  const db = new Database(join(projectFolder, 'project.sqlite'), { readonly: true });
  try {
    const rows = db.prepare('SELECT title_json FROM manuscripts').all() as { title_json: string }[];
    return rows.flatMap((row) => {
      const title = JSON.parse(row.title_json) as Record<string, string>;
      return Object.values(title);
    });
  } finally {
    db.close();
  }
}

function wavSilence(seconds: number): Buffer {
  const sampleRate = 8000;
  const dataSize = seconds * sampleRate * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

function fileHash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function stubFolderDialog(app: ElectronApplication, projectFolder: string): Promise<void> {
  await app.evaluate((main, picked) => {
    const host = main as unknown as {
      dialog: {
        showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      };
    };
    host.dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [picked] });
  }, projectFolder);
}

async function openFirstUnit(page: Page): Promise<void> {
  await page.getByRole('button', { name: openFolder }).click();
  await page.getByRole('button', { name: 'Clip', exact: true }).click();
  await page
    .getByRole('button', { name: /^0\.0–/ })
    .first()
    .click();
  await expect(page.getByRole('textbox', { name: textLabel })).not.toHaveValue('');
}

async function closeFirstWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate((main) => {
    const host = main as unknown as {
      BrowserWindow: { getAllWindows: () => { close: () => void }[] };
    };
    setTimeout(() => host.BrowserWindow.getAllWindows()[0]?.close(), 0);
  });
}

function unitTexts(projectFolder: string): string[] {
  const db = new Database(join(projectFolder, 'project.sqlite'), { readonly: true });
  try {
    const rows = db.prepare('SELECT body FROM unit_texts').all() as { body: string }[];
    return rows.map((row) => row.body);
  } finally {
    db.close();
  }
}

async function injectTextFault(
  app: ElectronApplication,
  mode: 'before' | 'after' | 'unknown' | 'none',
  choice: number,
) {
  await app.evaluate(
    (main, input) => {
      const electron = main as unknown as {
        ipcMain: { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        dialog: { showMessageBoxSync: () => number };
      };
      const state = globalThis as unknown as {
        textFault?: {
          original: (...args: unknown[]) => unknown;
          writes: number;
          inspections: number;
          asks: number;
        };
      };
      const original =
        state.textFault?.original ?? electron.ipcMain._invokeHandlers.get('desktop:call');
      if (!original) throw new Error('desktop handler missing');
      const fault = { original, writes: 0, inspections: 0, asks: 0 };
      state.textFault = fault;
      electron.ipcMain._invokeHandlers.set('desktop:call', async (...args) => {
        if (args[2] === 'units.inspectTextSave') {
          fault.inspections += 1;
          if (input.mode === 'unknown') throw new Error('injected inspection failure');
        }
        if (args[2] !== 'units.updateText') return original(...args);
        fault.writes += 1;
        if (input.mode === 'before' && (input.choice !== 1 || fault.writes === 1))
          throw new Error('injected precommit failure');
        const result = await original(...args);
        if (input.mode === 'after' || input.mode === 'unknown')
          throw new Error('injected lost receipt');
        return result;
      });
      electron.dialog.showMessageBoxSync = () => {
        fault.asks += 1;
        return input.choice;
      };
    },
    { mode, choice },
  );
}

test('split unit survives close and reopen', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-split-unit-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app: ElectronApplication | undefined = await launch('split-unit');
  let again: ElectronApplication | undefined;
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const clip = await clipLayer(page, sessionId);
    const units = await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', {
      layerId: clip.layerId,
    });
    const ordered = [...units].sort(
      (left, right) =>
        (left.startMs ?? 0) - (right.startMs ?? 0) || left.id.localeCompare(right.id),
    );
    const one = ordered[0];
    const two = ordered[1];
    if (one === undefined || two === undefined) throw new Error('clip units missing');
    await desktopCall(page, sessionId, 'units.moveSharedBoundary', {
      leftId: one.id,
      rightId: two.id,
      time: 500,
      operationId: 'e2e-split-boundary',
    });
    await desktopCall(page, sessionId, 'units.moveEdge', {
      unitId: two.id,
      edge: 'end',
      time: 900,
      operationId: 'e2e-split-edge',
    });
    const made = await desktopCall<{ id: string }>(page, sessionId, 'units.create', {
      layerId: clip.layerId,
      startMs: 1000,
      endMs: 1400,
      text: 'split-me',
      operationId: 'e2e-split-create',
    });
    const split = await desktopCall<{ left: { id: string }; right: { id: string } }>(
      page,
      sessionId,
      'units.split',
      {
        unitId: made.id,
        time: 1200,
        cutIndex: 5,
        rawInput: 'split-me',
        operationId: 'e2e-split',
      },
    );
    expect(await desktopCall(page, sessionId, 'units.get', { id: made.id })).toBeNull();

    await app.close();
    app = undefined;
    again = await launch('split-unit-again');
    await stubFolderDialog(again, copy);
    const reopened = await again.firstWindow();
    await rememberChosenSession(again);
    await reopened.getByRole('button', { name: openFolder }).click();
    await expect(reopened.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const nextSession = await chosenSessionId(again);
    const left = await desktopCall<{ text: string; startMs: number; endMs: number }>(
      reopened,
      nextSession,
      'units.get',
      { id: split.left.id },
    );
    const right = await desktopCall<{ text: string; startMs: number; endMs: number }>(
      reopened,
      nextSession,
      'units.get',
      { id: split.right.id },
    );
    expect(left).toMatchObject({ text: 'split', startMs: 1000, endMs: 1200 });
    expect(right).toMatchObject({ text: '-me', startMs: 1200, endMs: 1400 });
    expect(await desktopCall(reopened, nextSession, 'units.get', { id: made.id })).toBeNull();
  } finally {
    await app?.close();
    await again?.close();
  }
});

function faultState(app: ElectronApplication) {
  return app.evaluate(() => {
    const fault = (
      globalThis as unknown as { textFault?: { writes: number; inspections: number; asks: number } }
    ).textFault;
    return { writes: fault?.writes, inspections: fault?.inspections, asks: fault?.asks };
  });
}

function manuscriptGeneration(folder: string): number {
  const db = new Database(join(folder, 'project.sqlite'), { readonly: true });
  try {
    return (
      db.prepare('SELECT SUM(generation) AS value FROM manuscripts').get() as { value: number }
    ).value;
  } finally {
    db.close();
  }
}

for (const entry of ['wave', 'text', 'wave-empty', 'text-empty', 'text-caret'] as const) {
  test(`split UI ${entry} uses the clicked interior time`, async () => {
    if (!flowReady(folder)) throw new Error('desktop flow folder missing');
    const copy = mkdtempSync(join(tmpdir(), 'jieyu-split-ui-'));
    cpSync(folder, copy, { recursive: true });
    rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
    const app = await launch(`split-ui-${entry}`, undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' });
    try {
      await stubFolderDialog(app, copy);
      const page = await app.firstWindow();
      await rememberChosenSession(app);
      await page.getByRole('button', { name: openFolder }).click();
      await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
      const session = await chosenSessionId(app);
      const clip = await clipLayer(page, session);
      const before = await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId: clip.layerId });
      const target = before.find((unit) => unit.text === 'two');
      if (!target) throw new Error('two missing');
      if (entry.endsWith('empty')) await desktopCall(page, session, 'units.updateText', { unitId: target.id, text: '' });
      await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
      await waitForAudio(page);
      const wave = page.locator(`[data-wave-unit="${target.id}"]`).first();
      await expect(wave).toBeVisible();
      const box = await wave.boundingBox();
      if (!box) throw new Error('wave box missing');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(() => page.locator('audio').evaluate(el => (el as HTMLAudioElement).currentTime)).toBeCloseTo(0.4, 2);
      const selectedBox = await wave.boundingBox();
      if (!selectedBox) throw new Error('selected wave missing');
      await page.mouse.click(selectedBox.x + selectedBox.width / 2, selectedBox.y + selectedBox.height / 2);
      await expect.poll(() => page.locator('audio').evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.5);
      if (entry.startsWith('wave')) {
        const nextBox = await wave.boundingBox();
        if (!nextBox) throw new Error('selected wave box missing');
        await page.mouse.click(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, { button: 'right' });
      } else {
        const card = page.locator(`.timeline-annotation[data-unit-id="${target.id}"]`).first();
        if (entry === 'text-caret') {
          await card.click();
          const editor = card.locator('.timeline-annotation-input');
          await editor.press('Home');
          await editor.press('ArrowRight');
          await expect.poll(() => editor.evaluate(el => (el as HTMLInputElement).selectionStart)).toBe(1);
        }
        await card.click({ button: 'right', position: { x: 5, y: 5 } });
      }
      await page.getByRole('menuitem', { name: /^(Split segment|拆分句段)$/ }).click();
      await expect.poll(() => desktopCall(page, session, 'units.get', { id: target.id })).toBeNull();
      const after = await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId: clip.layerId });
      const halves = after.filter(unit => unit.startMs !== null && unit.endMs !== null && unit.startMs >= 400 && unit.endMs <= 800)
        .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
      expect(halves).toHaveLength(2);
      const [left, right] = halves;
      if (!left || !right) throw new Error('split halves missing');
      expect(left.startMs).toBe(400);
      expect(left.endMs).toBe(right.startMs);
      expect(right.endMs).toBe(800);
      expect(halves.map(unit => unit.text)).toEqual(entry.endsWith('empty') ? ['', ''] : entry === 'text-caret' ? ['t', 'wo'] : ['two', '']);
    } finally { await app.close(); }
  });
}

test('drag create keeps native waveform regions aligned with text cards', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-create-align-'));
  cpSync(process.env.JIEYU_CREATE_ALIGN_SOURCE ?? folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('create-align', undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' });
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('link', { name: /^(Transcription|转写)$/ })).toBeVisible();
    const session = await chosenSessionId(app);
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await waitForAudio(page);
    await expect(page.getByRole('button', { name: /^(Play|播放)$/ })).toBeEnabled();
    const layerId = await page.locator('.desktop-tx-lane__track[data-layer-id]').first().getAttribute('data-layer-id');
    const duration = await page.locator('audio').evaluate(el => (el as HTMLAudioElement).duration);
    const wave = page.getByTestId('desktop-waveform');
    const initialBox = await wave.boundingBox();
    if (!initialBox) throw new Error('wave missing before focus');
    await page.mouse.click(initialBox.x + initialBox.width * 0.45, initialBox.y + initialBox.height / 2);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const largestGap = (units: ListedUnit[], lower: number, upper: number) => {
      let cursor = lower;
      const gaps: Array<readonly [number, number]> = [];
      for (const unit of units.filter(u => u.startMs !== null && u.endMs !== null).sort((a,b) => a.startMs! - b.startMs!)) {
        const left = unit.startMs! / 1000, right = unit.endMs! / 1000;
        if (right <= cursor || left >= upper) continue;
        if (left > cursor) gaps.push([cursor, left]);
        cursor = Math.max(cursor, right);
      }
      if (cursor < upper) gaps.push([cursor, upper]);
      const gap = gaps.sort((a,b) => (b[1]-b[0]) - (a[1]-a[0]))[0];
      if (!gap) throw new Error('no visible gap');
      return gap;
    };
    for (const [from, to] of [[0.5, 0.65], [0.75, 0.9], [0.3, 0.4], [0.2, 0.25]] as const) {
      if (from === 0.3) {
        await page.locator('.desktop-tx-zoom-dock').hover({ force: true });
        const slider = page.locator('.desktop-tx-zoom-slider');
        const sliderBox = await slider.boundingBox();
        if (!sliderBox) throw new Error('slider missing');
        await slider.click({ position: { x: sliderBox.width * 0.6, y: sliderBox.height / 2 } });
        const host = await wave.boundingBox();
        if (!host) throw new Error('wave missing before scroll');
        await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2);
        await page.mouse.wheel(-2000, 0);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      let start = duration * from, end = duration * to;
      const box = await wave.boundingBox();
      if (!box) throw new Error('wave missing');
      const trackBox = await page.locator('.desktop-tx-lane__track[data-layer-id]').first().boundingBox();
      if (!trackBox) throw new Error('track missing');
      const listed = () => desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId });
      const before = await listed();
      const priorIds = new Set(before.map(u => u.id));
      if (from === 0.3) {
        const ratio = trackBox.width / duration;
        const visibleStart = Math.max(0, (box.x - trackBox.x) / ratio);
        const visibleEnd = Math.min(duration, (box.x + box.width - trackBox.x) / ratio);
        const gap = largestGap(before, visibleStart, visibleEnd);
        start = gap[0] + (gap[1]-gap[0]) * 0.2;
        end = gap[0] + (gap[1]-gap[0]) * 0.8;
      }
      if (from === 0.2) {
        // Reproduce a native scroll before React receives its next animation-frame snapshot.
        const gap = largestGap(before, 0, duration);
        const expected = await wave.locator('[part="scroll"]').evaluate((scroll, { duration, gap }) => {
          const wrapper = scroll.querySelector('[part="wrapper"]') as HTMLElement;
          const host = scroll.getRootNode() as ShadowRoot;
          const target = host.host as HTMLElement;
          const rect = target.getBoundingClientRect();
          const scale = wrapper.scrollWidth / duration;
          scroll.scrollLeft = ((gap[0] + gap[1]) / 2) * scale - rect.width / 2;
          scroll.dispatchEvent(new Event('scroll'));
          const lower = Math.max(gap[0], (scroll.scrollLeft + rect.width * 0.1) / scale);
          const upper = Math.min(gap[1], (scroll.scrollLeft + rect.width * 0.9) / scale);
          const x1 = rect.left + (lower + (upper - lower) * 0.2) * scale - scroll.scrollLeft;
          const x2 = rect.left + (lower + (upper - lower) * 0.8) * scale - scroll.scrollLeft;
          const emit = (type: string, x: number, element: EventTarget) => element.dispatchEvent(new PointerEvent(type, {
            bubbles: true, composed: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
            pointerId: 1, pointerType: 'mouse', clientX: x, clientY: rect.top + rect.height / 2, altKey: true,
          }));
          const expected = { start: (scroll.scrollLeft + x1 - rect.left) / scale, end: (scroll.scrollLeft + x2 - rect.left) / scale };
          emit('pointerdown', x1, target);
          emit('pointermove', x2, window);
          emit('pointerup', x2, window);
          return expected;
        }, { duration, gap });
        start = expected.start;
        end = expected.end;
      } else {
      await page.mouse.move(trackBox.x + trackBox.width * start / duration, box.y + box.height / 2);
      await page.keyboard.down('Alt');
      await page.mouse.down();
      await page.mouse.move(trackBox.x + trackBox.width * end / duration, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      await page.keyboard.up('Alt');
      }
      await expect.poll(async () => (await listed()).filter(u => !priorIds.has(u.id)).length).toBe(1);
      const made = (await listed()).find(u => !priorIds.has(u.id))!;
      // Electron 44.11.5 on Linux CI recorded this drag's start 49ms and 66ms off.
      const toleranceMs = Math.max(100, 2000 * duration / trackBox.width);
      expect(Math.abs((made.startMs ?? 0) - start * 1000)).toBeLessThan(toleranceMs);
      expect(Math.abs((made.endMs ?? 0) - end * 1000)).toBeLessThan(toleranceMs);
      const native = wave.locator(`[part~="region"][part~="${made.id}"]`);
      await expect(native).toBeVisible();
      const card = page.locator(`.timeline-annotation[data-unit-id="${made.id}"]`).first();
      await expect(card).toBeVisible();
      await expect.poll(async () => {
        const a = await native.boundingBox();
        const b = await card.boundingBox();
        return a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.width - b.width)) : 999;
      }).toBeLessThan(3);
    }
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('switching to spectrogram or split keeps zoom and wheel scrolling', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder missing');
  const app = await launch('mode-scroll', undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' });
  try {
    await stubFolderDialog(app, folder);
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: openFolder }).click();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await waitForAudio(page);
    await expect(page.getByRole('button', { name: /^(Play|播放)$/ })).toBeEnabled();
    const wave = page.getByTestId('desktop-waveform');
    await page.locator('.desktop-tx-zoom-dock').hover({ force: true });
    const slider = page.locator('.desktop-tx-zoom-slider');
    const sliderBox = await slider.boundingBox();
    if (!sliderBox) throw new Error('slider missing');
    await slider.click({ position: { x: sliderBox.width * 0.95, y: sliderBox.height / 2 } });
    const width = () => wave.locator('[part="wrapper"]').evaluate(el => el.scrollWidth);
    await expect.poll(width).toBeGreaterThan(2000);
    const zoomedWidth = await width();
    for (const mode of [/^(语谱|Spectrogram)$/, /^(分屏|Split view)$/]) {
      await page.getByTestId('desktop-view').locator('summary').click();
      await page.getByRole('menuitemradio', { name: mode }).click();
      await expect(page.getByRole('button', { name: /^(Play|播放)$/ })).toBeEnabled();
      await expect.poll(width).toBeGreaterThan(zoomedWidth - 10);
      const scroll = wave.locator('[part="scroll"]');
      const before = await scroll.evaluate(el => el.scrollLeft);
      const spec = page.locator('.desktop-tx-spectrogram');
      const box = await spec.boundingBox();
      if (!box) throw new Error('spectrogram missing');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(before > 50 ? -200 : 200, 0);
      await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).not.toBe(before);
      await page.getByTestId('desktop-view').locator('summary').click();
      await page.getByRole('menuitemradio', { name: /^(波形|Waveform)$/ }).click();
      await expect(page.getByRole('button', { name: /^(Play|播放)$/ })).toBeEnabled();
    }
  } finally { await app.close(); }
});

test('zoom reveal area passes clicks to the waveform segment beneath it', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder missing');
  const app = await launch('zoom-hit-area', undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' });
  try {
    await stubFolderDialog(app, folder);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: openFolder }).click();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await waitForAudio(page);
    await expect(page.getByRole('button', { name: /^(Play|播放)$/ })).toBeEnabled();
    const wave = page.getByTestId('desktop-waveform');
    const box = await wave.boundingBox();
    if (!box) throw new Error('wave missing');
    const x = box.x + box.width * 0.35, y = box.y + box.height - 60;
    await page.mouse.move(x, y);
    await expect.poll(() => page.locator('.desktop-tx-zoom-dock').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    await page.mouse.click(x, y);
    const card = page.locator('.timeline-annotation', { hasText: 'two' });
    await expect(card).toHaveClass(/timeline-annotation-selected/, { timeout: 3000 });
    await expect.poll(() => page.locator('audio').evaluate(el => (el as HTMLAudioElement).currentTime)).toBeCloseTo(0.4, 2);
    const slider = page.locator('.desktop-tx-zoom-slider');
    const sliderBox = await slider.boundingBox();
    if (!sliderBox) throw new Error('zoom slider missing');
    await page.mouse.move(sliderBox.x + sliderBox.width * 0.6, sliderBox.y + sliderBox.height / 2);
    await slider.click({ position: { x: sliderBox.width * 0.6, y: sliderBox.height / 2 } });
    await expect(page.locator('.desktop-tx-zoom-pct')).not.toHaveText('100%');
    await page.getByRole('button', { name: /^(适应全部|Fit all)$/ }).click();
    await expect(page.locator('.desktop-tx-zoom-pct')).toHaveText('100%');
  } finally { await app.close(); }
});

test('clearing inline text saves an empty body without blocking a segment change', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-clear-text-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app: ElectronApplication | undefined = await launch('clear-text', undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' });
  try {
    await stubFolderDialog(app, copy);
    let page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const session = await chosenSessionId(app);
    const clip = await clipLayer(page, session);
    const units = await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId: clip.layerId });
    const target = units.find(u => u.text === 'two');
    if (!target) throw new Error('target missing');
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    const card = page.locator(`.timeline-annotation[data-unit-id="${target.id}"]`).first();
    await card.click();
    await card.click();
    const editor = card.locator('.timeline-annotation-input');
    await editor.fill('new content');
    await editor.fill('');
    await page.locator('.timeline-annotation', { hasText: 'one' }).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await desktopCall<ListedUnit>(page, session, 'units.get', { id: target.id })).text).toBe('');
    await app.close();
    app = await launch('clear-text-reopen', undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' });
    await stubFolderDialog(app, copy);
    page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const nextSession = await chosenSessionId(app);
    expect((await desktopCall<ListedUnit>(page, nextSession, 'units.get', { id: target.id })).text).toBe('');
  } finally {
    await app?.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

test('merge unit keeps both texts and command m does not minimize', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-merge-unit-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('merge-unit');
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const clip = await clipLayer(page, sessionId);
    const left = await desktopCall<{ id: string }>(page, sessionId, 'units.create', {
      layerId: clip.layerId,
      startMs: 1000,
      endMs: 1200,
      text: '甲',
      operationId: 'e2e-merge-left',
    });
    const right = await desktopCall<{ id: string }>(page, sessionId, 'units.create', {
      layerId: clip.layerId,
      startMs: 1400,
      endMs: 1800,
      text: '乙',
      operationId: 'e2e-merge-right',
    });
    const merged = await desktopCall<{ id: string; text: string }>(page, sessionId, 'units.merge', {
      keepId: left.id,
      removeId: right.id,
      separator: ' ',
      operationId: 'e2e-merge',
    });
    expect(merged.text).toBe('甲 乙');
    await page.keyboard.press('Meta+m');
    const win = await app.browserWindow(page);
    expect(await win.evaluate((browserWindow) => browserWindow.isMinimized())).toBe(false);
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
});

async function run1b4Window(name: string, run: (ctx: { app: ElectronApplication; page: Page; session: string; layerId: string }) => Promise<void>, extraArgs: string[] = []) {
  if (!flowReady(folder)) throw new Error('desktop flow fixture missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-1b4-runtime-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  let app = await launch(name, undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' }, extraArgs);
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const session = await chosenSessionId(app);
    const { layerId } = await clipLayer(page, session);
    await run({ app, page, session, layerId });
    const before = await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId });
    const manuscripts = await desktopCall<{ id: string }[]>(page, session, 'manuscripts.list', {});
    if (!manuscripts[0]) throw new Error('manuscript missing');
    const layers = await desktopCall<{ id: string; modality: string }[]>(page, session, 'layers.list', { manuscriptId: manuscripts[0].id });
    const audioLayers = layers.filter(layer => layer.modality === 'audio');
    const recordings = await Promise.all(audioLayers.map(layer => desktopCall(page, session, 'recordings.list', { layerId: layer.id })));
    await app.close();
    app = await launch(`${name}-reopen`, undefined, { JIEYU_DESKTOP_HIDE_WINDOW: '0' });
    await stubFolderDialog(app, copy);
    const reopened = await app.firstWindow();
    await rememberChosenSession(app);
    await reopened.getByRole('button', { name: openFolder }).click();
    await expect(reopened.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const nextSession = await chosenSessionId(app);
    expect(await desktopCall(reopened, nextSession, 'units.list', { layerId })).toEqual(before);
    expect(await Promise.all(audioLayers.map(layer => desktopCall(reopened, nextSession, 'recordings.list', { layerId: layer.id })))).toEqual(recordings);
  } finally {
    // A failed assertion can leave a live recording; discard only this isolated test window.
    await app.evaluate((main) => {
      const host = main as unknown as {BrowserWindow: {getAllWindows: () => {destroy: () => void}[]}};
      for (const window of host.BrowserWindow.getAllWindows()) window.destroy();
    }).catch(() => {});
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
}

async function open1b4(page: Page) {
  await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
  await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Play|播放)$/ })).toBeEnabled();
}

async function offer1b4(page: Page, layerId: string, unitId: string) {
  const card = page.locator(`.desktop-tx-lane__track[data-layer-id="${layerId}"] .timeline-annotation[data-unit-id="${unitId}"]`);
  await card.click();
  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /向后合并|Merge with the next/ }).click();
  const dialog = page.getByRole('dialog', { name: /合并下一段|Merge with the next segment/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function finish1b4(page: Page, session: string, layerId: string) {
  const prior = new Set((await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId })).map(u => u.id));
  await page.getByRole('dialog').locator('button.btn-primary').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let made: ListedUnit | undefined;
  await expect.poll(async () => {
    made = (await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId })).find(u => !prior.has(u.id));
    return made?.id;
  }).toBeTruthy();
  if (!made) throw new Error('merged unit missing');
  return made;
}

test('1b4 runtime menu cancel shortcut merge undo redo and no next', async () => {
  await run1b4Window('1b4-basic', async ({ app, page, session, layerId }) => {
    const left = await desktopCall<{ id: string }>(page, session, 'units.create', { layerId, startMs: 1000, endMs: 1200, text: '甲' });
    const right = await desktopCall<{ id: string }>(page, session, 'units.create', { layerId, startMs: 1400, endMs: 1800, text: '乙' });
    await open1b4(page);
    await page.locator(`.timeline-annotation[data-unit-id="${right.id}"]`).first().click();
    await waitForAudio(page);
    const wave = page.locator(`[data-wave-unit="${left.id}"]`).first();
    const box = await wave.boundingBox();
    if (!box) throw new Error('wave merge target missing');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.getByTestId('desktop-wave-menu').getByRole('menuitem', { name: /向后合并|Merge with/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('0.200');
    await expect(dialog).not.toContainText('备注');
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await dialog.getByRole('button', { name: /^(取消|Cancel)$/ }).last().click();
    expect((await desktopCall<ListedUnit>(page, session, 'units.get', { id: left.id })).text).toBe('甲');
    expect((await desktopCall<ListedUnit>(page, session, 'units.get', { id: right.id })).text).toBe('乙');
    await page.locator(`.timeline-annotation[data-unit-id="${left.id}"]`).first().click();
    await page.keyboard.press('Meta+m');
    await expect(page.getByRole('dialog')).toBeVisible();
    const merged = await finish1b4(page, session, layerId);
    expect(merged).toMatchObject({ text: '甲 乙', startMs: 1000, endMs: 1800 });
    expect(await desktopCall(page, session, 'units.get', { id: left.id })).toBeNull();
    expect(await desktopCall(page, session, 'units.get', { id: right.id })).toBeNull();
    await page.keyboard.press('Meta+z');
    await expect.poll(() => desktopCall(page, session, 'units.get', { id: left.id })).not.toBeNull();
    expect((await desktopCall<ListedUnit>(page, session, 'units.get', { id: right.id })).text).toBe('乙');
    await page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId })).some(u => u.text === '甲 乙')).toBe(true);
    const last = (await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId })).find(u => u.text === '甲 乙');
    if (!last) throw new Error('redo result missing');
    const card = page.locator(`.timeline-annotation[data-unit-id="${last.id}"]`).first();
    await card.click();
    await page.keyboard.press('Meta+m');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const win = await app.browserWindow(page);
    expect(await win.evaluate(w => w.isMinimized())).toBe(false);
    await card.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: /向后合并|Merge with the next/ })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('1b4-basic.png') });
  });
});

for (const dropBeforeCommit of [false, true]) {
  test(`1b4 runtime recovers a lost ${dropBeforeCommit ? 'request' : 'committed reply'} exactly once`, async () => {
    await run1b4Window('1b4-receipt', async ({ app, page, session, layerId }) => {
      const before = await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId });
      const left = before[0];
      if (!left) throw new Error('merge source missing');
      await open1b4(page);
      await offer1b4(page, layerId, left.id);
      await app.evaluate((main, dropBefore) => {
        const host = main as unknown as { ipcMain: { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> } };
        const original = host.ipcMain._invokeHandlers.get('desktop:call');
        if (!original) throw new Error('desktop handler missing');
        const fault = { writes: [] as string[], inspections: 0, dropped: false };
        (globalThis as unknown as { mergeFault: typeof fault }).mergeFault = fault;
        host.ipcMain._invokeHandlers.set('desktop:call', async (...args) => {
          if (args[2] === 'units.inspectEdit') fault.inspections += 1;
          if (args[2] !== 'units.merge') return original(...args);
          fault.writes.push((args[3] as { operationId: string }).operationId);
          if (dropBefore && !fault.dropped) {
            fault.dropped = true;
            throw new Error('injected lost merge request');
          }
          const result = await original(...args);
          if (!fault.dropped) {
            fault.dropped = true;
            throw new Error('injected lost merge reply');
          }
          return result;
        });
      }, dropBeforeCommit);
      const joined = await finish1b4(page, session, layerId);
      expect(joined.text).toBe('one two');
      const fault = await app.evaluate(() => (globalThis as unknown as { mergeFault: { writes: string[]; inspections: number } }).mergeFault);
      expect(fault.inspections).toBe(1);
      expect(fault.writes).toHaveLength(dropBeforeCommit ? 2 : 1);
      expect(new Set(fault.writes).size).toBe(1);
      await desktopCall(page, session, 'units.undo', {});
      expect(await desktopCall(page, session, 'units.list', { layerId })).toEqual(before);
      await desktopCall(page, session, 'units.redo', {});
      expect((await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId }))[0]?.id).toBe(joined.id);
    });
  });
}

test('1b4 runtime merges current editor text exactly once', async () => {
  await run1b4Window('1b4-editor', async ({ page, session, layerId }) => {
    const units = await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId });
    const left = units.find(u => u.text === 'one');
    if (!left) throw new Error('left missing');
    await open1b4(page);
    const card = page.locator(`.timeline-annotation[data-unit-id="${left.id}"]`).first();
    await card.click();
    await card.click();
    const input = card.locator('.timeline-annotation-input');
    await input.fill('新输入');
    await input.evaluate((element) => (element as HTMLInputElement).blur());
    await expect.poll(async () => (await desktopCall<ListedUnit>(page, session, 'units.get', { id: left.id })).text).toBe('新输入');
    await card.click();
    await page.keyboard.press('Meta+m');
    await expect(page.getByRole('dialog')).toBeVisible();
    const oldIds = new Set((await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId })).map(u => u.id));
    await expect(page.getByRole('dialog').locator('button.btn-primary')).toBeEnabled();
    await page.getByRole('dialog').locator('button.btn-primary').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const merged = (await desktopCall<ListedUnit[]>(page, session, 'units.list', { layerId })).find(u => !oldIds.has(u.id));
    if (!merged) throw new Error('editor merge result missing');
    expect(merged.text).toBe('新输入 two');
    await page.screenshot({ path: test.info().outputPath('1b4-editor.png') });
  });
});

test('1b4 runtime six recordings discard preview playlist play and delete', async () => {
  await run1b4Window('1b4-recordings', async ({ app, page, session, layerId }) => {
    const pair = await desktopCall<{ audioLayerId: string }>(page, session, 'recordings.createPair', { hostLayerId: layerId, kind: 'oral', audioName: { und: 'Runtime oral' }, textName: { und: 'Runtime translation' } });
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const unit = await desktopCall<{ id: string }>(page, session, 'units.create', { layerId, startMs: 900 + i * 130, endMs: 1000 + i * 130, text: String.fromCharCode(65 + i) });
      ids.push(unit.id);
      await page.evaluate(async ({ session, unitId, audioLayerId, index }) => {
        const bytes = new Uint8Array(32044), v = new DataView(bytes.buffer);
        const word = (at: number, s: string) => [...s].forEach((c, j) => v.setUint8(at + j, c.charCodeAt(0)));
        word(0, 'RIFF'); v.setUint32(4, 32036, true); word(8, 'WAVE'); word(12, 'fmt '); v.setUint32(16, 16, true);
        v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); word(36, 'data'); v.setUint32(40, 32000, true);
        for (let n = 0; n < 16000; n++) v.setInt16(44 + n * 2, Math.round(Math.sin(n * 2 * Math.PI * (220 + index * 40) / 16000) * 6000), true);
        await (window as unknown as FlowWindow).jieyuDesktop.desktopCall(session, 'recordings.attach', { unitId, layerId: audioLayerId, mimeType: 'audio/wav', bytes, operationId: `runtime-audio-${index}` });
      }, { session, unitId: unit.id, audioLayerId: pair.audioLayerId, index: i });
    }
    await open1b4(page);
    const merge = async (id: string) => { await offer1b4(page, layerId, id); return finish1b4(page, session, layerId); };
    const ab = await merge(ids[0]!);
    const abc = await merge(ab.id);
    const de = await merge(ids[3]!);
    await merge(de.id);
    const dialog = await offer1b4(page, layerId, abc.id);
    await expect(dialog.locator('.desktop-tx-merge__row')).toHaveCount(6);
    await expect(dialog.locator('button.btn-primary')).toBeDisabled();
    await expect(dialog.locator('.desktop-tx-merge__time')).toHaveCount(6);
    await expect(dialog.locator('.desktop-tx-merge__time').first()).toHaveText(/1\s*(秒|s)/);
    await dialog.getByRole('button', { name: /^(试听|Play)$/ }).first().click();
    const audibleWindow = await app.browserWindow(page);
    await expect.poll(() => audibleWindow.evaluate(w => (w as unknown as { webContents: { isCurrentlyAudible(): boolean } }).webContents.isCurrentlyAudible()), { timeout: 3000, intervals: [50] }).toBe(true);
    await dialog.getByRole('checkbox').last().check();
    await expect(dialog.locator('button.btn-primary')).toBeEnabled();
    const joined = await finish1b4(page, session, layerId);
    const beforeSplit = await desktopCall<{id: string; unitId: string; fileId: string}[]>(page, session, 'recordings.list', {layerId: pair.audioLayerId});
    expect(beforeSplit).toHaveLength(5);
    const wave = page.locator(`[data-wave-unit="${joined.id}"]`).first();
    const waveBox = await wave.boundingBox();
    if (!waveBox) throw new Error('recorded split target missing');
    await page.mouse.click(waveBox.x + waveBox.width / 2, waveBox.y + waveBox.height / 2, {button: 'right'});
    await page.getByTestId('desktop-wave-menu').getByRole('menuitem', {name: /^(拆分句段|Split segment)$/}).click();
    await expect(page.getByText(/5 条录音已完整保留在左段|5 recordings were kept intact in the left segment/)).toBeVisible();
    const splitClips = await desktopCall<{id: string; unitId: string; fileId: string}[]>(page, session, 'recordings.list', {layerId: pair.audioLayerId});
    expect(splitClips.map(clip => [clip.id, clip.fileId])).toEqual(beforeSplit.map(clip => [clip.id, clip.fileId]));
    const halves = (await desktopCall<ListedUnit[]>(page, session, 'units.list', {layerId})).filter(u => u.startMs !== null && u.endMs !== null && u.startMs >= joined.startMs! && u.endMs <= joined.endMs!);
    expect(halves).toHaveLength(2);
    const leftHalf = halves.sort((a,b) => a.startMs! - b.startMs!)[0]!;
    expect(splitClips.every(clip => clip.unitId === leftHalf.id)).toBe(true);
    await page.keyboard.press('Meta+z');
    await expect.poll(() => desktopCall(page, session, 'units.get', {id: joined.id})).not.toBeNull();
    expect(await desktopCall(page, session, 'recordings.list', {layerId: pair.audioLayerId})).toEqual(beforeSplit);

    const audioCard = page.locator(`[data-layer-id="${pair.audioLayerId}"] .timeline-annotation[data-unit-id="${joined.id}"]`);
    const listButton = audioCard.getByRole('button', { name: /^(播放清单|Playlist)$/ });
    await expect(listButton).toBeVisible();
    const audio = audioCard.locator('audio');
    await listButton.click();
    const menu = page.getByRole('menu').filter({
      has: page.getByText(/^(第 1 条，还剩 4 条|Clip 1, 4 left)$/),
    });
    await expect(menu).toBeVisible();
    const buttonBox = await listButton.boundingBox(), menuBox = await menu.boundingBox();
    if (!buttonBox || !menuBox) throw new Error('playlist geometry missing');
    expect(menuBox.x).toBeGreaterThanOrEqual(buttonBox.x + buttonBox.width);
    await menu.getByRole('menuitem', { name: /^(第 3 条|Clip 3)$/ }).click();
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
    await audioCard.getByRole('button', { name: /^(播放录音翻译|Play recorded translation)$/ }).click();
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(false);
    await audioCard.getByRole('button', { name: /^(删除录音翻译|Delete recorded translation)$/ }).click();
    await listButton.click();
    await expect(page.getByText(/^(第 3 条，还剩 1 条|Clip 3, 1 left)$/)).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(第 \d 条|Clip \d)$/ })).toHaveCount(4);
    await page.getByRole('menuitem', { name: /^(第 4 条|Clip 4)$/ }).click();
    await audioCard.getByRole('button', { name: /^(删除录音翻译|Delete recorded translation)$/ }).click();
    await listButton.click();
    await expect(page.getByText(/^(第 3 条，还剩 0 条|Clip 3, 0 left)$/)).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^(第 \d 条|Clip \d)$/ })).toHaveCount(3);
    await page.screenshot({ path: test.info().outputPath('1b4-playlist.png') });
  });
});


test('oral recording safety pauses resumes retries lost receipts and protects concurrent text', async () => {
  let requests = 0;
  let release = () => {};
  let pending = Promise.resolve();
  const holdModel = () => { pending = new Promise<void>(resolve => {release = resolve;}); };
  const model = await startOralModel(async () => { requests++; await pending; });
  try {
    await run1b4Window('oral-safety', async ({app, page, session, layerId}) => {
      const unit = (await desktopCall<ListedUnit[]>(page,session,'units.list',{layerId})).find(u => u.text === 'one');
      if (!unit) throw new Error('oral safety unit missing');
      const pair = await desktopCall<{audioLayerId:string}>(page,session,'recordings.createPair',{hostLayerId:layerId,kind:'oral',audioName:{und:'Safety audio'},textName:{und:'Safety text'}});
      const manuscript = await desktopCall<{id:string}[]>(page,session,'manuscripts.list',{});
      const target = await desktopCall<{id:string}>(page,session,'layers.create',{
        manuscriptId:manuscript[0]!.id,key:'oral-safety-target',name:{en:'Safety text',zh:'Safety text'},
        tierType:'symbolic-association',contentType:'translation',
        hosts:[{hostLayerId:layerId,preferred:true}],
      });
      await open1b4(page);
      await page.evaluate(() => {
        const state = window as unknown as {oralRecorders: MediaRecorder[]};
        state.oralRecorders = [];
        const start = MediaRecorder.prototype.start;
        MediaRecorder.prototype.start = function (...args) { state.oralRecorders.push(this); return start.apply(this,args); };
        const stop = Object.getOwnPropertyDescriptor(MediaRecorder.prototype, 'onstop');
        if (!stop?.set || !stop.get) throw new Error('native stop descriptor missing');
        Object.defineProperty(MediaRecorder.prototype,'onstop',{
          configurable:true,
          get:stop.get,
          set(handler: ((event: Event) => void) | null) {
            stop.set!.call(this, handler === null ? null : (event: Event) => setTimeout(() => handler.call(this,event), 250));
          },
        });
      });
      await app.evaluate(main => {
        const host = main as unknown as {ipcMain:{_invokeHandlers:Map<string,(...args:unknown[]) => unknown>}};
        const original = host.ipcMain._invokeHandlers.get('desktop:call');
        if (!original) throw new Error('desktop handler missing');
        const fault = {writes: [] as string[], failed:false};
        (globalThis as unknown as {oralFault:typeof fault}).oralFault = fault;
        host.ipcMain._invokeHandlers.set('desktop:call',async (...args) => {
          if (args[2] !== 'recordings.attach') return original(...args);
          fault.writes.push((args[3] as {operationId:string}).operationId);
          const result = await original(...args);
          if (!fault.failed) {fault.failed=true; throw new Error('injected lost attachment response');}
          return result;
        });
      });
      const card = page.locator(`[data-layer-id="${pair.audioLayerId}"] .timeline-annotation[data-unit-id="${unit.id}"]`);
      await card.getByRole('button',{name:/^(开始录音翻译|Start recording translation)$/}).click();
      await expect(card.getByRole('button',{name:/^(暂停录音|Pause recording)$/})).toBeVisible();
      await page.waitForTimeout(1100);
      await card.getByRole('button',{name:/^(暂停录音|Pause recording)$/}).click();
      const status = card.locator('.oral-clip-time');
      const pausedAt = await status.textContent();
      await page.waitForTimeout(1100);
      await expect(status).toHaveText(pausedAt ?? '');
      expect(await page.evaluate(() => (window as unknown as {oralRecorders:MediaRecorder[]}).oralRecorders[0]?.state)).toBe('paused');
      await card.getByRole('button',{name:/^(继续录音|Resume recording)$/}).click();
      expect(await page.evaluate(() => (window as unknown as {oralRecorders:MediaRecorder[]}).oralRecorders.length)).toBe(1);
      await page.waitForTimeout(400);
      const stopAt = await card.getByRole('button',{name:/^(停止录音翻译|Stop recording translation)$/}).boundingBox();
      if (!stopAt) throw new Error('stop button missing');
      await page.mouse.click(stopAt.x+stopAt.width/2,stopAt.y+stopAt.height/2);
      await page.mouse.click(stopAt.x+stopAt.width/2,stopAt.y+stopAt.height/2);
      await expect(card.getByRole('button',{name:/^(重试保存|Retry save)$/})).toBeVisible();
      const clips = () => desktopCall<{id:string;unitId:string;fileId:string}[]>(page,session,'recordings.list',{layerId:pair.audioLayerId});
      expect(await clips()).toHaveLength(1);
      await card.getByRole('button',{name:/^(重试保存|Retry save)$/}).click();
      await expect(card.getByRole('button',{name:/^(播放录音翻译|Play recorded translation)$/})).toBeVisible();
      expect(await clips()).toHaveLength(1);
      const retryIds = await app.evaluate(() => (globalThis as unknown as {oralFault:{writes:string[]}}).oralFault.writes);
      expect(retryIds).toHaveLength(2);
      expect(retryIds[0]).toBe(retryIds[1]);
      await oralCardAction(page,card,/^(再录一条|Record another)$/);
      await expect(card.getByRole('button',{name:/^(暂停录音|Pause recording)$/})).toBeVisible();
      await page.waitForTimeout(450);
      await card.getByRole('button',{name:/^(停止录音翻译|Stop recording translation)$/}).click();
      await expect.poll(async () => (await clips()).length).toBe(2);
      await expect(card.getByRole('button',{name:/^(播放清单|Playlist)$/})).toBeVisible();
      const second = (await clips())[1]!;
      await card.getByRole('button',{name:/^(播放录音翻译|Play recorded translation)$/}).click();
      await expect.poll(() => card.locator('audio').evaluate(audio => (audio as HTMLAudioElement).paused)).toBe(false);
      await stubFolderDialog(app,model.file);
      await grantOralModel(page,session);
      const transcribe = () => oralCardAction(page,card,/^(语音转文字（STT）|Transcribe recording \(STT\))$/);
      const readDraft = () => desktopCall<{rawInput:string;provenanceJson:string|null}|null>(page,session,'units.readTextDraft',{unitId:unit.id,textLayerId:target.id});
      holdModel();
      await transcribe();
      await chooseOralTarget(page,session);
      await expect.poll(() => requests).toBe(1);
      await desktopCall(page,session,'units.putTextDraft',{unitId:unit.id,textLayerId:target.id,rawInput:'manual draft',baseBody:''});
      release();
      await expect(page.getByText(/这段已有未保存的文字|This line already has unsaved text/)).toBeVisible();
      expect(await readDraft()).toMatchObject({rawInput:'manual draft',provenanceJson:null});
      await desktopCall(page,session,'units.discardTextDraft',{unitId:unit.id,textLayerId:target.id});
      holdModel();
      await transcribe();
      await chooseOralTarget(page,session);
      await expect.poll(() => requests).toBe(2);
      await desktopCall(page,session,'units.updateText',{unitId:unit.id,textLayerId:target.id,text:'manual body'});
      release();
      await expect(page.getByText(/文字已变化，未写入转写结果|The text changed; the transcript was not written/)).toBeVisible();
      expect(await readDraft()).toBeNull();
      pending=Promise.resolve();
      await transcribe();
      await chooseOralTarget(page,session);
      await expect.poll(async () => (await readDraft())?.rawInput).toBe('口译一句');
      const draft = await readDraft();
      expect(JSON.parse(draft?.provenanceJson ?? '')).toMatchObject({model:'app.jieyu.oral-mock',params:{audioFileId:second.fileId,audioId:second.id,audioLayerId:pair.audioLayerId}});
      await page.screenshot({path:test.info().outputPath('oral-safety.png')});
    }, ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']);
  } finally {
    release();
    await model.close();
  }
});

test('wave segment controls receive pointer actions above drag handles', async () => {
  await run1b4Window('wave-controls', async ({page}) => {
    await open1b4(page);
    await waitForAudio(page);
    await page.locator('.timeline-annotation',{hasText:'one'}).first().click();
    const overlay=page.locator('.region-action-overlay');
    await expect(overlay).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      // A portalled drag layer may mount after the selected segment controls.
      const handles=document.querySelector('.desktop-tx-wave-edges');
      if(!handles?.parentElement) throw new Error('drag layer missing');
      handles.parentElement.appendChild(handles);
    });
    const loop=overlay.locator('.region-action-btn').first();
    await loop.click({timeout:3000});
    await expect(loop).toHaveClass(/region-action-btn-active/);
    await loop.click();
    await expect(loop).not.toHaveClass(/region-action-btn-active/);
    const slider=overlay.locator('.segment-speed-slider');
    const sliderBox=await slider.boundingBox();
    if(!sliderBox) throw new Error('speed slider missing');
    await page.mouse.click(sliderBox.x+sliderBox.width-2,sliderBox.y+sliderBox.height/2);
    await expect(overlay.locator('.segment-speed-label')).toHaveText('2.0x');
    await expect.poll(()=>page.locator('audio').evaluate(el=>(el as HTMLAudioElement).playbackRate)).toBe(2);
    await overlay.locator('.segment-speed-label').click();
    await expect(overlay.locator('.segment-speed-label')).toHaveText('1x');
    const play=overlay.locator('.region-action-btn').last();
    await play.click();
    await expect.poll(()=>page.locator('audio').evaluate(el=>(el as HTMLAudioElement).paused),{intervals:[10]}).toBe(false);
    await play.click();
    await expect.poll(()=>page.locator('audio').evaluate(el=>(el as HTMLAudioElement).paused)).toBe(true);
    expect(await overlay.evaluate(node=>{
      const speed=node.querySelector('.segment-speed-control')!.getBoundingClientRect();
      const button=node.querySelector('button')!.getBoundingClientRect();
      const hit=document.elementFromPoint((speed.right+button.left)/2,button.top+button.height/2);
      return hit?.closest('.region-action-overlay')===null;
    })).toBe(true);
    await page.screenshot({path:test.info().outputPath('wave-controls.png')});
  });
});

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`正字法转写：添加、合并取消和按层清空保留宿主 (${locale})`, () => orthographyFlow(locale));
}

async function orthographyFlow(locale: 'en-US' | 'zh-CN') {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-orthography-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('orthography', undefined, undefined, undefined, locale);
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await rememberChosenSession(app);
    await page.getByRole('button', { name: openFolder }).click();
    await expect(page.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    const sessionId = await chosenSessionId(app);
    const { layerId } = await clipLayer(page, sessionId);
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    await expect(page.getByTestId('desktop-transcription-workspace')).toBeVisible();
    await page.locator('.desktop-tx-layer-label').first().click({ button: 'right' });
    await page.getByRole('button', { name: /^(新建层|New layer)$/ }).click();
    await page.getByRole('menuitem', { name: /^(添加正字法转写|Add orthographic transcription)$/ }).click();
    const manuscripts = await desktopCall<{ id: string; title: Record<string, string> }[]>(page, sessionId, 'manuscripts.list', {});
    const manuscriptId = manuscripts.find(row => Object.values(row.title).includes('Clip'))?.id;
    if (!manuscriptId) throw new Error('Clip manuscript missing');
    const listLayers = () => desktopCall<{ id: string; tierType: string; contentType: string; modality: string }[]>(page, sessionId, 'layers.list', { manuscriptId });
    await expect.poll(async () => (await listLayers()).filter(row => row.tierType === 'symbolic-association' && row.contentType === 'transcription' && row.modality === 'text').length).toBe(1);
    const spelling = (await listLayers()).find(row => row.tierType === 'symbolic-association' && row.contentType === 'transcription' && row.modality === 'text')!;
    const originals = await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId });
    const first = originals[0];
    if (!first) throw new Error('fixture segment missing');
    await desktopCall(page, sessionId, 'units.updateText', { unitId: first.id, textLayerId: layerId, text: '' });
    await page.getByRole('link', { name: /^(Home|首页)$/ }).click();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    const emptyOwner = page.locator(`.desktop-tx-lane[data-layer-id="${layerId}"] .timeline-annotation`).first();
    await expect(emptyOwner).toBeVisible();
    await expect(emptyOwner).toHaveClass(/timeline-annotation-empty/);
    expect(await emptyOwner.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await waitForAudio(page);
    for (const surface of ['spelling', 'waveform']) {
      await page.locator(`.desktop-tx-lane[data-layer-id="${spelling.id}"] .desktop-tx-layer-name`).click();
      const target = surface === 'spelling'
        ? page.locator(`.desktop-tx-lane[data-layer-id="${spelling.id}"] .desktop-tx-lane__track`)
        : page.getByTestId('desktop-waveform');
      const box = await target.boundingBox();
      if (!box) throw new Error(`${surface} missing`);
      await page.mouse.move(box.x + box.width * 0.55, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + 10, { steps: 8 });
      await page.mouse.up();
      const listed = () => desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId });
      await expect.poll(async () => (await listed()).length).toBe(originals.length + 1);
      const added = (await listed()).find(unit => !originals.some(original => original.id === unit.id));
      if (!added) throw new Error('shared segment missing');
      for (const id of [layerId, spelling.id]) {
        const card = page.locator(`.desktop-tx-lane[data-layer-id="${id}"] [data-unit-id="${added.id}"]`);
        await expect(card).toBeVisible();
        expect(await card.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      }
      await page.screenshot({ path: test.info().outputPath(`orthography-${surface}-create.png`) });
      await desktopCall(page, sessionId, 'units.undo', { manuscriptId });
      await page.getByRole('link', { name: /^(Home|首页)$/ }).click();
      await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
      await waitForAudio(page);
    }
    const connection = await page.evaluate(({ owner, spelling }) => {
      const guide = document.querySelector(`.desktop-tx-lane[data-layer-id="${owner}"] .tree-guide.is-own`)?.getBoundingClientRect();
      const elbow = document.querySelector(`.desktop-tx-lane[data-layer-id="${spelling}"] .tree-elbow`)?.getBoundingClientRect();
      return guide && elbow ? { dx: elbow.x - guide.x, gap: elbow.y - guide.bottom } : null;
    }, { owner: layerId, spelling: spelling.id });
    expect(connection?.dx).toBe(0);
    expect(connection?.gap).toBeCloseTo(0, 0);
    await desktopCall(page, sessionId, 'units.updateText', { unitId: first.id, textLayerId: layerId, text: first.text });
    await desktopCall(page, sessionId, 'units.updateText', { unitId: first.id, textLayerId: spelling.id, text: 'ka' });
    await desktopCall(page, sessionId, 'units.putTextDraft', { unitId: first.id, textLayerId: spelling.id, rawInput: 'kaa', baseBody: 'ka' });
    await page.getByRole('link', { name: /^(Home|首页)$/ }).click();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    const rootCard = page.locator(`.desktop-tx-lane[data-layer-id="${layerId}"] .timeline-annotation`).first();
    await rootCard.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+m' : 'Control+m');
    const merge = page.getByRole('dialog', { name: /^(合并下一段|Merge with the next segment)$/ });
    await expect(merge).toBeVisible();
    await expect(merge.locator('input').filter({ visible: true }).first()).toBeVisible();
    await expect(merge.getByText(/未保存草稿|Unsaved draft/, { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('orthography-merge.png') });
    await merge.locator('.btn-secondary').getByText(/^(取消|Cancel)$/).click();
    expect((await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId })).length).toBe(originals.length);
    const row = page.locator(`.desktop-tx-lane[data-layer-id="${spelling.id}"]`);
    await row.locator('.timeline-annotation').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^(清空「|Clear “)/ }).click();
    const clear = page.getByRole('dialog', { name: /^(清空当前写法？|Clear this writing\?)$/ });
    await clear.getByRole('button', { name: /^(清空本层正文与草稿|Clear this layer’s text and drafts)$/ }).click();
    await expect.poll(async () => (await desktopCall<{ text: string; draftText: string | null }[]>(page, sessionId, 'units.list', { layerId: spelling.id }))[0]).toMatchObject({ text: '', draftText: null });
    expect((await desktopCall<ListedUnit[]>(page, sessionId, 'units.list', { layerId }))[0]?.text).toBe(first.text);
    await desktopCall(page, sessionId, 'units.undo', { manuscriptId });
    const splitPreview = await desktopCall<{ baseline: string }>(page, sessionId, 'units.splitPreview', { unitId: first.id });
    await desktopCall(page, sessionId, 'units.split', {
      unitId: first.id, time: 200, textLayerId: layerId, baseline: splitPreview.baseline,
      formalCuts: [{ layerId, cutIndex: first.text.length }, { layerId: spelling.id, cutIndex: 1 }],
    });
    await page.getByRole('link', { name: /^(Home|首页)$/ }).click();
    await page.getByRole('link', { name: /^(Transcription|转写)$/ }).click();
    const leftCard = page.locator(`.desktop-tx-lane[data-layer-id="${spelling.id}"] .timeline-annotation`).first();
    await leftCard.click();
    await leftCard.click();
    const conflict = page.getByRole('dialog', { name: /^(未保存草稿|Unsaved draft)$/ });
    await expect(conflict).toBeVisible();
    await expect(conflict.getByRole('button', { name: /^(保留草稿|Keep draft)$/ }).last()).toBeFocused();
    await page.screenshot({ path: test.info().outputPath('orthography-conflict.png') });
    await conflict.getByRole('button', { name: /^(用草稿覆盖左段|Overwrite left segment with draft)$/ }).click();
    await expect(conflict).toHaveCount(0);
    await expect.poll(async () => (await desktopCall<{ text: string; draftText: string | null }[]>(page, sessionId, 'units.list', { layerId: spelling.id }))[0]).toMatchObject({ text: 'kaa', draftText: null });
    expect((await desktopCall<{ text: string }[]>(page, sessionId, 'units.list', { layerId: spelling.id }))[1]?.text).toBe('a');
    await page.locator(`.desktop-tx-lane[data-layer-id="${layerId}"] .desktop-tx-layer-label`).click({ button: 'right' });
    await page.getByRole('button', { name: /^(新建层|New layer)$/ }).click();
    await page.getByRole('menuitem', { name: /^(新建翻译层|New translation layer)$/ }).click();
    await expect.poll(async () => (await listLayers()).filter(layer => layer.contentType === 'translation').length).toBe(1);
    const translation = (await listLayers()).find(layer => layer.contentType === 'translation')!;
    await expect(page.locator(`.desktop-tx-lane[data-layer-id="${translation.id}"] .desktop-tx-layer-name`)).toBeVisible();
    const offsets = await page.evaluate(({ owner, translation, spelling }) => {
      const x = (id: string) => document.querySelector(`.desktop-tx-lane[data-layer-id="${id}"] .tree-elbow, .desktop-tx-lane[data-layer-id="${id}"] .tree-guide.is-own`)!.getBoundingClientRect().x;
      return { translation: x(translation) - x(owner), spelling: x(spelling) - x(owner) };
    }, { owner: layerId, translation: translation.id, spelling: spelling.id });
    expect(offsets.translation).toBeGreaterThan(0);
    expect(offsets.spelling).toBe(0);
    await page.screenshot({ path: test.info().outputPath('orthography-translation-indent.png') });
    const addVoice = async () => {
      await page.locator(`.desktop-tx-lane[data-layer-id="${layerId}"] .desktop-tx-layer-label`).click({ button: 'right' });
      await page.getByRole('button', { name: /^(新建层|New layer)$/ }).click();
      await page.getByRole('menuitem', { name: /^(新建语音转写|New careful speech)$/ }).click();
    };
    await addVoice();
    await expect.poll(async () => (await listLayers()).filter(layer => layer.modality === 'audio' && layer.contentType === 'transcription').length).toBe(1);
    await addVoice();
    await expect(page.getByText(/当前时间主人已有语音转写或口译层|This timing owner already has a voice transcription or oral translation layer/).first()).toBeVisible();
  } finally {
    await app.close();
    rmSync(copy, { recursive: true, force: true });
  }
}
