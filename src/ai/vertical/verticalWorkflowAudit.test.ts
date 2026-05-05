import { describe, expect, it } from 'vitest';
import {
  AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD,
  parseVerticalWorkflowAuditEntry,
  pickLatestVerticalWorkflowAuditEntry,
} from './verticalWorkflowAudit';

describe('verticalWorkflowAudit', () => {
  it('parses a valid vertical workflow audit row', () => {
    const row = {
      field: AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD,
      documentId: 'ast_1',
      requestId: 'ast_1_vertical_2026-01-01T00:00:00.000Z',
      timestamp: '2026-01-01T00:00:01.000Z',
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'stream_completion',
        completionPath: 'stream_done',
        completionStatus: 'done',
        workflowId: 'annotation_qa',
        writeMode: 'propose_only',
        outputKind: 'qa_findings',
        envelope: {
          schemaVersion: 0,
          generatedAt: '2026-01-01T00:00:00.000Z',
          evidencePacketCount: 0,
        },
        selection: {
          confidence: 0.84,
          source: 'rule_v0',
          reasonCode: 'keyword_match',
          matchedKeyword: 'qa',
        },
      }),
    };

    const parsed = parseVerticalWorkflowAuditEntry(row);
    expect(parsed).not.toBeNull();
    expect(parsed?.assistantMessageId).toBe('ast_1');
    expect(parsed?.metadata.workflowId).toBe('annotation_qa');
    expect(parsed?.metadata.completionStatus).toBe('done');
    expect(parsed?.metadata.envelope.evidencePacketCount).toBe(0);
  });

  it('returns null for non-vertical audit fields or malformed metadata', () => {
    const wrongFieldRow = {
      field: 'ai_tool_call_decision',
      documentId: 'ast_2',
      requestId: 'req_2',
      timestamp: '2026-01-01T00:00:02.000Z',
      metadataJson: JSON.stringify({ schemaVersion: 1 }),
    };
    expect(parseVerticalWorkflowAuditEntry(wrongFieldRow)).toBeNull();

    const badMetadataRow = {
      field: AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD,
      documentId: 'ast_3',
      requestId: 'req_3',
      timestamp: '2026-01-01T00:00:03.000Z',
      metadataJson: '{bad json',
    };
    expect(parseVerticalWorkflowAuditEntry(badMetadataRow)).toBeNull();
  });

  it('picks latest valid vertical workflow audit entry by timestamp', () => {
    const rows = [
      {
        field: AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD,
        documentId: 'ast_old',
        requestId: 'req_old',
        timestamp: '2026-01-01T00:00:01.000Z',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'stream_completion',
          completionPath: 'stream_done',
          completionStatus: 'done',
          workflowId: 'annotation_qa',
          writeMode: 'propose_only',
          outputKind: 'qa_findings',
          envelope: {
            schemaVersion: 0,
            generatedAt: '2026-01-01T00:00:00.000Z',
            evidencePacketCount: 1,
          },
          selection: null,
        }),
      },
      {
        field: AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD,
        documentId: 'ast_new',
        requestId: 'req_new',
        timestamp: '2026-01-01T00:00:02.000Z',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'stream_completion',
          completionPath: 'stream_fallback',
          completionStatus: 'done',
          workflowId: 'lexeme_candidates',
          writeMode: 'propose_only',
          outputKind: 'lexeme_candidates',
          envelope: {
            schemaVersion: 0,
            generatedAt: '2026-01-01T00:00:01.500Z',
            evidencePacketCount: 2,
          },
          selection: null,
        }),
      },
      {
        field: AI_VERTICAL_WORKFLOW_RESULT_AUDIT_FIELD,
        documentId: 'ast_bad',
        requestId: 'req_bad',
        timestamp: '2026-01-01T00:00:03.000Z',
        metadataJson: JSON.stringify({ schemaVersion: 0 }),
      },
    ];

    const latest = pickLatestVerticalWorkflowAuditEntry(rows);
    expect(latest).not.toBeNull();
    expect(latest?.assistantMessageId).toBe('ast_new');
    expect(latest?.metadata.workflowId).toBe('lexeme_candidates');
    expect(latest?.metadata.completionPath).toBe('stream_fallback');
  });
});
