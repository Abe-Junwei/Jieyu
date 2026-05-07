import type { EvidencePacketV0 } from './evidencePacket';
import { getVerticalWorkflowV0, type VerticalWorkflowId, type VerticalWorkflowV0 } from './verticalWorkflowRegistry';

export interface VerticalWorkflowSelectionV0 {
  workflowId: VerticalWorkflowId;
  workflow: VerticalWorkflowV0;
  confidence: number;
  source: 'rule_v0' | 'composed_v0';
  reasonCode: 'keyword_match' | 'composed_step1' | 'composed_step2';
  matchedKeyword: string;
}

export interface VerticalWorkflowOutputEnvelopeV0 {
  schemaVersion: 0;
  workflowId: VerticalWorkflowId;
  writeMode: VerticalWorkflowV0['writeMode'];
  outputKind: VerticalWorkflowV0['outputKind'];
  evidencePackets: ReadonlyArray<EvidencePacketV0>;
  generatedAt: string;
  status: 'ready' | 'degraded';
}

type VerticalWorkflowKeywordRule = {
  workflowId: VerticalWorkflowId;
  confidence: number;
  keywords: ReadonlyArray<string>;
};

const VERTICAL_WORKFLOW_KEYWORD_RULES: ReadonlyArray<VerticalWorkflowKeywordRule> = [
  {
    workflowId: 'annotation_qa',
    confidence: 0.84,
    keywords: ['标注', '审校', '校对', '一致性', '缺失', 'qa', 'quality', 'check'],
  },
  {
    workflowId: 'lexeme_candidates',
    confidence: 0.86,
    keywords: ['词典', '词条', '词素', '义项', '候选词', 'lexeme', 'gloss'],
  },
  {
    workflowId: 'segment_qa',
    confidence: 0.78,
    keywords: ['语段', '这句', '这段', '解释', '含义', '问答', 'segment', 'question'],
  },
  {
    workflowId: 'elan_flex_compatibility',
    confidence: 0.82,
    keywords: ['elan', 'flex', '互通', '兼容', 'compatibility', 'export', 'eaf', 'flextext', 'tier', '往返'],
  },
];

export function selectVerticalWorkflowV0(userText: string): VerticalWorkflowSelectionV0 | null {
  const normalized = userText.trim().toLowerCase();
  if (normalized.length === 0) return null;

  for (const rule of VERTICAL_WORKFLOW_KEYWORD_RULES) {
    const matchedKeyword = rule.keywords.find((keyword) => normalized.includes(keyword.toLowerCase()));
    if (!matchedKeyword) continue;
    return {
      workflowId: rule.workflowId,
      workflow: getVerticalWorkflowV0(rule.workflowId),
      confidence: rule.confidence,
      source: 'rule_v0',
      reasonCode: 'keyword_match',
      matchedKeyword,
    };
  }

  return null;
}

export function buildVerticalWorkflowOutputEnvelopeV0(
  selection: VerticalWorkflowSelectionV0,
  evidencePackets: ReadonlyArray<EvidencePacketV0> = [],
): VerticalWorkflowOutputEnvelopeV0 {
  const status = evidencePackets.length === 0 ? 'degraded' : 'ready';
  return {
    schemaVersion: 0,
    workflowId: selection.workflowId,
    writeMode: selection.workflow.writeMode,
    outputKind: selection.workflow.outputKind,
    evidencePackets,
    generatedAt: new Date().toISOString(),
    status,
  };
}
