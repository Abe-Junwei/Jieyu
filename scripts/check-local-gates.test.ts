import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
// @ts-expect-error — existing Node guard scripts use .mjs without declarations
import { changedPaths, checksFor } from './check-changed.mjs';
// @ts-expect-error — existing Node guard scripts use .mjs without declarations
import { checkSelectors } from './check-desktop-selectors.mjs';

const roots: string[] = [];
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-local-gates-'));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('config', 'core.hooksPath', '/dev/null');
  const write = (file: string, text = 'fixture') => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write('README.md');
  git('add', '.');
  git('commit', '-qm', 'base');
  return { root, git, write };
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

it('selects existing CSS gates for CSS, TSX, tokens and guard configuration, but not documentation', () => {
  for (const path of [
    'src/styles/new.css',
    'src/pages/DesktopFoo.tsx',
    'src/utils/layerStyle.ts',
    'design/paper/tokens.json',
    'scripts/check-css-a11y.mjs',
    'lint-staged.config.mjs',
    'package.json',
    'vite.config.ts',
  ]) {
    expect(checksFor([path]).slice(0, 3)).toEqual([
      ['check:css-architecture'],
      ['check:css-a11y'],
      ['test:visual-css'],
    ]);
  }
  expect(checksFor(['docs/readme.md'])).toEqual([]);
  expect(checksFor(['src/i18n/dictionaries/en-US.ts'])).toContainEqual(['check:desktop-selectors']);
});

it('runs independent schema contracts and the retained test of a removed UI module', () => {
  const { root, write } = repo();
  write('src/pages/DesktopFoo.test.tsx');
  const checks = checksFor(['src/db/desktop/schema.ts', 'src/pages/DesktopFoo.tsx'], root);
  expect(checks[checks.length - 1]).toEqual([
    'exec',
    'vitest',
    'run',
    'src/db/desktop/schema.test.ts',
    'src/pages/DesktopFoo.test.tsx',
  ]);
});

it('finds committed, staged, unstaged, untracked, deleted and renamed paths without breaking spaces or Chinese', () => {
  const { root, git, write } = repo();
  write('src/styles/旧 文件.css');
  write('deleted.ts');
  git('add', '.');
  git('commit', '-qm', 'seed');
  const base = git('rev-parse', 'HEAD');
  git('checkout', '-qb', 'feature');
  renameSync(join(root, 'src/styles/旧 文件.css'), join(root, 'src/styles/new file.css'));
  rmSync(join(root, 'deleted.ts'));
  git('add', '.');
  git('commit', '-qm', 'rename and delete');
  write('staged.ts');
  git('add', '.');
  write('README.md', 'unstaged');
  write('新文件.ts');
  expect(changedPaths(root, { base })).toEqual(
    [
      'README.md',
      'deleted.ts',
      'src/styles/new file.css',
      'src/styles/旧 文件.css',
      'staged.ts',
      '新文件.ts',
    ].sort(),
  );
});

it('uses push SHAs, supports new branches and deletion, and rejects mismatched or dirty checkouts', () => {
  const { root, git, write } = repo();
  const before = git('rev-parse', 'HEAD');
  git('checkout', '-qb', 'feature');
  write('src/styles/new.css');
  git('add', '.');
  git('commit', '-qm', 'change');
  const after = git('rev-parse', 'HEAD');
  const input = (local: string, remote: string) =>
    `refs/heads/feature ${local} refs/heads/feature ${remote}\n`;
  const zero = '0'.repeat(40);
  expect(changedPaths(root, { pushInput: input(after, before) })).toEqual(['src/styles/new.css']);
  expect(changedPaths(root, { pushInput: input(after, 'f'.repeat(40)) })).toEqual([
    'README.md',
    'src/styles/new.css',
  ]);
  expect(changedPaths(root, { pushInput: input(after, zero) })).toEqual(['src/styles/new.css']);
  expect(changedPaths(root, { pushInput: input(zero, before) })).toEqual([]);
  expect(() => changedPaths(root, { pushInput: input(before, after) })).toThrow(/Check out/);
  write('untracked.ts');
  expect(() => changedPaths(root, { pushInput: input(after, before) })).toThrow(
    /clean working tree/,
  );
});

