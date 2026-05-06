import { describe, expect, it } from 'vitest';
import { resolveUserDirectivePolicyDecision } from '../../../src/ai/policy/resolveExecutionPolicy';
import { buildEvidencePacketV0 } from '../../../src/ai/vertical/evidencePacket';
import {
  buildVerticalWorkflowOutputEnvelopeV0,
  selectVerticalWorkflowV0,
} from '../../../src/ai/vertical/verticalWorkflowSelection';
import {
  resolveCorpusSourceSet,
  ragCitationsToEvidencePackets,
} from '../../../src/ai/vertical/sourceResolver';
import type { AiMessageCitation } from '../../../src/db';
import type { AiPromptContext, AiSessionMemory } from '../../../src/ai/chat/chatDomain.types';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CASES_DIR = __dirname;

interface SemanticCase {
  caseId: string;
  category: string;
  capability: string;
  tier: 'blocking' | 'quality';
  outcome: string;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

function loadCases(): SemanticCase[] {
  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), 'utf8')));
}

const allCases = loadCases();
const blockingCases = allCases.filter((c) => c.tier === 'blocking');
const qualityCases = allCases.filter((c) => c.tier === 'quality');

function runCase(c: SemanticCase) {
  // ── safety / policy / adversarial ──
  if (c.category === 'safety' || c.category === 'policy' || c.category === 'adversarial') {
    const toolCall = c.input.toolCall as { name: string; arguments: Record<string, unknown> };
    const sessionMemory = c.input.sessionMemory as AiSessionMemory;
    const decision = resolveUserDirectivePolicyDecision(toolCall, sessionMemory);

    expect(decision.action).toBe(c.expected.decision);
    if (c.expected.reason && (decision.action === 'block' || decision.action === 'confirm')) {
      expect(decision.reason).toBe(c.expected.reason);
    }
  }

  // ── evidence ──
  if (c.category === 'evidence') {
    const input = c.input.evidencePacketInput as Parameters<typeof buildEvidencePacketV0>[0];
    if (c.expected.valid === false) {
      expect(() => buildEvidencePacketV0(input)).toThrow();
    } else {
      const packet = buildEvidencePacketV0(input);
      expect(packet.sourceId).toBe(input.sourceId);
      if (c.expected.confidence !== undefined) {
        expect(packet.confidence).toBe(c.expected.confidence);
      }
      if (c.expected.timeRangeMs !== undefined) {
        expect(packet.timeRangeMs).toEqual(c.expected.timeRangeMs);
      }
    }
  }

  // ── workflow ──
  if (c.category === 'workflow') {
    if (c.input.selectWorkflowQuery) {
      const selection = selectVerticalWorkflowV0(c.input.selectWorkflowQuery as string);
      if (c.expected.workflowId) {
        expect(selection?.workflowId).toBe(c.expected.workflowId);
      }
      if (c.expected.noMatch === true) {
        expect(selection).toBeNull();
      }
    }
    if (c.input.buildEnvelope) {
      const { selection, evidencePackets } = c.input.buildEnvelope as {
        selection: Parameters<typeof buildVerticalWorkflowOutputEnvelopeV0>[0];
        evidencePackets: Parameters<typeof buildVerticalWorkflowOutputEnvelopeV0>[1];
      };
      const envelope = buildVerticalWorkflowOutputEnvelopeV0(selection, evidencePackets);
      if (c.expected.status) {
        expect(envelope.status).toBe(c.expected.status);
      }
      if (c.expected.evidencePacketCount !== undefined) {
        expect(envelope.evidencePackets.length).toBe(c.expected.evidencePacketCount);
      }
    }
  }

  // ── rag ──
  if (c.category === 'rag') {
    const citations = c.input.citations as AiMessageCitation[];
    const aiContext = c.input.aiContext as AiPromptContext | null;
    const sourceSet = resolveCorpusSourceSet(aiContext);
    const packets = ragCitationsToEvidencePackets(citations, sourceSet);

    if (c.expected.packetCount !== undefined) {
      expect(packets.length).toBe(c.expected.packetCount);
    }
    if (c.expected.firstPacketSourceType) {
      expect(packets[0]?.sourceType).toBe(c.expected.firstPacketSourceType);
    }
    if (c.expected.firstPacketMediaId) {
      expect(packets[0]?.mediaId).toBe(c.expected.firstPacketMediaId);
    }
    if (c.expected.empty === true) {
      expect(packets).toEqual([]);
    }
  }

  // ── i18n ──
  if (c.category === 'i18n') {
    if (c.input.selectWorkflowQuery) {
      const selection = selectVerticalWorkflowV0(c.input.selectWorkflowQuery as string);
      if (c.expected.workflowId) {
        expect(selection?.workflowId).toBe(c.expected.workflowId);
      }
      if (c.expected.noMatch === true) {
        expect(selection).toBeNull();
      }
    }
    if (c.input.toolCall) {
      const toolCall = c.input.toolCall as { name: string; arguments: Record<string, unknown> };
      const sessionMemory = c.input.sessionMemory as AiSessionMemory;
      const decision = resolveUserDirectivePolicyDecision(toolCall, sessionMemory);
      expect(decision.action).toBe(c.expected.decision);
      if (c.expected.reason && (decision.action === 'block' || decision.action === 'confirm')) {
        expect(decision.reason).toBe(c.expected.reason);
      }
    }
  }
}

describe('agent-evals semantic cases', () => {
  for (const c of allCases) {
    it(`${c.caseId} [${c.tier}]: ${c.description}`, () => {
      runCase(c);
    });
  }
});

describe('agent-evals tier summary', () => {
  it(`blocking cases: ${blockingCases.length}/${blockingCases.length} must pass (100%)`, () => {
    const results = blockingCases.map((c) => {
      try {
        runCase(c);
        return true;
      } catch {
        return false;
      }
    });
    const passRate = results.filter(Boolean).length / results.length;
    expect(passRate).toBe(1);
  });

  it(`quality cases: ${qualityCases.length}/${qualityCases.length} should pass (>=90%)`, () => {
    if (qualityCases.length === 0) {
      return; // skip when no quality cases yet
    }
    const results = qualityCases.map((c) => {
      try {
        runCase(c);
        return true;
      } catch {
        return false;
      }
    });
    const passRate = results.filter(Boolean).length / results.length;
    expect(passRate).toBeGreaterThanOrEqual(0.9);
  });
});
