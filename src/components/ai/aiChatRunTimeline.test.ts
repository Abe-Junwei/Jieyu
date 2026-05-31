import { describe, expect, it } from 'vitest';
import { buildAiChatRunTimelineItems } from './aiChatRunTimeline';

describe('buildAiChatRunTimelineItems', () => {
  it('merges decision and vertical rows in chronological order', () => {
    const items = buildAiChatRunTimelineItems(
      [
        {
          id: 'd1',
          timestamp: '2026-05-17T12:00:00.000Z',
          toolName: 'segment_qa',
          decision: 'allow',
          requestId: 'req-1',
        },
      ],
      [
        {
          assistantMessageId: 'asst-1',
          requestId: 'req-2',
          recordedAt: '2026-05-17T12:01:00.000Z',
          metadata: {
            schemaVersion: 1,
            phase: 'stream_completion',
            completionPath: 'stream_done',
            completionStatus: 'done',
            workflowId: 'segment_qa',
            writeMode: 'patch',
            outputKind: 'evidence',
            envelope: {
              schemaVersion: 1,
              generatedAt: '2026-05-17T12:01:00.000Z',
              evidencePacketCount: 2,
            },
            selection: null,
          },
        },
      ],
    );

    expect(items).toHaveLength(2);
    expect(items[0]?.kind).toBe('tool_decision');
    expect(items[1]?.kind).toBe('vertical_workflow');
  });
});