it('a docs-only CLI plan does not run npm or modify files', () => {
  const { root, write } = repo();
  write('docs/guide.md');
  const result = spawnSync(
    process.execPath,
    [resolve('scripts/check-changed.mjs'), '--base', 'HEAD', '--dry-run'],
    { cwd: root, encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('1 changed path(s)');
  expect(result.stdout).not.toContain('npm run');
});

it('checks all files on the initial push instead of comparing HEAD with itself', () => {
  const { root, git } = repo();
  const head = git('rev-parse', 'HEAD');
  expect(
    changedPaths(root, {
      pushInput: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`,
    }),
  ).toEqual(['README.md']);
});

it('marks agent verification for absolute and relative desktop-test paths', () => {
  const { root, write } = repo();
  write('.cursor/hooks/placeholder');
  write('scripts/placeholder');
  write('tests/e2e-desktop/flow.spec.ts');
  for (const file of ['.cursor/hooks/after-file-edit-format.mjs', 'scripts/check-changed.mjs']) {
    copyFileSync(resolve(file), join(root, file));
  }
  const sentinel = join(root, '.cursor/hooks/.verify-pending');
  for (const file of [
    'tests/e2e-desktop/flow.spec.ts',
    join(root, 'tests/e2e-desktop/flow.spec.ts'),
  ]) {
    const result = spawnSync(
      process.execPath,
      [join(root, '.cursor/hooks/after-file-edit-format.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        input: JSON.stringify({ file_path: file }),
      },
    );
    expect(result.status).toBe(0);
    expect(existsSync(sentinel)).toBe(true);
    rmSync(sentinel);
  }
});

it('the hook CLI rejects an invalid checkout before executing checks', () => {
  const { root, git } = repo();
  const head = git('rev-parse', 'HEAD');
  const result = spawnSync(process.execPath, [resolve('scripts/check-changed.mjs'), '--pre-push'], {
    cwd: root,
    encoding: 'utf8',
    input: `refs/heads/main ${head} refs/heads/main invalid-sha\n`,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('check:changed');
});

it('executes the real pre-push hook against a local bare remote and blocks an unverified working tree', () => {
  const { root, git, write } = repo();
  const remote = mkdtempSync(join(tmpdir(), 'jieyu-gate-remote-'));
  roots.push(remote);
  git('init', '--bare', '-q', remote);
  git('remote', 'add', 'origin', remote);
  git('config', 'core.hooksPath', '.git/hooks');
  write('scripts/check-changed.mjs');
  write('.git/info/exclude', 'scripts/check-changed.mjs\n');
  copyFileSync(resolve('scripts/check-changed.mjs'), join(root, 'scripts/check-changed.mjs'));
  copyFileSync(resolve('.husky/pre-push'), join(root, '.git/hooks/pre-push'));
  chmodSync(join(root, '.git/hooks/pre-push'), 0o755);
  const push = () => spawnSync('git', ['push', 'origin', 'main'], { cwd: root, encoding: 'utf8' });
  expect(push().status).toBe(0);
  write('docs/new.md');
  git('add', '.');
  git('commit', '-qm', 'guide');
  write('untracked.ts');
  const rejected = push();
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toContain('clean working tree');
});

it('checks label literals, regexes, constants and filter text, while preserving English and fixture exceptions', () => {
  expect(
    checkSelectors(`
    const label = /^新建语音转写$/;
    page.getByRole('menuitem', { name: label });
    page.getByText('合并');
    page.getByLabel(/名称/);
    page.locator('button').filter({ hasText: '删除' });
  `),
  ).toHaveLength(4);
  expect(
    checkSelectors(`
    page.getByRole('button', { name: 'Merge with the next segment', exact: true });
    page.getByText(/^(Delete|删除)$/);
    // desktop-selector-data: 中文文稿名是用户提供的测试数据。
    page.getByRole('button', { name: '中文文稿', exact: true });
    // desktop-selector-locale: zh-CN case explicitly verifies Chinese UI.
    page.getByRole('button', { name: '打开项目文件夹' });
  `),
  ).toEqual([]);
});

it('handles shadowed constants and does not mistake regex syntax for an English label', () => {
  expect(
    checkSelectors(String.raw`
    const label = '删除';
    page.getByText(label);
    function english() { const label = 'Delete'; page.getByText(label); }
    page.getByRole('button', { name: /^删除\s*\d+$/ });
    page.getByText(/^\u5220\u9664$/);
  `),
  ).toHaveLength(3);
});
