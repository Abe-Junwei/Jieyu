import { describe, expect, it } from 'vitest';
import {
  resolveCorpusSourceSet,
  ragCitationsToEvidencePackets,
  type CorpusSourceSet,
} from './sourceResolver';
import type { AiPromptContext } from '../chat/chatDomain.types';
import type { AiMessageCitation } from '../../db';

describe('resolveCorpusSourceSet', () => {
  it('returns current_segment when activeSegmentUnitId is present', () => {
    const ctx: AiPromptContext = {
      shortTerm: {
        activeSegmentUnitId: 'seg-1',
        currentMediaId: 'media-1',
        selectedLayerId: 'layer-1',
      },
    };
    const result = resolveCorpusSourceSet(ctx);
    expect(result).toEqual({
      scope: 'current_segment',
      sourceIds: ['seg-1'],
      mediaId: 'media-1',
      layerId: 'layer-1',
    });
  });

  it('returns selection when selectedUnitIds is present', () => {
    const ctx: AiPromptContext = {
      shortTerm: {
        selectedUnitIds: ['unit-1', 'unit-2'],
        currentMediaId: 'media-1',
      },
    };
    const result = resolveCorpusSourceSet(ctx);
    expect(result).toEqual({
      scope: 'selection',
      sourceIds: ['unit-1', 'unit-2'],
      mediaId: 'media-1',
    });
  });

  it('returns current_media when currentMediaId is present without selection', () => {
    const ctx: AiPromptContext = {
      shortTerm: {
        currentMediaId: 'media-1',
      },
    };
    const result = resolveCorpusSourceSet(ctx);
    expect(result).toEqual({
      scope: 'current_media',
      sourceIds: [],
      mediaId: 'media-1',
    });
  });

  it('returns project scope when no media or selection info', () => {
    const ctx: AiPromptContext = { shortTerm: {} };
    const result = resolveCorpusSourceSet(ctx);
    expect(result).toEqual({
      scope: 'project',
      sourceIds: [],
    });
  });

  it('returns null when aiContext is null', () => {
    expect(resolveCorpusSourceSet(null)).toBeNull();
  });
});

describe('ragCitationsToEvidencePackets', () => {
  it('maps unit citations to segment evidence packets', () => {
    const citations: AiMessageCitation[] = [
      { type: 'unit', refId: 'unit-1', snippet: 'hello world' },
    ];
    const packets = ragCitationsToEvidencePackets(citations, null);
    expect(packets).toHaveLength(1);
    expect(packets[0]!.sourceType).toBe('segment');
    expect(packets[0]!.sourceId).toBe('unit-1');
    expect(packets[0]!.quote).toBe('hello world');
    expect(packets[0]!.confidence).toBe(0.8);
    expect(packets[0]!.reasonCode).toBe('rag_citation');
  });

  it('maps note citations to note evidence packets', () => {
    const citations: AiMessageCitation[] = [
      { type: 'note', refId: 'note-1', snippet: 'a note' },
    ];
    const packets = ragCitationsToEvidencePackets(citations, null);
    expect(packets[0]!.sourceType).toBe('note');
  });

  it('maps pdf citations to document evidence packets', () => {
    const citations: AiMessageCitation[] = [
      { type: 'pdf', refId: 'pdf-1', snippet: 'a pdf' },
    ];
    const packets = ragCitationsToEvidencePackets(citations, null);
    expect(packets[0]!.sourceType).toBe('document');
  });

  it('maps schema citations to layer_text evidence packets', () => {
    const citations: AiMessageCitation[] = [
      { type: 'schema', refId: 'schema-1', snippet: 'a schema' },
    ];
    const packets = ragCitationsToEvidencePackets(citations, null);
    expect(packets[0]!.sourceType).toBe('layer_text');
  });

  it('attaches sourceSet mediaId and layerId when present', () => {
    const citations: AiMessageCitation[] = [
      { type: 'unit', refId: 'unit-1', snippet: 'hello' },
    ];
    const sourceSet: CorpusSourceSet = {
      scope: 'current_segment',
      sourceIds: ['unit-1'],
      mediaId: 'media-1',
      layerId: 'layer-1',
    };
    const packets = ragCitationsToEvidencePackets(citations, sourceSet);
    expect(packets[0]!.mediaId).toBe('media-1');
    expect(packets[0]!.layerId).toBe('layer-1');
  });

  it('uses empty string when snippet is undefined', () => {
    const citations: AiMessageCitation[] = [
      { type: 'unit', refId: 'unit-1' },
    ];
    const packets = ragCitationsToEvidencePackets(citations, null);
    expect(packets[0]!.quote).toBe('');
  });

  it('returns empty array for empty citations', () => {
    expect(ragCitationsToEvidencePackets([], null)).toEqual([]);
  });

  it('assigns unique ids with index suffix', () => {
    const citations: AiMessageCitation[] = [
      { type: 'unit', refId: 'unit-1', snippet: 'a' },
      { type: 'unit', refId: 'unit-1', snippet: 'b' },
    ];
    const packets = ragCitationsToEvidencePackets(citations, null);
    expect(packets[0]!.id).toBe('unit-1_0');
    expect(packets[1]!.id).toBe('unit-1_1');
  });
});
