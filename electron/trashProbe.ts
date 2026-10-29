import { app } from 'electron';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trashFile } from './trashFile';

app
  .whenReady()
  .then(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jieyu-trash-probe-'));
    const file = join(dir, 'synthetic.txt');
    try {
      writeFileSync(file, 'synthetic');
      const result = await trashFile(file);
      if (result !== 'moved') {
        console.error('temp file was not trashed');
        app.exit(1);
        return;
      }
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
