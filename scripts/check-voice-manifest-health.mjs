#!/usr/bin/env node
/**
 * PR-10: Voice manifest health check.
 * Validates PWA manifest structure required for voice runtime stability.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, '../dist/manifest.webmanifest');

function fail(message) {
  process.stderr.write(`[voice-manifest-health] FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stdout.write(`[voice-manifest-health] OK: ${message}\n`);
}

function warn(message) {
  process.stdout.write(`[voice-manifest-health] WARN: ${message}\n`);
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`cannot read or parse manifest: ${err.message}`);
  }

  const requiredFields = ['name', 'short_name', 'start_url', 'display', 'icons'];
  const missing = requiredFields.filter((f) => manifest[f] === undefined);
  if (missing.length > 0) {
    fail(`manifest missing required fields: ${missing.join(', ')}`);
  }

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    fail('manifest icons array is empty');
  }

  if (manifest.display !== 'standalone' && manifest.display !== 'fullscreen') {
    warn(`display is "${manifest.display}", recommended: standalone or fullscreen for voice`);
  }

  ok('voice manifest structure is healthy');
}

main();
