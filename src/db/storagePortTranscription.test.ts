import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import {
  deleteTranscriptionAnchor,
  putTranscriptionAnchor,
} from './storagePortTranscriptionAnchors';
import {
  deleteTranscriptionLayerLink,
  insertTranscriptionLayerLink,
  updateTranscriptionLayerLink,
} from './storagePortTranscriptionLayers';
import {
  deleteTranscriptionMediaItem,
  insertTranscriptionMediaItem,
  putTranscriptionLayerUnitContent,
} from './storagePortTranscriptionVoice';
import type {
  AnchorDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  MediaItemDocType,
} from './types';

const NOW = '2026-10-18T00:00:00.000Z';

describe('storage port transcription writes', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.anchors.clear(),
      db.layer_links.clear(),
      db.layer_unit_contents.clear(),
      db.media_items.clear(),
    ]);
  });

  it('writes an anchor and reads the same id back', async () => {
    const anchor: AnchorDocType = {
      id: 'anc-1',
      mediaId: 'media-1',
      time: 1.25,
      createdAt: NOW,
    };
    await expect(putTranscriptionAnchor(anchor)).resolves.toMatchObject({
      id: 'anc-1',
      time: 1.25,
    });
    await expect(db.anchors.get('anc-1')).resolves.toMatchObject({ id: 'anc-1', time: 1.25 });
    await deleteTranscriptionAnchor('anc-1');
    await expect(db.anchors.get('anc-1')).resolves.toBeUndefined();
  });

  it('writes a layer link and updates its preferred flag', async () => {
    const link: LayerLinkDocType = {
      id: 'link-1',
      transcriptionLayerKey: 'trc',
      hostTranscriptionLayerId: 'layer-trc',
      layerId: 'layer-trl',
      linkType: 'free',
      isPreferred: false,
      createdAt: NOW,
    };
    await insertTranscriptionLayerLink(link);
    await updateTranscriptionLayerLink('link-1', { isPreferred: true });
    await expect(db.layer_links.get('link-1')).resolves.toMatchObject({
      id: 'link-1',
      isPreferred: true,
    });
    await deleteTranscriptionLayerLink('link-1');
    await expect(db.layer_links.get('link-1')).resolves.toBeUndefined();
  });

  it('writes a voice media row and a segment content row with the same ids', async () => {
    const media: MediaItemDocType = {
      id: 'media-voice',
      textId: 'text-1',
      filename: 'voice.webm',
      isOfflineCached: true,
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
      createdAt: NOW,
    };
    const content: LayerUnitContentDocType = {
      id: 'content-voice',
      textId: 'text-1',
      unitId: 'unit-1',
      layerId: 'layer-1',
      modality: 'audio',
      sourceType: 'human',
      translationAudioMediaId: 'media-voice',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await insertTranscriptionMediaItem(media);
    await putTranscriptionLayerUnitContent(content);
    await expect(db.media_items.get('media-voice')).resolves.toMatchObject({
      id: 'media-voice',
      textId: 'text-1',
    });
    await expect(db.layer_unit_contents.get('content-voice')).resolves.toMatchObject({
      id: 'content-voice',
      unitId: 'unit-1',
    });
    await deleteTranscriptionMediaItem('media-voice');
    await expect(db.media_items.get('media-voice')).resolves.toBeUndefined();
  });
});
