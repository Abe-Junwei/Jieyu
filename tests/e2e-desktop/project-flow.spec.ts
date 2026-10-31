import type { DesktopReadHost } from '../../src/desktop/projectReadHost';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
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
import { tmpdir } from 'node:os';
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
const offsetLabel = /^(Offset seconds|偏移秒|app\.desktopRead\.offset)$/;
const saveMapping = /^(Save time mapping|保存时间映射|app\.desktopRead\.saveMapping)$/;
const edited = '0.0–0.2 edited';
const played = '1.0–1.2';
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
  const first = await launch('first');
  let second: ElectronApplication | undefined;
  let third: ElectronApplication | undefined;
  try {
    const page = await editProject(first, folder);
    second = await launch('second');
    const refused = await second.firstWindow();
    await stubFolderDialog(second, folder);
    await refused.getByRole('button', { name: openFolder }).click();
    await expect(refused.getByRole('alert')).toBeVisible();
    await expect(refused.getByRole('button', { name: edited })).toHaveCount(0);
    await second.close();
    second = undefined;
    await expect(page.getByRole('button', { name: edited })).toBeVisible();
    await first.close();
    third = await launch('third');
    const again = await third.firstWindow();
    await stubFolderDialog(third, folder);
    await again.getByRole('button', { name: openFolder }).click();
    await expect(again.getByRole('button', { name: 'Clip', exact: true })).toBeVisible();
    await expect(again.getByRole('button', { name: edited })).toBeVisible();
    await expect(again.getByText(played)).toBeVisible();
  } finally {
    await second?.close();
    await third?.close();
    await first.close();
  }
});

test('asks before closing a window with an unsaved text draft', async () => {
  if (!flowReady(folder)) throw new Error('desktop flow folder and app are missing');
  const copy = mkdtempSync(join(tmpdir(), 'jieyu-m4c-draft-'));
  cpSync(folder, copy, { recursive: true });
  rmSync(join(copy, '.jieyu.lock'), { recursive: true, force: true });
  const app = await launch('draft-close');
  let closed = false;
  let savedText = '';
  try {
    await stubFolderDialog(app, copy);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: openFolder }).click();
    await page.getByRole('button', { name: 'Clip', exact: true }).click();
    await page
      .getByRole('button', { name: /^0\.0–/ })
      .first()
      .click();
    await expect(page.getByRole('textbox', { name: textLabel })).not.toHaveValue('');
    savedText = await page.getByRole('textbox', { name: textLabel }).inputValue();
    await page.getByRole('textbox', { name: textLabel }).fill('unsaved draft');
    await stubCloseAnswer(app, 0);
    await closeFirstWindow(app);
    await expect.poll(() => closeAsks(app)).toBe(1);
    await expect(page.getByRole('textbox', { name: textLabel })).toHaveValue('unsaved draft');
    await stubCloseAnswer(app, 1);
    const gone = page.waitForEvent('close');
    await closeFirstWindow(app);
    await gone;
    closed = true;
    expect(await closeAsks(app)).toBe(2);
  } finally {
    if (!closed) await app.close();
    else await app.close().catch(() => {});
  }
  expect(unitTexts(copy)).not.toContain('unsaved draft');
  expect(unitTexts(copy)).toContain(savedText);
  rmSync(copy, { recursive: true, force: true });
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
  await page.getByRole('textbox', { name: offsetLabel }).fill('1');
  await page.getByRole('button', { name: saveMapping }).click();
  await expect(page.getByRole('button', { name: edited })).toBeVisible();
  await expect(page.getByText(played)).toBeVisible();
  await page.getByRole('button', { name: edited }).click();
  await expect
    .poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime))
    .toBeGreaterThan(0.9);
  return page;
}

function flowReady(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    (devServer !== undefined || packagedApp !== undefined)
  );
}

async function launch(name: string, keepUserData?: string): Promise<ElectronApplication> {
  const userData = keepUserData ?? mkdtempSync(join(tmpdir(), `jieyu-m4c-${name}-`));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.JIEYU_SQLITE_STORAGE_PORT;
  if (packagedApp !== undefined) delete env.JIEYU_VITE_DEV_SERVER;
  env.JIEYU_DESKTOP_USER_DATA = userData;
  const app = await electron.launch(
    packagedApp === undefined
      ? { args: [join(process.cwd(), 'electron/dist/main.js')], env, timeout: 60_000 }
      : { executablePath: packagedApp, env, timeout: 60_000 },
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

async function stubCloseAnswer(app: ElectronApplication, answer: number): Promise<void> {
  await app.evaluate((main, picked) => {
    const host = main as unknown as { dialog: { showMessageBoxSync: () => number } };
    const holder = globalThis as unknown as { __closeAsks?: number };
    host.dialog.showMessageBoxSync = () => {
      holder.__closeAsks = (holder.__closeAsks ?? 0) + 1;
      return picked;
    };
  }, answer);
}

function closeAsks(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => (globalThis as unknown as { __closeAsks?: number }).__closeAsks ?? 0);
}

async function closeFirstWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate((main) => {
    const host = main as unknown as {
      BrowserWindow: { getAllWindows: () => { close: () => void }[] };
    };
    host.BrowserWindow.getAllWindows()[0]?.close();
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
