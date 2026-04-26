import { describe, expect, it } from 'vitest';
import { resolvePinnedMessageSessionMemory } from './useAiChat.messagePinning';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';

describe('useAiChat.messagePinning', () => {
  it('rolls back pinned-message directives on unpin', () => {
    const messages: UiChatMessage[] = [
      { id: 'usr-1', role: 'user', content: '请记住：所有回答用英文', status: 'done' },
    ];
    const pinned = resolvePinnedMessageSessionMemory({}, messages, 'usr-1');
    expect(pinned.responsePreferences?.language).toBe('en');
    expect(pinned.directiveLedger?.some((entry) => entry.source === 'pinned_message')).toBe(true);

    const unpinned = resolvePinnedMessageSessionMemory(pinned as AiSessionMemory, messages, 'usr-1');
    expect(unpinned.pinnedMessageIds).toBeUndefined();
    expect(unpinned.directiveLedger).toBeUndefined();
    expect(unpinned.responsePreferences?.language).not.toBe('en');
  });

  it('replays remaining pinned directives from digest content when messages are missing', () => {
    const messages: UiChatMessage[] = [
      { id: 'usr-older', role: 'user', content: '请记住：全部用中文回答', status: 'done' },
      { id: 'usr-newer', role: 'user', content: '请记住：全部用英文回答', status: 'done' },
    ];
    const pinnedOlder = resolvePinnedMessageSessionMemory({}, messages, 'usr-older');
    const pinnedBoth = resolvePinnedMessageSessionMemory(pinnedOlder, messages, 'usr-newer');
    expect(pinnedBoth.responsePreferences?.language).toBe('en');

    const messagesMissingOlder: UiChatMessage[] = [
      { id: 'usr-newer', role: 'user', content: '请记住：全部用英文回答', status: 'done' },
    ];
    const unpinnedNewer = resolvePinnedMessageSessionMemory(
      pinnedBoth as AiSessionMemory,
      messagesMissingOlder,
      'usr-newer',
    );
    expect(unpinnedNewer.pinnedMessageIds).toEqual(['usr-older']);
    expect(unpinnedNewer.responsePreferences?.language).toBe('zh-CN');
  });
});
