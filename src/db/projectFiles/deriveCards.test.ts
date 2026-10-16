import { describe, expect, it } from 'vitest';
import { deriveCards } from './deriveCards';

const audio = { id: 'audio-1', relPath: '录音01.wav', sha256: 'abc' };

describe('deriveCards', () => {
  it('keeps the manuscript id and its audio after the list is dropped', () => {
    const manuscripts = [{ id: 'doc-1', relPath: '录音01.jyd', audioId: 'audio-1' }];
    const first = deriveCards(manuscripts, [audio]);
    const rebuilt = deriveCards(manuscripts, [audio]);
    expect(rebuilt).toEqual(first);
    expect(rebuilt.cards).toEqual([{ manuscriptId: 'doc-1', audioId: 'audio-1', hidden: false }]);
  });

  it('keeps a hidden manuscript paired to the same audio', () => {
    const result = deriveCards(
      [{ id: 'doc-1', relPath: '已隐藏/录音01.jyd', audioId: 'audio-1' }],
      [audio],
    );
    expect(result.issues).toEqual([]);
    expect(result.cards).toEqual([{ manuscriptId: 'doc-1', audioId: 'audio-1', hidden: true }]);
  });

  it('lists a manuscript and a recording separately when they are not linked', () => {
    const result = deriveCards([{ id: 'doc-1', relPath: '笔记.jyd', audioId: null }], [audio]);
    expect(result.cards).toEqual([
      { manuscriptId: 'doc-1', audioId: null, hidden: false },
      { manuscriptId: null, audioId: 'audio-1', hidden: false },
    ]);
  });

  it('stops when two files carry the same manuscript id', () => {
    const result = deriveCards(
      [
        { id: 'doc-1', relPath: '录音01.jyd', audioId: 'audio-1' },
        { id: 'doc-1', relPath: '录音01 (2).jyd', audioId: 'audio-1' },
      ],
      [audio],
    );
    expect(result.cards).toEqual([{ manuscriptId: null, audioId: 'audio-1', hidden: false }]);
    expect(result.issues).toEqual([{ kind: 'duplicate-manuscript', id: 'doc-1' }]);
  });
});
