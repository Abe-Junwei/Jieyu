import { describe, expect, it } from 'vitest';
import {
  exportUtteranceToCldf,
  exportUtteranceToConllu,
  exportUtteranceToLigt,
} from './analysisGraphExport';
import { assignPartOfMwe, retainPartOfMwe } from './partOfMwe';
import { projectUtteranceAnalysisGraph } from './projectUtteranceAnalysisGraph';

const utterance = projectUtteranceAnalysisGraph({
  id: 'utt-1',
  text: 'sheep walked',
  tokens: [
    {
      id: 'tok-sheep',
      form: 'sheep',
      gloss: 'sheep',
      senseId: 'sense-sheep',
      entryPartsOfSpeech: ['noun'],
      morphemes: [
        {
          id: 'morph-sheep',
          form: 'sheep',
          gloss: 'S',
          surfaceParts: [
            { startOffset: 0, endOffset: 2 },
            { startOffset: 3, endOffset: 5 },
          ],
        },
      ],
    },
    {
      id: 'tok-walked',
      form: 'walked',
      gloss: 'walk-PST',
      pos: 'v',
      morphemes: [{ id: 'morph-walk', form: 'walk', gloss: 'walk' }],
    },
  ],
});

describe('projectUtteranceAnalysisGraph', () => {
  it('links words in order, aligns morphs, and points at a DMLex sense', () => {
    expect(utterance.relations).toContainEqual(
      expect.objectContaining({
        type: 'next',
        sourceId: 'tok-sheep',
        targetId: 'tok-walked',
        role: 'word',
      }),
    );
    expect(utterance.relations).toContainEqual(
      expect.objectContaining({ type: 'hasPart', sourceId: 'tok-sheep', targetId: 'morph-sheep' }),
    );
    expect(utterance.relations).toContainEqual(
      expect.objectContaining({
        type: 'linksLexeme',
        sourceId: 'tok-sheep',
        targetId: 'sense-sense-sheep',
      }),
    );
    expect(utterance.relations).toContainEqual(
      expect.objectContaining({ type: 'hasPos', targetId: 'tok-sheep' }),
    );
    const walkedGloss = utterance.nodes.find((node) => node.id === 'gloss-tok-walked');
    expect(walkedGloss?.label).toBe('walk-PST');
    expect(walkedGloss?.features).toEqual({ Tense: 'Past' });
    const sheepGloss = utterance.nodes.find((node) => node.id === 'gloss-morph-sheep');
    expect(sheepGloss?.label).toBe('S');
    expect(sheepGloss?.features).toBeUndefined();
    expect(utterance.projectionDiagnostics.some((row) => row.message.includes('ambiguous'))).toBe(
      true,
    );
    expect(utterance.relations.some((relation) => relation.type === 'discontinuousPartOf')).toBe(
      true,
    );
  });

  it('exports CLDF, CoNLL-U, and Ligt without rewriting the gloss label', () => {
    const cldf = exportUtteranceToCldf(utterance, { translatedText: 'a sheep walked' });
    expect(cldf.row).toMatchObject({
      ID: 'utt-1',
      Primary_Text: 'sheep walked',
      Analyzed_Word: 'sheep walk',
      Gloss: 'sheep walk-PST',
      Translated_Text: 'a sheep walked',
    });
    const conllu = exportUtteranceToConllu(assignPartOfMwe(utterance, ['tok-sheep', 'tok-walked']));
    expect(conllu).toContain('Tense=Past');
    expect(conllu).toContain('\tfixed\t');
    expect(conllu).toContain('# diagnostic:');
    expect(conllu).toContain('\t_\tv\t');
    expect(conllu).toContain('Part of speech v is not a UD tag');
    expect(conllu).not.toContain('\t5.1\t');
    expect(conllu).not.toContain('\tv\t_\t');
    const ligt = exportUtteranceToLigt(utterance);
    expect(ligt['@type']).toBe('ligt:Utterance');
    const tiers = ligt['ligt:hasTier'] as Array<{ '@type': string; 'ligt:item': unknown[] }>;
    expect(tiers.map((tier) => tier['@type'])).toEqual(['ligt:WordTier', 'ligt:MorphTier']);
    const words = tiers[0]?.['ligt:item'] as Array<{ 'ligt:next'?: { '@id': string } }>;
    expect(words[0]?.['ligt:next']).toEqual({ '@id': 'tok-walked' });
    const morphs = tiers[1]?.['ligt:item'] as Array<{
      '@id': string;
      'ligt:next'?: { '@id': string };
    }>;
    expect(morphs[0]?.['ligt:next']).toEqual({ '@id': morphs[1]?.['@id'] });
  });

  it('keeps an earlier multiword group when another run is added', () => {
    const first = assignPartOfMwe(utterance, ['tok-sheep', 'tok-walked']);
    const again = projectUtteranceAnalysisGraph({
      id: 'utt-1',
      text: 'sheep walked home',
      tokens: [
        { id: 'tok-sheep', form: 'sheep', gloss: 'sheep' },
        { id: 'tok-walked', form: 'walked', gloss: 'walk-PST', pos: 'v' },
        { id: 'tok-home', form: 'home' },
      ],
    });
    const kept = assignPartOfMwe(retainPartOfMwe(again, first), ['tok-walked', 'tok-home']);
    const groups = kept.relations.filter((relation) => relation.type === 'partOfMwe');
    expect(new Set(groups.map((relation) => relation.targetId)).size).toBe(2);
    expect(groups.every((relation) => relation.id.length <= 128)).toBe(true);
  });

  it('omits the CLDF row when the utterance has no tokens', () => {
    const empty = projectUtteranceAnalysisGraph({
      id: 'utt-empty',
      text: 'unsegmented',
      tokens: [],
    });
    expect(exportUtteranceToCldf(empty).row).toBeNull();
  });
});
