import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'src/extensions/extensionRuntime.ts',
  'src/extensions/extensionRuntime.test.ts',
  'scripts/report-m7-extension-control-gate.mjs',
  'docs/execution/plans/M7-执行记录-2026-04-12.md',
  'docs/execution/release-gates/M7-扩展可控化门禁清单-2026-04-12.md',
];

const requiredSnippets = [
  'validateExtensionManifest',
  'negotiateManifestCompatibility',
  'createExtensionHost',
  'ExtensionCapabilityDeniedError',
];

const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.resolve(root, relativePath)));
if (missingFiles.length > 0) {
  console.error('[check-m7-extension-foundation] Missing required files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const runtimeSource = readFileSync(path.resolve(root, 'src/extensions/extensionRuntime.ts'), 'utf8');
const missingSnippets = requiredSnippets.filter((snippet) => !runtimeSource.includes(snippet));
if (missingSnippets.length > 0) {
  console.error('[check-m7-extension-foundation] Missing required runtime snippets:');
  for (const snippet of missingSnippets) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log(
  `[check-m7-extension-foundation] OK: ${requiredFiles.length} required files and ${requiredSnippets.length} runtime contracts.`,
);
