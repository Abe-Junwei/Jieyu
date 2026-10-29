import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const [folder, file, roles] = process.argv.slice(2);
if (folder === undefined || file === undefined) {
  console.error('usage: node scripts/import-desktop-file.mjs <folder> <file> [roles]');
  process.exit(1);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { importForeignFile } = await server.ssrLoadModule('/src/db/desktop/foreignImport.ts');
  const result = importForeignFile({
    folder,
    file,
    ...(roles === undefined ? {} : { roles }),
  });
  for (const projectPath of result.paths) console.log(projectPath);
  console.log(`写入 ${result.written} 条`);
  for (const notice of result.unprojected) console.log(`${notice.name}: ${notice.reason}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'import failed');
  process.exitCode = 1;
} finally {
  await server.close();
}
