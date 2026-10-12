import { describe, expect, it } from 'vitest';
import { routeIntent } from './IntentRouter';

describe('IntentRouter fuzzy guard (P0-1)', () => {
  it.each([
    '帮我看看这句话里的动词怎么标注',
    '不要删除',
    '取消删除',
    '解释一下下一步的计划',
    '这个词切分对吗',
  ])('"%s" stays chat', (text) => {
    expect(routeIntent(text, 'command', { detectedLang: 'zh' }).type).toBe('chat');
  });

  it('does not match English keywords inside other words or negated', () => {
    expect(routeIntent('nextdoor', 'command').type).toBe('chat');
    expect(routeIntent("don't split it", 'command').type).toBe('chat');
  });

  it.each([
    ['播一下', 'playPause'],
    ['删掉', 'deleteSegment'],
    ['下一个', 'navNext'],
    ['撤一下', 'undo'],
    ['算了', 'cancel'],
  ])('short command "%s" still routes to %s', (text, actionId) => {
    const intent = routeIntent(text, 'command', { detectedLang: 'zh' });
    expect(intent).toMatchObject({ type: 'action', actionId });
  });
});
