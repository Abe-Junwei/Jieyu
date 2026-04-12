import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');

const LEGACY_SYMBOL_REGEX = /\blegacy(?:ResolveAutoSegmentCandidates|CreateProject|ImportAudio|DeleteProject|DeleteAudio|DeleteSegments|SplitSegment|MergeAdjacentSegments|DeleteSegment)\b/g;

const allowedFiles = new Set([
  'src/app/transcriptionLegacyForwarding.ts',
  'src/pages/useTranscriptionProjectMediaController.ts',
  'src/pages/useTranscriptionSegmentMutationController.ts',
]);

const maxConsumerFiles = 2;

// M4 首批目标 + 一层相邻文件：禁止直连 services（必须经 app）
// M4 first-batch targets + one-layer adjacent files: forbid direct services imports (must go through app layer)
const m4ScopeFiles = [
  'src/pages/useTranscriptionProjectMediaController.ts',
  'src/pages/useTranscriptionSegmentMutationController.ts',
  'src/hooks/useMediaImport.ts',
  'src/pages/useTranscriptionSegmentBatchMerge.ts',
];

const DIRECT_SERVICES_IMPORT_REGEX = /from\s+['"][^'"]*\/services\/[^'"]+['"]/g;

function collectSourceFiles(dirPath) {
  const entries = readdirSync(dirPath);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = collectSourceFiles(SRC_DIR);
const matchedFiles = [];
for (const filePath of files) {
  const content = readFileSync(filePath, 'utf8');
  LEGACY_SYMBOL_REGEX.lastIndex = 0;
  if (!LEGACY_SYMBOL_REGEX.test(content)) continue;
  const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join('/');
  matchedFiles.push(relativePath);
}

const illegalFiles = matchedFiles.filter((file) => !allowedFiles.has(file));
const consumerFiles = matchedFiles.filter((file) => file !== 'src/app/transcriptionLegacyForwarding.ts');

if (illegalFiles.length > 0) {
  console.error('[check-transcription-legacy-forwarding-usage] Found illegal legacy forwarding usage:');
  for (const file of illegalFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (consumerFiles.length > maxConsumerFiles) {
  console.error(`[check-transcription-legacy-forwarding-usage] Legacy forwarding consumer files exceeded ceiling: ${consumerFiles.length}/${maxConsumerFiles}`);
  for (const file of consumerFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const serviceBypassFiles = [];
for (const file of m4ScopeFiles) {
  const fullPath = path.resolve(process.cwd(), file);
  const content = readFileSync(fullPath, 'utf8');
  DIRECT_SERVICES_IMPORT_REGEX.lastIndex = 0;
  if (DIRECT_SERVICES_IMPORT_REGEX.test(content)) {
    serviceBypassFiles.push(file);
  }
}

if (serviceBypassFiles.length > 0) {
  console.error('[check-transcription-legacy-forwarding-usage] Found direct services imports in M4 scope files:');
  for (const file of serviceBypassFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`[check-transcription-legacy-forwarding-usage] OK: ${consumerFiles.length} consumer file(s), ceiling ${maxConsumerFiles}.`);
if (consumerFiles.length > 0) {
  for (const file of consumerFiles) {
    console.log(`- ${file}`);
  }
}
