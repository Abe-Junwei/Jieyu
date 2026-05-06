#!/usr/bin/env node
/**
 * PR-2: Validate that EvidencePacketV0 retains all metric-dependent fields.
 * This prevents accidental renames/removals that would break P1+ quality gates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const EXPECTED_FIELDS = [
  'id',
  'sourceType',
  'sourceId',
  'quote',
  'confidence',
  'reasonCode',
  'timeRangeMs',
];

function fail(message) {
  process.stderr.write(`[check-evidence-packet-metric-fields] FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stdout.write(`[check-evidence-packet-metric-fields] OK: ${message}\n`);
}

function extractInterfaceFields(sourcePath, interfaceName) {
  const content = fs.readFileSync(sourcePath, 'utf8');
  // Naive regex to capture property names inside the interface block
  const regex = new RegExp(`export interface ${interfaceName}\\s*\\{([^}]+)\\}`, 's');
  const match = content.match(regex);
  if (!match) {
    fail(`could not find interface ${interfaceName} in ${sourcePath}`);
  }
  const body = match[1];
  const fields = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    const propMatch = trimmed.match(/^(\w+)\??\s*:/);
    if (propMatch) {
      fields.push(propMatch[1]);
    }
  }
  return fields;
}

function main() {
  const sourcePath = path.join(repoRoot, 'src/ai/vertical/evidencePacket.ts');
  const fields = extractInterfaceFields(sourcePath, 'EvidencePacketV0');

  const missing = EXPECTED_FIELDS.filter((f) => !fields.includes(f));
  if (missing.length > 0) {
    fail(`EvidencePacketV0 missing metric-dependent fields: ${missing.join(', ')}`);
  }

  // Schema version consistency check
  const versionConstMatch = fs.readFileSync(sourcePath, 'utf8').match(/EVIDENCE_PACKET_V0_SCHEMA_VERSION\s*=\s*(\d+)/);
  const interfaceVersionMatch = fs.readFileSync(sourcePath, 'utf8').match(/schemaVersion:\s*typeof\s+EVIDENCE_PACKET_V0_SCHEMA_VERSION/);
  if (!versionConstMatch) {
    fail('could not find EVIDENCE_PACKET_V0_SCHEMA_VERSION constant');
  }
  if (!interfaceVersionMatch) {
    fail('EvidencePacketV0 schemaVersion does not reference the constant');
  }

  ok(`EvidencePacketV0 retains all ${EXPECTED_FIELDS.length} metric-dependent fields and schema version is consistent`);
}

main();
