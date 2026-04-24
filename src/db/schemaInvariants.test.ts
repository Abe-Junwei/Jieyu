import { describe, expect, it } from 'vitest';
import { validateLayerDoc, validateLayerUnitContentDoc, validateLayerUnitDoc, validateMediaItemDoc, validateTextDoc, validateTokenLexemeLinkDoc, validateTrackEntityDoc, validateTierDefinitionDoc, validateUnitRelationDoc, validateUserNoteDoc, validateUnitMorphemeDoc, validateUnitTokenDoc, type LayerDocType, type LayerUnitContentDocType, type LayerUnitDocType, type MediaItemDocType, type TextDocType, type TokenLexemeLinkDocType, type TrackEntityDocType, type TierDefinitionDocType, type UnitRelationDocType, type UserNoteDocType, type UnitMorphemeDocType, type UnitTokenDocType } from './index';

type InvalidMutation<T> = {
  name: string;
  mutate: (doc: T) => unknown;
  messageIncludes?: string;
};

type InvariantSuite<T> = {
  name: string;
  createValid: () => T;
  validate: (doc: T) => void;
  invalid: InvalidMutation<T>[];
};

function cloneDoc<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}

function runInvariantSuite<T>(suite: InvariantSuite<T>): void {
  describe(suite.name, () => {
    it('accepts valid baseline document', () => {
      expect(() => suite.validate(suite.createValid())).not.toThrow();
    });

    for (const invalidCase of suite.invalid) {
      it(`rejects invalid case: ${invalidCase.name}`, () => {
        const mutated = invalidCase.mutate(cloneDoc(suite.createValid()));
        const invoke = () => suite.validate(mutated as T);
        if (invalidCase.messageIncludes) {
          expect(invoke).toThrow(invalidCase.messageIncludes);
          return;
        }
        expect(invoke).toThrow();
      });
    }
  });
}

const NOW = '2026-04-12T00:00:00.000Z';

