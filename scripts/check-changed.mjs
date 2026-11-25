import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}
function paths(root, ...args) {
  return git(root, ...args)
    .split('\0')
    .filter(Boolean);
}
function baseOf(root, firstPush = false) {
  for (const ref of ['@{upstream}', 'refs/remotes/origin/main', 'refs/heads/main', 'HEAD']) {
    try {
      const base = git(root, 'merge-base', 'HEAD', ref);
      if (!firstPush || base !== git(root, 'rev-parse', 'HEAD')) return base;
    } catch {
      /* Try the next existing base. */
    }
  }
  return git(root, 'hash-object', '-w', '-t', 'tree', '--stdin');
}

/** Manual checks include working changes; pre-push checks the actual refs and requires matching checkout. */
export function changedPaths(root, { base, pushInput } = {}) {
  if (pushInput !== undefined) {
    const selected = new Set();
    for (const line of pushInput.trim().split('\n').filter(Boolean)) {
      const [, local, , remote] = line.trim().split(/\s+/);
      if (
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(local ?? '') ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(remote ?? '')
      )
        throw new Error('Malformed pre-push input');
      if (/^0+$/.test(local)) continue; // Ref deletion has no source to check.
      if (git(root, 'rev-parse', `${local}^{commit}`) !== git(root, 'rev-parse', 'HEAD')) {
        throw new Error(
          'Check out the pushed commit before running this hook; another ref cannot be verified against this working tree.',
        );
      }
      if (git(root, 'status', '--porcelain', '--untracked-files=all')) {
        throw new Error(
          'Pre-push needs a clean working tree so checks verify the pushed commit. Commit or set aside changes; use check:changed while editing.',
        );
      }
      let before = remote;
      if (/^0+$/.test(remote)) before = baseOf(root, true);
      else {
        try {
          git(root, 'cat-file', '-e', `${remote}^{commit}`);
        } catch {
          before = git(root, 'hash-object', '-w', '-t', 'tree', '--stdin');
        }
      }
      paths(root, 'diff', '--name-only', '-z', '--no-renames', before, local, '--').forEach(
        (file) => selected.add(file),
      );
    }
    return [...selected].sort();
  }
  return [
    ...new Set([
      ...paths(root, 'diff', '--name-only', '-z', '--no-renames', base ?? baseOf(root), '--'),
      ...paths(root, 'ls-files', '--others', '--exclude-standard', '-z'),
    ]),
  ].sort();
}

export function checksFor(files, root = process.cwd()) {
  const checks = [];
  const css = files.some(
    (file) =>
      /^src\/styles\//.test(file) ||
      (/^src\/.*\.tsx$/.test(file) && !/\.(test|spec)\./.test(file)) ||
      /^src\/.*style.*\.ts$/i.test(file) ||
      /^(design\/.*tokens|scripts\/(check-css|css-|test-visual-css)|(?:lint-staged|stylelint|\.stylelint|vite\..*config)|package\.json$)/.test(
        file,
      ),
  );
  if (css) checks.push(['check:css-architecture'], ['check:css-a11y'], ['test:visual-css']);
  if (
    files.some((file) =>
      /^(tests\/e2e-desktop\/|src\/i18n\/|scripts\/check-desktop-selectors|playwright\.desktop)/.test(
        file,
      ),
    )
  )
    checks.push(['check:desktop-selectors']);
  const tests = new Set();
  for (const file of files) {
    if (/\.test\.[cm]?[jt]sx?$/.test(file) && existsSync(resolve(root, file))) tests.add(file);
    if (
      /^src\/(?:db\/desktop|desktop|pages|components|hooks\/desktop)\/.*\.[tj]sx?$/.test(file) &&
      !/\.(test|spec)\./.test(file)
    ) {
      const stem = file.replace(/\.[tj]sx?$/, '');
      for (const ext of ['ts', 'tsx'])
        if (existsSync(resolve(root, `${stem}.test.${ext}`))) tests.add(`${stem}.test.${ext}`);
    }
  }
  if (files.includes('src/db/desktop/schema.ts')) tests.add('src/db/desktop/schema.test.ts');
  if (
    files.some((file) =>
      /^(scripts\/check-(changed|desktop-selectors)|\.husky\/pre-push|\.cursor\/hooks\/(after-file-edit-format|stop-verify))/.test(
        file,
      ),
    )
  )
    tests.add('scripts/check-local-gates.test.ts');
  if (tests.size) checks.push(['exec', 'vitest', 'run', ...[...tests].sort()]);
  return checks;
}

export function main(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const baseIndex = argv.indexOf('--base');
  if (baseIndex >= 0 && !argv[baseIndex + 1]) throw new Error('--base requires a Git ref');
  const files = changedPaths(root, {
    ...(baseIndex >= 0 ? { base: argv[baseIndex + 1] } : {}),
    ...(argv.includes('--pre-push') ? { pushInput: readFileSync(0, 'utf8') } : {}),
  });
  const checks = checksFor(files, root);
  console.log(
    `[check:changed] ${files.length} changed path(s); checks use the whole working tree, never rewrite baselines.`,
  );
  if (
    files.some(
      (file) => /^src\/(pages|desktop|components)\//.test(file) && !/\.(test|spec)\./.test(file),
    )
  ) {
    console.log(
      '[check:changed] UI changed: review removed/renamed actions and their tests; run the relevant desktop-flow case with --grep before completion (not the full suite in this hook).',
    );
  }
  let status = 0;
  for (const check of checks) {
    const args = check[0] === 'exec' ? ['exec', '--', ...check.slice(1)] : ['run', ...check];
    console.log(`[check:changed] npm ${args.join(' ')}`);
    if (argv.includes('--dry-run')) continue;
    const started = performance.now();
    const result =
      check[0] === 'exec'
        ? spawnSync(
            process.execPath,
            [resolve(root, 'node_modules/vitest/vitest.mjs'), ...check.slice(2)],
            { cwd: root, stdio: 'inherit' },
          )
        : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
            cwd: root,
            stdio: 'inherit',
            shell: process.platform === 'win32',
          });
    console.log(`[check:changed] ${check.join(' ')} ${(performance.now() - started).toFixed(0)}ms`);
    if (result.status !== 0) status = result.status ?? 1;
  }
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[check:changed] ${error.message}`);
    process.exitCode = 1;
  }
}
