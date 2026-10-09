import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';

import { buildMinimalWavBytes } from './minimalWav';

const NOW = '2099-01-01T00:00:00.000Z';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * 最小 JYM 项目包（rev5 第 3 批新格式）：1 个项目 + 3 个语段 + 一段真实 WAV 字节。
 * Minimal JYM project package (rev5 batch 3 format): one project, three segments, real WAV bytes.
 */
export function buildMinimalJymArchiveBytes(): Uint8Array {
  const wav = buildMinimalWavBytes();
  const wavSha = sha256(wav);
  const snapshot = {
    schemaVersion: 5,
    exportedAt: NOW,
    dbName: 'jieyu',
    collections: {
      texts: [
        {
          id: 'text_r4_s1',
          title: { default: 'R4 S1 Field Sample' },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      media_items: [
        {
          id: 'media_r4_s1',
          textId: 'text_r4_s1',
          filename: 'field-sample.wav',
          isOfflineCached: true,
          // 字节在 media/ 下，导入时核对 sha256 后挂回 | Bytes live under media/, verified on import
          timelineKind: 'acoustic',
          byteLocation: 'managed',
          availability: 'available',
          contentSha256: wavSha,
          contentSize: wav.byteLength,
          details: {},
          createdAt: NOW,
        },
      ],
      layers: [
        {
          id: 'trc_r4_s1',
          textId: 'text_r4_s1',
          key: 'trc_r4_s1',
          name: { default: 'Field transcription' },
          layerType: 'transcription',
          languageId: 'zho',
          modality: 'text',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      tier_definitions: [
        {
          id: 'trc_r4_s1',
          textId: 'text_r4_s1',
          key: 'trc_r4_s1',
          name: { default: 'Field transcription' },
          tierType: 'time-aligned',
          contentType: 'transcription',
          languageId: 'zho',
          modality: 'text',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      layer_units: [
        {
          id: 'utt_r4_s1',
          textId: 'text_r4_s1',
          mediaId: 'media_r4_s1',
          startTime: 0,
          endTime: 3,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 'seg_r4_s1_a',
          textId: 'text_r4_s1',
          mediaId: 'media_r4_s1',
          layerId: 'trc_r4_s1',
          unitType: 'segment',
          parentUnitId: 'utt_r4_s1',
          rootUnitId: 'utt_r4_s1',
          startTime: 0,
          endTime: 1,
          createdAt: NOW,
          updatedAt: NOW,
          provenance: { actorType: 'human', method: 'manual', createdAt: NOW },
        },
        {
          id: 'seg_r4_s1_b',
          textId: 'text_r4_s1',
          mediaId: 'media_r4_s1',
          layerId: 'trc_r4_s1',
          unitType: 'segment',
          parentUnitId: 'utt_r4_s1',
          rootUnitId: 'utt_r4_s1',
          startTime: 1,
          endTime: 2,
          createdAt: NOW,
          updatedAt: NOW,
          provenance: { actorType: 'human', method: 'manual', createdAt: NOW },
        },
        {
          id: 'seg_r4_s1_c',
          textId: 'text_r4_s1',
          mediaId: 'media_r4_s1',
          layerId: 'trc_r4_s1',
          unitType: 'segment',
          parentUnitId: 'utt_r4_s1',
          rootUnitId: 'utt_r4_s1',
          startTime: 2,
          endTime: 3,
          createdAt: NOW,
          updatedAt: NOW,
          provenance: { actorType: 'human', method: 'manual', createdAt: NOW },
        },
      ],
      layer_unit_contents: [
        {
          id: 'cnt_r4_s1_a',
          textId: 'text_r4_s1',
          unitId: 'seg_r4_s1_a',
          layerId: 'trc_r4_s1',
          contentRole: 'primary_text',
          modality: 'text',
          text: 'alpha',
          sourceType: 'human',
          createdAt: NOW,
          updatedAt: NOW,
          provenance: { actorType: 'human', method: 'manual', createdAt: NOW },
        },
        {
          id: 'cnt_r4_s1_b',
          textId: 'text_r4_s1',
          unitId: 'seg_r4_s1_b',
          layerId: 'trc_r4_s1',
          contentRole: 'primary_text',
          modality: 'text',
          text: 'beta',
          sourceType: 'human',
          createdAt: NOW,
          updatedAt: NOW,
          provenance: { actorType: 'human', method: 'manual', createdAt: NOW },
        },
        {
          id: 'cnt_r4_s1_c',
          textId: 'text_r4_s1',
          unitId: 'seg_r4_s1_c',
          layerId: 'trc_r4_s1',
          contentRole: 'primary_text',
          modality: 'text',
          text: 'gamma',
          sourceType: 'human',
          createdAt: NOW,
          updatedAt: NOW,
          provenance: { actorType: 'human', method: 'manual', createdAt: NOW },
        },
      ],
    },
  };

  const data = strToU8(JSON.stringify(snapshot));
  const manifest = {
    package: 'jym',
    formatVersion: 1,
    appVersion: 'e2e-fixture',
    created: NOW,
    kind: 'project',
    digestAlgorithm: 'sha256',
    media: 'included',
    dataSchemaVersion: 5,
    projects: [{ id: 'text_r4_s1', title: { default: 'R4 S1 Field Sample' }, documents: [] }],
    entities: [
      {
        type: 'media',
        id: 'media_r4_s1',
        bytes: 'included',
        timelineKind: 'acoustic',
        byteLocation: 'managed',
        availability: 'available',
        fileRef: 'media/media_r4_s1',
        contentSha256: wavSha,
        contentSize: wav.byteLength,
        mimeType: 'audio/wav',
      },
    ],
    files: [
      { path: 'data/project.json', sha256: sha256(data), size: data.byteLength, role: 'data' },
      { path: 'media/media_r4_s1', sha256: wavSha, size: wav.byteLength, role: 'media' },
    ],
    systemRefs: [],
    excluded: [],
  };

  return zipSync({
    mimetype: [strToU8('application/vnd.jieyu.jym'), { level: 0 }],
    'META-INF/manifest.json': strToU8(JSON.stringify(manifest)),
    'data/project.json': data,
    'media/media_r4_s1': [wav, { level: 0 }],
  });
}
