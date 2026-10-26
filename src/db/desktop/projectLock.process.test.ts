import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-lock-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function holder(dir: string): Promise<{ child: ReturnType<typeof spawn>; line: string }> {
  const script = join(
    process.cwd(),
    `.jieyu-lock-holder-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`,
  );
  roots.push(script);
  const lockModule = pathToFileURL(join(process.cwd(), 'src/desktop/skeleton/projectLock.ts')).href;
  writeFileSync(
    script,
    `import { releaseProjectLock, tryAcquireProjectLock } from ${JSON.stringify(lockModule)};
import Database from 'better-sqlite3';
import { join } from 'node:path';

const dir = process.argv[2];
const result = tryAcquireProjectLock(dir);
if (!result.ok) {
  process.stdout.write('busy\\n');
  process.exit(0);
}
const db = new Database(join(dir, 'writes.sqlite'));
db.exec('CREATE TABLE writes (pid INTEGER NOT NULL)');
db.prepare('INSERT INTO writes (pid) VALUES (?)').run(process.pid);
db.close();
process.stdout.write('acquired\\n');
process.stdin.resume();
process.stdin.on('end', () => {
  releaseProjectLock(dir);
  process.exit(0);
});
`,
  );
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', script, dir],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`lock holder timed out: ${stdout} ${stderr}`));
    }, 5000);
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      const line = stdout.split('\n').find((item) => item === 'acquired' || item === 'busy');
      if (line === undefined) return;
      clearTimeout(timer);
      resolve({ child, line });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      if (stdout.includes('acquired') || stdout.includes('busy')) return;
      clearTimeout(timer);
      reject(new Error(`holder exited ${code}: ${stdout} ${stderr}`));
    });
  });
}

describe('project lock processes', () => {
  it('lets only one of two child processes write', async () => {
    const dir = folder();
    const first = await holder(dir);
    expect(first.line).toBe('acquired');
    const second = await holder(dir);
    expect(second.line).toBe('busy');
    first.child.stdin?.end();
    second.child.stdin?.end();
    await new Promise<void>((resolve, reject) => {
      first.child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`holder exited ${code}`));
      });
    });
    expect(readdirSync(dir).filter((name) => name === 'writes.sqlite')).toEqual(['writes.sqlite']);
  }, 15000);
});
