import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = process.env.JIEYU_DESKTOP_FLOW_FOLDER;
const devServer = process.env.JIEYU_VITE_DEV_SERVER;
const openFolder = /Open folder|打开文件夹|app\.desktopRead\.openFolder/;
const textLabel = /^(Text|正文|app\.desktopRead\.text)$/;
const saveText = /Save text|保存正文|app\.desktopRead\.saveText/;
const boundaryLabel = /Literature boundary|文献边界|app\.desktopRead\.boundary/;
const moveBoundary = /Move boundary|移动边界|app\.desktopRead\.moveBoundary/;
const offsetLabel = /Offset seconds|偏移秒|app\.desktopRead\.offset/;
const saveMapping = /Save time mapping|保存时间映射|app\.desktopRead\.saveMapping/;
const edited = '0.0–0.2 edited';
const played = '1.0–1.2';

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

test('opens, plays, edits, refuses a second process, and reads the edit back', async () => {
  if (folder === undefined || folder.length === 0 || devServer === undefined) {
    throw new Error('desktop flow folder and dev server are missing');
  }
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
    await expect(again.getByRole('button', { name: 'Clip' })).toBeVisible();
    await expect(again.getByRole('button', { name: edited })).toBeVisible();
    await expect(again.getByText(played)).toBeVisible();
  } finally {
    await second?.close();
    await third?.close();
    await first.close();
  }
});

async function editProject(app: ElectronApplication, projectFolder: string): Promise<Page> {
  await stubFolderDialog(app, projectFolder);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: openFolder }).click();
  await expect(page.getByRole('button', { name: 'Clip' })).toBeVisible();
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

async function launch(name: string): Promise<ElectronApplication> {
  const userData = mkdtempSync(join(tmpdir(), `jieyu-m4c-${name}-`));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.JIEYU_SQLITE_STORAGE_PORT;
  env.JIEYU_DESKTOP_PROJECT_READ = '1';
  env.JIEYU_DESKTOP_USER_DATA = userData;
  const app = await electron.launch({
    args: [join(process.cwd(), 'electron/dist/main.js')],
    env,
    timeout: 60_000,
  });
  app.process().on('exit', () => {
    rmSync(userData, { recursive: true, force: true });
  });
  return app;
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