const textSuite: InvariantSuite<TextDocType> = {
  name: 'text invariants',
  createValid: () => ({
    id: 'text_valid_1',
    title: { default: 'Valid text' },
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateTextDoc,
  invalid: [
    {
      name: 'empty id',
      mutate: (doc) => ({ ...doc, id: '' }),
    },
  ],
};

const mediaItemSuite: InvariantSuite<MediaItemDocType> = {
  name: 'media item invariants',
  createValid: () => ({
    id: 'media_valid_1',
    textId: 'text_valid_1',
    filename: 'sample.wav',
    isOfflineCached: false,
    createdAt: NOW,
  }),
  validate: validateMediaItemDoc,
  invalid: [
    {
      name: 'empty filename',
      mutate: (doc) => ({ ...doc, filename: '' }),
    },
  ],
};

const unitSuite: InvariantSuite<LayerUnitDocType> = {
  name: 'unit invariants',
  createValid: () => ({
    id: 'utt_valid_1',
    textId: 'text_valid_1',
    mediaId: 'media_valid_1',
    startTime: 1,
    endTime: 3,
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateLayerUnitDoc,
  invalid: [
    {
      name: 'endTime earlier than startTime',
      mutate: (doc) => ({ ...doc, endTime: doc.startTime - 0.5 }),
      messageIncludes: 'endTime must be >= startTime',
    },
    {
      name: 'empty id',
      mutate: (doc) => ({ ...doc, id: '' }),
    },
  ],
};

const unitTokenSuite: InvariantSuite<UnitTokenDocType> = {
  name: 'unit token invariants',
  createValid: () => ({
    id: 'tok_valid_1',
    textId: 'text_valid_1',
    unitId: 'utt_valid_1',
    form: { default: 'hello' },
    tokenIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateUnitTokenDoc,
  invalid: [
    {
      name: 'negative token index',
      mutate: (doc) => ({ ...doc, tokenIndex: -1 }),
    },
  ],
};

const unitMorphemeSuite: InvariantSuite<UnitMorphemeDocType> = {
  name: 'unit morpheme invariants',
  createValid: () => ({
    id: 'morph_valid_1',
    textId: 'text_valid_1',
    unitId: 'utt_valid_1',
    tokenId: 'tok_valid_1',
    form: { default: 'he' },
    morphemeIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateUnitMorphemeDoc,
  invalid: [
    {
      name: 'negative morpheme index',
      mutate: (doc) => ({ ...doc, morphemeIndex: -1 }),
    },
  ],
};

const layerSuite: InvariantSuite<LayerDocType> = {
  name: 'layer invariants',
  createValid: () => ({
    id: 'layer_valid_1',
    textId: 'text_valid_1',
    key: 'trc_default',
    name: { default: 'Default Transcription' },
    layerType: 'transcription',
    languageId: 'zho',
    modality: 'text',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateLayerDoc,
  invalid: [
    {
      name: 'invalid layerType',
      mutate: (doc) => ({ ...doc, layerType: 'segment-layer' }),
    },
  ],
};

const layerUnitSuite: InvariantSuite<LayerUnitDocType> = {
  name: 'layer unit invariants',
  createValid: () => ({
    id: 'lu_valid_1',
    textId: 'text_valid_1',
    mediaId: 'media_valid_1',
    layerId: 'layer_trc_1',
    unitType: 'segment',
    startTime: 2,
    endTime: 4,
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateLayerUnitDoc,
  invalid: [
    {
      name: 'invalid unitType',
      mutate: (doc) => ({ ...doc, unitType: 'invalid-unit-type' }),
    },
    {
      name: 'negative duration ordering',
      mutate: (doc) => ({ ...doc, startTime: 5, endTime: 4 }),
      messageIncludes: 'endTime must be >= startTime',
    },
    {
      name: 'invalid selfCertainty enum',
      mutate: (doc) => ({ ...doc, unitType: 'unit', selfCertainty: 'maybe' as never }),
    },
  ],
};

const layerUnitContentSuite: InvariantSuite<LayerUnitContentDocType> = {
  name: 'layer unit content invariants',
  createValid: () => ({
    id: 'luc_valid_1',
    textId: 'text_valid_1',
    unitId: 'lu_valid_1',
    layerId: 'layer_trc_1',
    contentRole: 'primary_text',
    modality: 'text',
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateLayerUnitContentDoc,
  invalid: [
    {
      name: 'invalid content role',
      mutate: (doc) => ({ ...doc, contentRole: 'invalid-role' }),
    },
  ],
};

const unitRelationSuite: InvariantSuite<UnitRelationDocType> = {
  name: 'unit relation invariants',
  createValid: () => ({
    id: 'rel_valid_1',
    textId: 'text_valid_1',
    sourceUnitId: 'lu_valid_1',
    targetUnitId: 'lu_valid_2',
    relationType: 'derived_from',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateUnitRelationDoc,
  invalid: [
    {
      name: 'invalid relation type',
      mutate: (doc) => ({ ...doc, relationType: 'contains' }),
    },
  ],
};

const tierDefinitionSuite: InvariantSuite<TierDefinitionDocType> = {
  name: 'tier definition invariants',
  createValid: () => ({
    id: 'tier_valid_1',
    textId: 'text_valid_1',
    key: 'tier_default',
    name: { default: 'Tier Default' },
    tierType: 'time-aligned',
    contentType: 'transcription',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateTierDefinitionDoc,
  invalid: [
    {
      name: 'invalid tierType',
      mutate: (doc) => ({ ...doc, tierType: 'invalid-tier-type' }),
    },
  ],
};

const tokenLexemeLinkSuite: InvariantSuite<TokenLexemeLinkDocType> = {
  name: 'token lexeme link invariants',
  createValid: () => ({
    id: 'link_valid_1',
    targetType: 'token',
    targetId: 'tok_1',
    lexemeId: 'lex_1',
    role: 'manual',
    confidence: 0.8,
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateTokenLexemeLinkDoc,
  invalid: [
    {
      name: 'confidence greater than 1',
      mutate: (doc) => ({ ...doc, confidence: 1.01 }),
    },
    {
      name: 'invalid targetType',
      mutate: (doc) => ({ ...doc, targetType: 'segment' }),
    },
  ],
};

const userNoteSuite: InvariantSuite<UserNoteDocType> = {
  name: 'user note invariants',
  createValid: () => ({
    id: 'note_valid_1',
    targetType: 'unit',
    targetId: 'utt_valid_1',
    content: { default: 'note content' },
    createdAt: NOW,
    updatedAt: NOW,
  }),
  validate: validateUserNoteDoc,
  invalid: [
    {
      name: 'invalid target type',
      mutate: (doc) => ({ ...doc, targetType: 'segment' }),
    },
  ],
};

const trackEntitySuite: InvariantSuite<TrackEntityDocType> = {
  name: 'track entity invariants',
  createValid: () => ({
    id: 'track_valid_1',
    textId: 'text_valid_1',
    mediaId: 'media_valid_1',
    mode: 'multi-auto',
    laneLockMap: { spk_1: 0, spk_2: 1 },
    updatedAt: NOW,
  }),
  validate: validateTrackEntityDoc,
  invalid: [
    {
      name: 'negative lane index',
      mutate: (doc) => ({ ...doc, laneLockMap: { spk_1: -1 } }),
    },
    {
      name: 'non integer lane index',
      mutate: (doc) => ({ ...doc, laneLockMap: { spk_1: 1.5 } }),
    },
  ],
};

describe('db schema invariants matrix', () => {
  runInvariantSuite(textSuite);
  runInvariantSuite(mediaItemSuite);
  runInvariantSuite(unitSuite);
  runInvariantSuite(unitTokenSuite);
  runInvariantSuite(unitMorphemeSuite);
  runInvariantSuite(layerSuite);
  runInvariantSuite(layerUnitSuite);
  runInvariantSuite(layerUnitContentSuite);
  runInvariantSuite(unitRelationSuite);
  runInvariantSuite(tierDefinitionSuite);
  runInvariantSuite(tokenLexemeLinkSuite);
  runInvariantSuite(userNoteSuite);
  runInvariantSuite(trackEntitySuite);
});
