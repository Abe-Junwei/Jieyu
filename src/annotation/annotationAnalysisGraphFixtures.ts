import type { AnnotationAnalysisGraphFixture } from './analysisGraph';

export const annotationAnalysisGraphFixtures = [
  {
    id: 'fixture-clitic-im',
    text: "I'm here.",
    displayGloss: '1SG=COP here',
    nodes: [
      { id: 'tok-1', type: 'token', label: "I'm", surfaceParts: [{ tokenId: 'tok-1', startOffset: 0, endOffset: 3 }] },
      { id: 'word-1', type: 'word', label: 'I' },
      { id: 'word-2', type: 'word', label: 'am' },
      { id: 'gloss-1', type: 'gloss', label: '1SG', features: { person: '1', number: 'SG' } },
      { id: 'gloss-2', type: 'gloss', label: 'COP', features: { category: 'copula' } },
    ],
    relations: [
      { id: 'rel-1', type: 'contains', sourceId: 'tok-1', targetId: 'word-1' },
      { id: 'rel-2', type: 'contains', sourceId: 'tok-1', targetId: 'word-2', role: 'clitic' },
      { id: 'rel-3', type: 'cliticizesTo', sourceId: 'word-2', targetId: 'word-1' },
      { id: 'rel-4', type: 'glosses', sourceId: 'gloss-1', targetId: 'word-1' },
      { id: 'rel-5', type: 'glosses', sourceId: 'gloss-2', targetId: 'word-2' },
    ],
    projectionDiagnostics: [
      { target: 'latex', status: 'complete', message: 'Render with = clitic boundary.' },
      { target: 'conllu', status: 'degraded', message: 'Surface contraction projected as multiword token if target profile supports it.' },
    ],
  },
  {
    id: 'fixture-mwe-take-a-walk',
    text: 'take a walk',
    displayGloss: 'take a walk',
    nodes: [
      { id: 'tok-1', type: 'token', label: 'take' },
      { id: 'tok-2', type: 'token', label: 'a' },
      { id: 'tok-3', type: 'token', label: 'walk' },
      { id: 'mwe-1', type: 'mwe', label: 'take a walk' },
      { id: 'lex-1', type: 'lexemeRef', label: 'take_a_walk' },
    ],
    relations: [
      { id: 'rel-1', type: 'partOfMwe', sourceId: 'tok-1', targetId: 'mwe-1' },
      { id: 'rel-2', type: 'partOfMwe', sourceId: 'tok-2', targetId: 'mwe-1' },
      { id: 'rel-3', type: 'partOfMwe', sourceId: 'tok-3', targetId: 'mwe-1' },
      { id: 'rel-4', type: 'linksLexeme', sourceId: 'mwe-1', targetId: 'lex-1' },
    ],
    projectionDiagnostics: [
      { target: 'lift', status: 'complete', message: 'MWE can be exported as phrase/lexeme entry.' },
      { target: 'conllu', status: 'complete', message: 'Project as MWT or fixed/compound relation depending profile.' },
    ],
  },
  {
    id: 'fixture-zero-plural',
    text: 'sheep',
    displayGloss: 'sheep-ZERO.PL',
    nodes: [
      { id: 'tok-1', type: 'token', label: 'sheep' },
      { id: 'morph-1', type: 'morpheme', label: 'sheep', surfaceParts: [{ tokenId: 'tok-1', startOffset: 0, endOffset: 5 }] },
      { id: 'zero-1', type: 'zero', label: 'ZERO' },
      { id: 'feature-1', type: 'featureBundle', label: 'PL', features: { number: 'PL' } },
    ],
    relations: [
      { id: 'rel-1', type: 'contains', sourceId: 'tok-1', targetId: 'morph-1' },
      { id: 'rel-2', type: 'realizesFeature', sourceId: 'zero-1', targetId: 'feature-1' },
    ],
    projectionDiagnostics: [
      { target: 'conllu', status: 'complete', message: 'Can project as empty node or feature on token depending target policy.' },
      { target: 'latex', status: 'complete', message: 'Render zero morpheme as ZERO.' },
    ],
  },
  {
    id: 'fixture-infix',
    text: 'tango',
    displayGloss: 'touch<PRS>',
    nodes: [
      { id: 'tok-1', type: 'token', label: 'tango' },
      {
        id: 'morph-root',
        type: 'morpheme',
        label: 'tag',
        surfaceParts: [
          { tokenId: 'tok-1', startOffset: 0, endOffset: 2 },
          { tokenId: 'tok-1', startOffset: 3, endOffset: 5 },
        ],
      },
      {
        id: 'morph-infix',
        type: 'morpheme',
        label: 'n',
        surfaceParts: [{ tokenId: 'tok-1', startOffset: 2, endOffset: 3 }],
        features: { role: 'infix' },
      },
      { id: 'feature-prs', type: 'featureBundle', label: 'PRS', features: { tense: 'PRS' } },
    ],
    relations: [
      { id: 'rel-1', type: 'contains', sourceId: 'tok-1', targetId: 'morph-root' },
      { id: 'rel-2', type: 'contains', sourceId: 'tok-1', targetId: 'morph-infix', role: 'infix' },
      { id: 'rel-3', type: 'realizesFeature', sourceId: 'morph-infix', targetId: 'feature-prs' },
    ],
    projectionDiagnostics: [
      { target: 'latex', status: 'complete', message: 'Render infix with angle brackets.' },
      { target: 'flex', status: 'degraded', message: 'If FLEx profile lacks infix offsets, preserve role in custom field.' },
    ],
  },
  {
    id: 'fixture-circumfix',
    text: 'gelaufen',
    displayGloss: 'PTCP>run<PTCP',
    nodes: [
      { id: 'tok-1', type: 'token', label: 'gelaufen' },
      { id: 'morph-root', type: 'morpheme', label: 'lauf', surfaceParts: [{ tokenId: 'tok-1', startOffset: 2, endOffset: 6 }] },
      {
        id: 'morph-circ',
        type: 'morpheme',
        label: 'ge...en',
        surfaceParts: [
          { tokenId: 'tok-1', startOffset: 0, endOffset: 2 },
          { tokenId: 'tok-1', startOffset: 6, endOffset: 8 },
        ],
      },
      { id: 'feature-ptcp', type: 'featureBundle', label: 'PTCP', features: { verbForm: 'PTCP' } },
    ],
    relations: [
      { id: 'rel-1', type: 'discontinuousPartOf', sourceId: 'morph-circ', targetId: 'tok-1' },
      { id: 'rel-2', type: 'realizesFeature', sourceId: 'morph-circ', targetId: 'feature-ptcp' },
    ],
    projectionDiagnostics: [
      { target: 'latex', status: 'complete', message: 'Render as discontinuous circumfix marker.' },
      { target: 'conllu', status: 'degraded', message: 'Project feature on word; preserve discontinuity in MISC.' },
    ],
  },
  {
    id: 'fixture-reduplication',
    text: 'wug-wug',
    displayGloss: 'REDUP-dog',
    nodes: [
      { id: 'tok-1', type: 'token', label: 'wug-wug' },
      { id: 'stem-1', type: 'morpheme', label: 'wug', surfaceParts: [{ tokenId: 'tok-1', startOffset: 4, endOffset: 7 }] },
      {
        id: 'redup-1',
        type: 'morpheme',
        label: 'wug',
        surfaceParts: [{ tokenId: 'tok-1', startOffset: 0, endOffset: 3 }],
        features: { role: 'reduplicant' },
      },
      { id: 'process-1', type: 'process', label: 'reduplication', features: { processType: 'reduplication' } },
    ],
    relations: [
      { id: 'rel-1', type: 'reduplicates', sourceId: 'redup-1', targetId: 'stem-1' },
      { id: 'rel-2', type: 'derivedByProcess', sourceId: 'redup-1', targetId: 'process-1' },
    ],
    projectionDiagnostics: [
      { target: 'latex', status: 'complete', message: 'Render REDUP in gloss row.' },
      { target: 'lift', status: 'degraded', message: 'Export reduplication process as custom trait if no native field exists.' },
    ],
  },
  {
    id: 'fixture-root-pattern',
    text: 'katab',
    displayGloss: 'write.PFV.3SG',
    nodes: [
      { id: 'tok-1', type: 'token', label: 'katab' },
      {
        id: 'root-1',
        type: 'root',
        label: 'k-t-b',
        surfaceParts: [
          { tokenId: 'tok-1', startOffset: 0, endOffset: 1 },
          { tokenId: 'tok-1', startOffset: 2, endOffset: 3 },
          { tokenId: 'tok-1', startOffset: 4, endOffset: 5 },
        ],
      },
      { id: 'pattern-1', type: 'pattern', label: 'CaCaC' },
      { id: 'feature-1', type: 'featureBundle', label: 'PFV.3SG', features: { aspect: 'PFV', person: '3', number: 'SG' } },
      { id: 'process-1', type: 'process', label: 'templaticMapping', features: { processType: 'templaticMapping' } },
    ],
    relations: [
      { id: 'rel-1', type: 'discontinuousPartOf', sourceId: 'root-1', targetId: 'tok-1' },
      { id: 'rel-2', type: 'realizesFeature', sourceId: 'pattern-1', targetId: 'feature-1' },
      { id: 'rel-3', type: 'derivedByProcess', sourceId: 'tok-1', targetId: 'process-1' },
    ],
    projectionDiagnostics: [
      { target: 'latex', status: 'degraded', message: 'Render compact gloss; root-pattern structure available in note.' },
      { target: 'conllu', status: 'degraded', message: 'Project features to FEATS; preserve root/pattern in MISC.' },
    ],
  },
  {
    id: 'fixture-suppletion-portmanteau',
    text: 'went',
    displayGloss: 'go.PST',
    nodes: [
      { id: 'tok-1', type: 'token', label: 'went' },
      { id: 'lex-1', type: 'lexemeRef', label: 'go' },
      { id: 'underlying-1', type: 'underlyingForm', label: 'go' },
      { id: 'surface-1', type: 'surfaceForm', label: 'went', surfaceParts: [{ tokenId: 'tok-1', startOffset: 0, endOffset: 4 }] },
      { id: 'exponent-1', type: 'exponent', label: 'went', features: { tense: 'PST' } },
      { id: 'feature-1', type: 'featureBundle', label: 'PST', features: { tense: 'PST' } },
      { id: 'process-1', type: 'process', label: 'suppletion', features: { processType: 'suppletion' } },
    ],
    relations: [
      { id: 'rel-1', type: 'linksLexeme', sourceId: 'tok-1', targetId: 'lex-1' },
      { id: 'rel-2', type: 'hasUnderlyingForm', sourceId: 'lex-1', targetId: 'underlying-1' },
      { id: 'rel-3', type: 'hasSurfaceForm', sourceId: 'tok-1', targetId: 'surface-1' },
      { id: 'rel-4', type: 'suppletes', sourceId: 'surface-1', targetId: 'underlying-1' },
      { id: 'rel-5', type: 'derivedByProcess', sourceId: 'surface-1', targetId: 'process-1' },
      { id: 'rel-6', type: 'realizesFeature', sourceId: 'exponent-1', targetId: 'feature-1' },
    ],
    projectionDiagnostics: [
      { target: 'conllu', status: 'complete', message: 'Project lemma=go, form=went, FEATS Tense=Past.' },
      { target: 'latex', status: 'degraded', message: 'Display gloss can show go.PST; suppletion relation is hidden unless diagnostic note enabled.' },
    ],
  },
] satisfies AnnotationAnalysisGraphFixture[];

export const annotationAnalysisGraphFixtureIds = annotationAnalysisGraphFixtures.map((fixture) => fixture.id);
