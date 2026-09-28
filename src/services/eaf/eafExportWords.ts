import type { LayerUnitDocType, UnitMorphemeDocType, UnitTokenDocType } from '../../db';
import type { EafExportScratch } from './eafExportScratch';
import { escapeXml, readMultiLangDefault } from './eafXml';

export function buildEafWordTierXml(input: {
  tokens: UnitTokenDocType[];
  morphemes: UnitMorphemeDocType[];
  sorted: LayerUnitDocType[];
  uttAnnotationIdMap: Map<string, string>;
  defaultTierId: string;
  defaultTrcLocale: string;
  scratch: EafExportScratch;
}): string[] {
  const {
    tokens,
    morphemes,
    sorted,
    uttAnnotationIdMap,
    defaultTierId,
    defaultTrcLocale,
    scratch,
  } = input;
  let annCounter = scratch.annCounter;
  const { usedConstraintTypes } = scratch;

  const wordTierXml: string[] = [];
  const tokensByUnitId = new Map<string, UnitTokenDocType[]>();
  for (const token of tokens) {
    const unitId = token.unitId?.trim();
    if (!unitId) continue;
    const bucket = tokensByUnitId.get(unitId) ?? [];
    bucket.push(token);
    tokensByUnitId.set(unitId, bucket);
  }
  for (const bucket of tokensByUnitId.values()) {
    bucket.sort((a, b) => a.tokenIndex - b.tokenIndex);
  }
  const morphsByTokenId = new Map<string, UnitMorphemeDocType[]>();
  for (const morph of morphemes) {
    const tokenId = morph.tokenId?.trim();
    if (!tokenId) continue;
    const bucket = morphsByTokenId.get(tokenId) ?? [];
    bucket.push(morph);
    morphsByTokenId.set(tokenId, bucket);
  }
  for (const bucket of morphsByTokenId.values()) {
    bucket.sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  }

  if (tokensByUnitId.size > 0) {
    usedConstraintTypes.add('symbolic_subdivision');
    const wordAnnRows: string[] = [];
    const glossAnnRows: string[] = [];
    const morphAnnRows: string[] = [];
    const morphGlossAnnRows: string[] = [];

    for (const utt of sorted) {
      const parentAnnId = uttAnnotationIdMap.get(utt.id);
      const unitTokens = tokensByUnitId.get(utt.id) ?? [];
      if (!parentAnnId || unitTokens.length === 0) continue;
      let previousWordAnnId: string | undefined;
      for (const token of unitTokens) {
        const formText = readMultiLangDefault(token.form);
        if (!formText) continue;
        const wordAnnId = `w${annCounter++}`;
        const previousAttr = previousWordAnnId
          ? ` PREVIOUS_ANNOTATION="${escapeXml(previousWordAnnId)}"`
          : '';
        const lexemeAttr = token.lexemeId ? ` JIEYU_LEXEME_ID="${escapeXml(token.lexemeId)}"` : '';
        wordAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="${escapeXml(wordAnnId)}" ANNOTATION_REF="${escapeXml(parentAnnId)}"${previousAttr}${lexemeAttr}>
                <ANNOTATION_VALUE>${escapeXml(formText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
        previousWordAnnId = wordAnnId;
        const glossText = readMultiLangDefault(token.gloss);
        if (glossText) {
          usedConstraintTypes.add('symbolic_association');
          glossAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="a${annCounter++}" ANNOTATION_REF="${escapeXml(wordAnnId)}">
                <ANNOTATION_VALUE>${escapeXml(glossText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
        }
        const tokenMorphs = morphsByTokenId.get(token.id) ?? [];
        let previousMorphAnnId: string | undefined;
        for (const morph of tokenMorphs) {
          const morphText = readMultiLangDefault(morph.form);
          if (!morphText) continue;
          const morphAnnId = `a${annCounter++}`;
          const previousMorphAttr = previousMorphAnnId
            ? ` PREVIOUS_ANNOTATION="${escapeXml(previousMorphAnnId)}"`
            : '';
          const morphLexemeAttr = morph.lexemeId
            ? ` JIEYU_LEXEME_ID="${escapeXml(morph.lexemeId)}"`
            : '';
          morphAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="${escapeXml(morphAnnId)}" ANNOTATION_REF="${escapeXml(wordAnnId)}"${previousMorphAttr}${morphLexemeAttr}>
                <ANNOTATION_VALUE>${escapeXml(morphText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
          previousMorphAnnId = morphAnnId;
          const morphGlossText = readMultiLangDefault(morph.gloss);
          if (morphGlossText) {
            usedConstraintTypes.add('symbolic_association');
            morphGlossAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="a${annCounter++}" ANNOTATION_REF="${escapeXml(morphAnnId)}">
                <ANNOTATION_VALUE>${escapeXml(morphGlossText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
          }
        }
      }
    }

    if (wordAnnRows.length > 0) {
      wordTierXml.push(`    <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="word-lt" PARENT_REF="${escapeXml(defaultTierId)}" DEFAULT_LOCALE="${escapeXml(defaultTrcLocale)}">
${wordAnnRows.join('\n')}
    </TIER>`);
      if (glossAnnRows.length > 0) {
        wordTierXml.push(`    <TIER TIER_ID="word-gloss" LINGUISTIC_TYPE_REF="translation-lt" PARENT_REF="words" DEFAULT_LOCALE="en">
${glossAnnRows.join('\n')}
    </TIER>`);
      }
      if (morphAnnRows.length > 0) {
        wordTierXml.push(`    <TIER TIER_ID="morphemes" LINGUISTIC_TYPE_REF="word-lt" PARENT_REF="words" DEFAULT_LOCALE="${escapeXml(defaultTrcLocale)}">
${morphAnnRows.join('\n')}
    </TIER>`);
        if (morphGlossAnnRows.length > 0) {
          wordTierXml.push(`    <TIER TIER_ID="morph-gloss" LINGUISTIC_TYPE_REF="translation-lt" PARENT_REF="morphemes" DEFAULT_LOCALE="en">
${morphGlossAnnRows.join('\n')}
    </TIER>`);
        }
      }
    }
  }

  scratch.annCounter = annCounter;
  return wordTierXml;
}
