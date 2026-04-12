import { describe, expect, it } from 'vitest';
import { parseLocalContextToolCallFromText, parseLocalContextToolCallsFromText } from './localContextTools';

describe('localContextTools parseLocalContextToolCallFromText', () => {
  it('parses fenced json tool call payload', () => {
    const raw = [
      '这里是工具调用结果',
      '```json',
      '{"tool_call":{"name":"get_project_stats","arguments":{}}}',
      '```',
    ].join('\n');

    const parsed = parseLocalContextToolCallFromText(raw);

    expect(parsed).toEqual({
      name: 'get_project_stats',
      arguments: {},
    });
  });

  it('parses inline json with normalized tool name and arguments', () => {
    const raw = '{"tool_call":{"name":"GET_UTTERANCE_DETAIL","arguments":{"utteranceId":"utt-1"}}}';
    const parsed = parseLocalContextToolCallFromText(raw);

    expect(parsed).toEqual({
      name: 'get_utterance_detail',
      arguments: {
        utteranceId: 'utt-1',
      },
    });
  });

  it('parses tool_calls batch payload', () => {
    const raw = JSON.stringify({
      tool_calls: [
        { name: 'get_project_stats', arguments: {} },
        { name: 'get_current_selection', arguments: {} },
      ],
    });

    const parsed = parseLocalContextToolCallsFromText(raw);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ name: 'get_project_stats', arguments: {} });
    expect(parsed[1]).toEqual({ name: 'get_current_selection', arguments: {} });
  });

  it('parses single-item tool_calls payload', () => {
    const raw = JSON.stringify({
      tool_calls: [
        { name: 'get_current_selection', arguments: {} },
      ],
    });

    const parsed = parseLocalContextToolCallsFromText(raw);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ name: 'get_current_selection', arguments: {} });
  });
});
