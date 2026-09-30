import { LinguisticService } from '../../app/languageAssetPageAccess';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import {
  occurrenceCitationStatus,
  type OccurrenceCitation,
} from '../annotation/annotationOccurrenceCitation';
import { pickAnnotationTranslationText } from '../annotation/annotationTranslationText';

export type OccurrenceCitationDisplay = OccurrenceCitation & {
  surface: string;
  translation: string;
  status: 'live' | 'broken';
};

/** Read the sentence from the unit. Do not copy it onto the lexeme. */
export async function loadOccurrenceCitationDisplays(
  citations: readonly OccurrenceCitation[],
): Promise<OccurrenceCitationDisplay[]> {
  const textIds = [
    ...new Set(citations.map((citation) => citation.textId).filter((id) => id.length > 0)),
  ];
  const unitsByText = new Map<
    string,
    Awaited<ReturnType<typeof LinguisticService.units.listByTextId>>
  >();
  const layersByText = new Map<
    string,
    Awaited<ReturnType<typeof LinguisticService.layers.listByTextId>>
  >();
  for (const textId of textIds) {
    unitsByText.set(textId, await LinguisticService.units.listByTextId(textId));
    layersByText.set(textId, await LinguisticService.layers.listByTextId(textId));
  }
  const displays: OccurrenceCitationDisplay[] = [];
  for (const citation of citations) {
    const unit = (unitsByText.get(citation.textId) ?? []).find(
      (item) => item.id === citation.unitId,
    );
    const translationLayerIds = (layersByText.get(citation.textId) ?? [])
      .filter((layer) => layer.layerType === 'translation')
      .map((layer) => layer.id);
    const contents = unit ? await LinguisticService.timeline.listUnitTexts(unit.id) : [];
    const links = await LinguisticService.units.listTokenLexemeLinks('token', citation.tokenId);
    const link = links.find((item) => item.lexemeId === citation.lexemeId);
    displays.push({
      ...citation,
      surface: pickDefaultTranscriptionText(unit?.transcription),
      translation:
        pickAnnotationTranslationText({ contents, translationLayerIds }).get(citation.unitId) ?? '',
      status: occurrenceCitationStatus(
        citation,
        link
          ? { lexemeId: link.lexemeId, ...(link.senseId ? { senseId: link.senseId } : {}) }
          : undefined,
      ),
    });
  }
  return displays;
}
