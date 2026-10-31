import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const recordPath = 'scripts/old-path-exit.record.json';
const surfaces = ['production', 'scripts', 'ci', 'e2e', 'keep'];

function safeName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !name.startsWith('/') &&
    !name.split('/').includes('..')
  );
}

export function oldPathExitViolations(record, exists, read) {
  if (typeof record !== 'object' || record === null || !Array.isArray(record.entries)) {
    return ['old-path record is missing'];
  }
  const violations = [];
  if (record.entries.length === 0) violations.push('old-path record is empty');
  const seen = new Set();
  for (const entry of record.entries) {
    const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : '(unnamed)';
    if (!surfaces.includes(entry.surface)) violations.push(`${id} has no surface`);
    else seen.add(entry.surface);
    if (entry.action !== 'keep' && entry.action !== 'delete') {
      violations.push(`${id} has no action`);
      continue;
    }
    if (entry.surface === 'keep' && entry.action === 'delete') {
      violations.push(`${id} would remove userData or collaboration`);
      continue;
    }
    const paths = Array.isArray(entry.paths) ? entry.paths : [];
    const replacement = Array.isArray(entry.replacement) ? entry.replacement : [];
    if (paths.length === 0) violations.push(`${id} names no path`);
    if (entry.surface !== 'keep' && replacement.length === 0) {
      violations.push(`${id} names no replacement`);
    }
    for (const name of [...paths, ...replacement]) {
      if (!safeName(name)) violations.push(`${id} has an unsafe path`);
    }
    if (entry.action === 'keep') {
      for (const name of paths) {
        if (safeName(name) && !exists(name)) violations.push(`${id} missing ${name}`);
      }
      for (const name of replacement) {
        if (safeName(name) && !exists(name)) violations.push(`${id} missing replacement ${name}`);
      }
      if (Array.isArray(entry.markers)) {
        const text = paths
          .filter((name) => safeName(name) && exists(name))
          .map((name) => read(name))
          .join('\n');
        for (const marker of entry.markers) {
          if (!text.includes(marker)) violations.push(`${id} missing marker ${marker}`);
        }
      }
    }
    if (entry.action === 'delete') {
      for (const name of replacement) {
        if (!safeName(name) || !exists(name)) violations.push(`${id} missing replacement ${name}`);
      }
      for (const name of paths) {
        if (safeName(name) && exists(name)) violations.push(`${id} still has ${name}`);
      }
    }
  }
  for (const surface of surfaces) {
    if (!seen.has(surface)) violations.push(`missing ${surface}`);
  }
  return violations;
}

function selfCheck() {
  const present = () => true;
  const absent = () => false;
  const readMarker = () => 'preferences cache backups models';
  const keep = {
    id: 'sample',
    surface: 'keep',
    action: 'keep',
    paths: ['src/desktop/skeleton/userDataLayout.ts'],
    markers: ['backups'],
  };
  const covered = (extra) => ({
    entries: [
      { ...keep },
      {
        id: 'production',
        surface: 'production',
        action: 'keep',
        paths: ['old.tsx'],
        replacement: ['new.tsx'],
      },
      {
        id: 'scripts',
        surface: 'scripts',
        action: 'keep',
        paths: ['old.mjs'],
        replacement: ['new.mjs'],
      },
      {
        id: 'ci',
        surface: 'ci',
        action: 'keep',
        paths: ['old.yml'],
        replacement: ['new.yml'],
      },
      {
        id: 'e2e',
        surface: 'e2e',
        action: 'keep',
        paths: ['playwright.config.ts'],
        replacement: ['flow.mjs'],
      },
      extra,
    ],
  });
  const noReplacement = oldPathExitViolations(
    covered({
      id: 'gone',
      surface: 'production',
      action: 'delete',
      paths: ['old.tsx'],
      replacement: [],
    }),
    absent,
    readMarker,
  );
  const stillThere = oldPathExitViolations(
    covered({
      id: 'gone',
      surface: 'production',
      action: 'delete',
      paths: ['old.tsx'],
      replacement: ['new.tsx'],
    }),
    present,
    readMarker,
  );
  const removedKeep = oldPathExitViolations(
    covered({
      id: 'user-data',
      surface: 'keep',
      action: 'delete',
      paths: ['src/desktop/skeleton/userDataLayout.ts'],
      replacement: ['src/db/desktop/openProject.ts'],
    }),
    absent,
    readMarker,
  );
  const ready = oldPathExitViolations(
    covered({
      id: 'gone',
      surface: 'production',
      action: 'delete',
      paths: ['removed.tsx'],
      replacement: ['new.tsx'],
    }),
    (name) => name !== 'removed.tsx',
    readMarker,
  );
  if (
    !noReplacement.some((item) => item.includes('names no replacement')) ||
    !stillThere.some((item) => item.includes('still has')) ||
    !removedKeep.some((item) => item.includes('would remove')) ||
    ready.length !== 0
  ) {
    console.error('[check-old-path-exit] self-check failed');
    process.exit(1);
  }
}

selfCheck();
const record = JSON.parse(fs.readFileSync(path.join(root, recordPath), 'utf8'));
const violations = oldPathExitViolations(
  record,
  (name) => fs.existsSync(path.join(root, name)),
  (name) => fs.readFileSync(path.join(root, name), 'utf8'),
);
if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  process.exit(1);
}
console.log('[check-old-path-exit] OK');
