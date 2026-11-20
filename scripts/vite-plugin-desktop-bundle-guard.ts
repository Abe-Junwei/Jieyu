import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

type BundleItem = { fileName: string; modules?: Record<string, unknown> };

export function legacyZoneRoots(): string[] {
  const parsed = JSON.parse(readFileSync(join(repoRoot, 'scripts/legacy-zone.json'), 'utf8')) as {
    roots: string[];
  };
  return parsed.roots;
}

function cleanId(id: string): string {
  return id.split('?')[0]?.replaceAll('\\', '/') ?? id;
}

export function moduleHitsLegacyRoot(id: string, root: string): boolean {
  const clean = cleanId(id);
  if (root === 'dexie') return clean.includes('/node_modules/dexie/');
  return clean.endsWith(`/${root}`);
}

export function serviceWorkerFile(name: string): boolean {
  const base = name.split('/').pop() ?? name;
  return base === 'sw.js' || base === 'registerSW.js' || base.startsWith('workbox-');
}

/** Ids and file names only. Do not scan source: sentry-vendor has an unused `indexedDB.open`. */
export function desktopBundleViolations(
  moduleIds: Iterable<string>,
  fileNames: Iterable<string>,
  roots: readonly string[],
): string[] {
  const hits: string[] = [];
  for (const id of moduleIds) {
    const root = roots.find((item) => moduleHitsLegacyRoot(id, item));
    if (root !== undefined) hits.push(`${root} ${id}`);
  }
  for (const name of fileNames) {
    if (serviceWorkerFile(name)) hits.push(`service worker ${name}`);
  }
  return hits;
}

export function desktopBundleGuard(): Plugin {
  let outDir = '';
  return {
    name: 'desktop-bundle-guard',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_options, bundle) {
      const items = Object.values(bundle) as BundleItem[];
      const hits = desktopBundleViolations(
        items.flatMap((item) => Object.keys(item.modules ?? {})),
        items.map((item) => item.fileName),
        legacyZoneRoots(),
      );
      if (hits.length > 0) this.error(hits.join('\n'));
    },
    closeBundle() {
      let names: string[] = [];
      try {
        names = readdirSync(outDir);
      } catch {
        return;
      }
      const hits = names.filter(serviceWorkerFile).map((name) => `service worker ${name}`);
      if (hits.length > 0) this.error(hits.join('\n'));
    },
  };
}
