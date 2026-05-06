#!/usr/bin/env node
/**
 * PR-9: Citation accuracy checker.
 * Validates EvidencePacket field integrity from agent-evals fixtures.
 * Computes citationMatchRate and quoteAccuracy heuristics.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesDir = join(__dirname, '../scripts/agent-evals/cases');

const REQUIRED_FIELDS = ['id', 'sourceType', 'sourceId', 'quote'];
const RECOMMENDED_FIELDS = ['confidence', 'reasonCode'];
const METRIC_DEPENDENT_FIELDS = ['id', 'sourceType', 'sourceId', 'quote', 'confidence', 'reasonCode', 'timeRangeMs'];

function fail(message) {
  process.stderr.write(`[citation-accuracy] FAIL: ${message}\n`);
  process.exit(1);
}

function ok(message) {
  process.stdout.write(`[citation-accuracy] OK: ${message}\n`);
}

function warn(message) {
  process.stdout.write(`[citation-accuracy] WARN: ${message}\n`);
}

function loadEvidenceCases() {
  const files = readdirSync(casesDir).filter((f) => f.endsWith('.json'));
  const cases = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(casesDir, f), 'utf8'));
    if (raw.category === 'evidence' || raw.category === 'rag' || raw.input?.evidencePacketInput || raw.input?.buildEnvelope?.evidencePackets) {
      cases.push(raw);
    }
  }
  return cases;
}

function checkFieldCompleteness(packet) {
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (packet[field] === undefined || packet[field] === null || packet[field] === '') {
      missing.push(field);
    }
  }
  return missing;
}

function main() {
  const cases = loadEvidenceCases();
  if (cases.length === 0) {
    fail('no evidence or RAG cases found');
  }

  const allPackets = [];

  for (const c of cases) {
    // Skip intentionally invalid fixtures (they test error paths, not accuracy)
    if (c.expected?.valid === false) {
      continue;
    }

    let packets = [];
    if (c.input?.evidencePacketInput) {
      packets.push(c.input.evidencePacketInput);
    }
    if (c.input?.buildEnvelope?.evidencePackets) {
      packets.push(...c.input.buildEnvelope.evidencePackets);
    }
    if (c.input?.citations && Array.isArray(c.input.citations)) {
      for (const cit of c.input.citations) {
        if (cit.refId && cit.type) {
          packets.push({
            id: `${cit.refId}_0`,
            sourceType: cit.type,
            sourceId: cit.refId,
            quote: cit.snippet ?? '',
            confidence: 0.8,
            reasonCode: 'rag_citation',
          });
        }
      }
    }

    for (const p of packets) {
      allPackets.push({ caseId: c.caseId, packet: p });
    }
  }

  if (allPackets.length === 0) {
    fail('no valid evidence packets found in fixtures');
  }

  let completePackets = 0;
  let packetsWithQuote = 0;
  let packetsWithConfidence = 0;
  let metricDependentComplete = 0;

  for (const { caseId, packet: p } of allPackets) {
    const missing = checkFieldCompleteness(p);
    if (missing.length === 0) {
      completePackets++;
    } else {
      warn(`case ${caseId}: packet missing fields [${missing.join(', ')}]`);
    }

    if (p.quote !== undefined && p.quote !== null && p.quote !== '') {
      packetsWithQuote++;
    }
    if (typeof p.confidence === 'number' && !Number.isNaN(p.confidence)) {
      packetsWithConfidence++;
    }

    const metricMissing = METRIC_DEPENDENT_FIELDS.filter((f) => {
      if (f === 'timeRangeMs') {
        if (p.timeRangeMs === undefined || p.timeRangeMs === null) return false;
        const tr = p.timeRangeMs;
        return typeof tr !== 'object' || typeof tr.startMs !== 'number' || typeof tr.endMs !== 'number';
      }
      if (f === 'confidence') {
        return typeof p.confidence !== 'number' || Number.isNaN(p.confidence);
      }
      if (f === 'reasonCode') {
        return p.reasonCode === undefined || p.reasonCode === null || String(p.reasonCode).trim() === '';
      }
      return p[f] === undefined || p[f] === null || p[f] === '';
    });
    if (metricMissing.length === 0) {
      metricDependentComplete++;
    }
  }

  const totalPackets = allPackets.length;
  const citationMatchRate = completePackets / totalPackets;
  const quoteAccuracy = packetsWithQuote / totalPackets;
  const confidenceCoverage = packetsWithConfidence / totalPackets;
  const metricFieldCoverage = metricDependentComplete / totalPackets;
  const recommendedCoverage = allPackets.filter(({ packet: p }) =>
    RECOMMENDED_FIELDS.every((f) => p[f] !== undefined && p[f] !== null && p[f] !== '')
  ).length / totalPackets;

  process.stdout.write(`\n[citation-accuracy] Summary:\n`);
  process.stdout.write(`  totalPackets:        ${totalPackets}\n`);
  process.stdout.write(`  citationMatchRate:   ${(citationMatchRate * 100).toFixed(1)}%\n`);
  process.stdout.write(`  quoteAccuracy:       ${(quoteAccuracy * 100).toFixed(1)}%\n`);
  process.stdout.write(`  confidenceCoverage:  ${(confidenceCoverage * 100).toFixed(1)}%\n`);
  process.stdout.write(`  metricFieldCoverage: ${(metricFieldCoverage * 100).toFixed(1)}%\n`);
  process.stdout.write(`  recommendedCoverage: ${(recommendedCoverage * 100).toFixed(1)}%\n`);

  // Thresholds from roadmap: citationMatchRate >= 80%, quoteAccuracy >= 70%
  if (citationMatchRate < 0.8) {
    fail(`citationMatchRate ${(citationMatchRate * 100).toFixed(1)}% < 80% threshold`);
  }
  if (quoteAccuracy < 0.7) {
    fail(`quoteAccuracy ${(quoteAccuracy * 100).toFixed(1)}% < 70% threshold`);
  }
  if (confidenceCoverage < 0.5) {
    warn(`confidenceCoverage ${(confidenceCoverage * 100).toFixed(1)}% < 50% recommended`);
  }

  ok(`citation accuracy thresholds met (citationMatchRate >= 80%, quoteAccuracy >= 70%)`);
}

main();
