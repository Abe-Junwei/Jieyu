import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// 允许 tierId 出现的边界文件/目录（互操作、桥接、数据定义、测试）
const ALLOWED_FILE_PATHS = new Set([
  'src/services/TierBridgeService.ts',
  'src/services/LinguisticService.cleanup.ts',
  'src/services/LinguisticService.constraints.ts',
  'src/services/LinguisticService.tiers.ts',
  'src/services/LinguisticService.ts',
  'src/db/index.ts',
]);

const ALLOWED_PATH_SEGMENTS = [
  // 测试文件统一放行 | All test files allowed
  '.test.ts',
  '.test.tsx',
  // db 模块拆分后，tierId 迁移/兼容字段仍在数据库边界内允许出现 | After db module split, tierId migration/compat fields are allowed within db boundary
  '/src/db/',
  // 互操作服务 | Interop services (EAF)
  '/src/services/EafService.ts',
  // 互操作 hooks | Interop hooks (import/export)
  '/src/hooks/useImportExport.ts',
];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    const dot = entry.lastIndexOf('.');
    const ext = dot >= 0 ? entry.slice(dot) : '';
    if (SOURCE_EXTENSIONS.has(ext)) files.push(fullPath);
  }
  return files;
}

function isAllowedPath(relPath) {
  if (ALLOWED_FILE_PATHS.has(relPath)) return true;
  const normalized = `/${relPath.replaceAll('\\\\', '/')}`;
  return ALLOWED_PATH_SEGMENTS.some((seg) => normalized.includes(seg));
}

function classifyOffBoundary(relPath) {
  if (relPath.startsWith('src/utils/')) {
    return 'quick-fix-candidate';
  }

  return 'other-off-boundary';
}

function main() {
  const strict = process.argv.includes('--strict');
  const maxOffBoundary = (() => {
    const arg = process.argv.find((item) => item.startsWith('--max-off-boundary='));
    if (!arg) return 2;
    const value = Number(arg.split('=')[1]);
    return Number.isFinite(value) ? value : 2;
  })();

  const files = walk(SRC_DIR);
  const occurrencesByFile = new Map();
  const offBoundary = [];

  for (const file of files) {
    const rel = relative(ROOT, file).replaceAll('\\\\', '/');
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    let countInFile = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (!line.includes('tierId')) continue;
      countInFile += 1;
      if (!isAllowedPath(rel)) {
        offBoundary.push({
          file: rel,
          line: index + 1,
          text: line.trim(),
        });
      }
    }

    if (countInFile > 0) {
      occurrencesByFile.set(rel, countInFile);
    }
  }

  const sorted = Array.from(occurrencesByFile.entries()).sort((a, b) => b[1] - a[1]);
  const categorized = new Map();
  for (const item of offBoundary) {
    const category = classifyOffBoundary(item.file);
    const list = categorized.get(category) ?? [];
    list.push(item);
    categorized.set(category, list);
  }

  console.log('[report-tierid-diffusion] tierId usage report');
  console.log(`- filesWithTierId: ${sorted.length}`);
  console.log(`- totalTierIdMentions: ${sorted.reduce((sum, [, n]) => sum + n, 0)}`);
  console.log(`- offBoundaryMentions: ${offBoundary.length}`);

  if (categorized.size > 0) {
    console.log('\nOff-boundary by category:');
    const ordered = Array.from(categorized.entries()).sort((a, b) => b[1].length - a[1].length);
    for (const [category, list] of ordered) {
      console.log(`- ${category}: ${list.length}`);
    }
  }

  if (sorted.length > 0) {
    console.log('\nTop files by mentions:');
    for (const [file, count] of sorted.slice(0, 20)) {
      console.log(`- ${file}: ${count}`);
    }
  }

  if (offBoundary.length > 0) {
    console.log('\nOff-boundary occurrences:');
    for (const item of offBoundary.slice(0, 50)) {
      console.log(`- ${item.file}:${item.line} -> ${item.text}`);
    }
    if (offBoundary.length > 50) {
      console.log(`- ... (${offBoundary.length - 50} more)`);
    }
  }

  if (strict && offBoundary.length > maxOffBoundary) {
    console.error(`\n[report-tierid-diffusion] strict mode failed: offBoundaryMentions=${offBoundary.length} > max=${maxOffBoundary}`);
    process.exit(1);
  }
}

main();
