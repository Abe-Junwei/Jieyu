/**
 * DMLex 1.0 JSON shapes from docs/architecture/dmlex/dmlex.schema.json.
 * POS, labels, and translationLanguages are strings in the JSON serialization.
 */

export interface DmlexTranscription {
  text: string;
  scheme?: string;
}

export interface DmlexPronunciation {
  soundFile?: string;
  transcriptions?: DmlexTranscription[];
  labels?: string[];
}

export interface DmlexInflectedForm {
  text: string;
  tag?: string;
  labels?: string[];
  pronunciations?: DmlexPronunciation[];
}

export interface DmlexDefinition {
  text: string;
  definitionType?: string;
}

export interface DmlexHeadwordTranslation {
  text: string;
  langCode?: string;
  partsOfSpeech?: string[];
  labels?: string[];
}

export interface DmlexHeadwordExplanation {
  text: string;
  langCode?: string;
}

export interface DmlexExampleTranslation {
  text: string;
  langCode?: string;
  labels?: string[];
}

export interface DmlexExample {
  text: string;
  sourceIdentity?: string;
  sourceElaboration?: string;
  soundFile?: string;
  labels?: string[];
  exampleTranslations?: DmlexExampleTranslation[];
}

export interface DmlexSense {
  id?: string;
  indicator?: string;
  labels?: string[];
  definitions?: DmlexDefinition[];
  examples?: DmlexExample[];
  headwordExplanations?: DmlexHeadwordExplanation[];
  headwordTranslations?: DmlexHeadwordTranslation[];
}

export interface DmlexEtymonUnit {
  langCode: string;
  text: string;
  reconstructed?: boolean;
  partsOfSpeech?: string[];
  translation?: string;
}

export interface DmlexEtymon {
  etymonUnits: DmlexEtymonUnit[];
  when?: string;
  type?: string;
  note?: string;
}

export interface DmlexEtymology {
  description?: string;
  etymons?: DmlexEtymon[];
}

export interface DmlexEntry {
  id?: string;
  headword: string;
  homographNumber?: string;
  partsOfSpeech?: string[];
  labels?: string[];
  pronunciations?: DmlexPronunciation[];
  inflectedForms?: DmlexInflectedForm[];
  senses?: DmlexSense[];
  etymologies?: DmlexEtymology[];
}

export interface DmlexMember {
  ref: string;
  role?: string;
  obverseListingOrder?: number;
}

export interface DmlexRelation {
  type: string;
  description?: string;
  members: DmlexMember[];
}

export type DmlexScopeRestriction = 'sameEntry' | 'sameResource' | 'any';

export interface DmlexRelationType {
  type: string;
  description?: string;
  scopeRestriction?: DmlexScopeRestriction;
}

export interface DmlexLexicographicResource {
  langCode: string;
  translationLanguages: string[];
  title?: string;
  relations?: DmlexRelation[];
  relationTypes?: DmlexRelationType[];
}

/** Corpus example pointer. `example` has no id; `exampleIndex` is the sense array index. */
export interface JieyuExampleRef {
  senseId: string;
  exampleIndex: number;
  segmentId: string;
}

/** One free-text note. Not a FLEx note type. */
export interface JieyuNote {
  owner: 'entry' | 'sense';
  ref: string;
  text: string;
}

/** A sentence occurrence cited from a sense. The sentence is read live, not copied. */
export interface JieyuOccurrenceCitation {
  textId: string;
  unitId: string;
  tokenId: string;
  lexemeId: string;
  senseId: string;
}

export interface JieyuLexemeExtras {
  exampleRefs?: JieyuExampleRef[];
  notes?: JieyuNote[];
  occurrenceCitations?: JieyuOccurrenceCitation[];
}

/** 每个项目一行 DMLex resource，ID 带项目前缀 | One DMLex resource row per project */
export const DMLEX_RESOURCE_ID_PREFIX = 'dmlex-resource:';

export function dmlexResourceIdForProject(textId: string): string {
  return `${DMLEX_RESOURCE_ID_PREFIX}${textId}`;
}
export const DMLEX_SUBSENSE = 'subsense';
export const DMLEX_HOMOGRAPH = 'homograph';
