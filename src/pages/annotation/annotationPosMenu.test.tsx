// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../db';
import { LocaleProvider } from '../../i18n';
import { LinguisticService } from '../../services/LinguisticService';
import type { AnnotationMorphologyController } from '../useAnnotationMorphologyController';
import { AnnotationIgtRowView } from './AnnotationIgtRow';
import { EMPTY_ANNOTATION_DOCUMENT_LAYOUT } from './annotationIgtLines';
import type { AnnotationIgtRow } from './annotationIgtRows';
import { saveAnnotationPosByForm } from './saveAnnotationPosByForm';
import { addAlternativePos } from '../../annotation/alternativeAnalysis';
import { projectUtteranceAnalysisGraph } from '../../annotation/projectUtteranceAnalysisGraph';
import { saveAnnotationUnitAnalysisGraph } from './saveAnnotationUnitAnalysisGraph';

const row: AnnotationIgtRow = {
  id: 'unit-pos',
  timeLabel: '0:00',
  startTime: 0,
  endTime: 1,
  mediaId: '',
  surface: 'dog',
  tokens: [{ id: 'tok-pos', form: 'dog', gloss: '', pos: '', glossLang: 'default' }],
  translation: '',
  transcriptionHref: '/transcription',
};

const morphology = {
  morphsByTokenId: {},
  drafts: {},
  linksByTokenId: {},
  senseChoicesByTokenId: {},
  onSplitToken: vi.fn(),
  onMergeToken: vi.fn(),
  onSeedMorphemes: vi.fn(),
  onLinkLexeme: vi.fn(),
} as unknown as AnnotationMorphologyController;

describe('annotation pos and alternative menu', () => {
  const now = '2026-09-30T00:00:00.000Z';

  afterEach(async () => {
    cleanup();
    await Promise.all([
      db.unit_tokens.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.tier_definitions.clear(),
    ]);
  });

  it('applies a drafted POS from the token menu and reads it back', async () => {
    await db.unit_tokens.put({
      id: 'tok-pos',
      textId: 'text-pos',
      unitId: 'unit-pos',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    render(
      <MemoryRouter>
        <LocaleProvider locale="zh-CN">
          <AnnotationIgtRowView
            row={row}
            focused
            inputFocused={false}
            drafts={{ 'tok-pos': { pos: 'N', gloss: '' } }}
            morphology={morphology}
            acousticLayers={{ showWave: false, showSpectrum: false, showPitch: false }}
            onFocusRow={() => undefined}
            onFocusInput={() => undefined}
            onTokenDraftChange={() => undefined}
            layout={EMPTY_ANNOTATION_DOCUMENT_LAYOUT}
            onLayoutChange={() => undefined}
            onApplyPosByForm={(_unitId, tokenId, pos) => {
              void saveAnnotationPosByForm([
                { unitId: 'unit-pos', tokenId, glossLang: 'default', pos },
              ]);
            }}
          />
        </LocaleProvider>
      </MemoryRouter>,
    );
    fireEvent.contextMenu(screen.getByTestId('annotation-igt-form-tok-pos'));
    fireEvent.click(screen.getByTestId('annotation-igt-pos-apply-tok-pos'));
    await waitFor(async () => {
      const stored = await db.unit_tokens.get('tok-pos');
      expect(stored?.pos).toBe('N');
    });
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-pos']);
    expect(requery[0]?.pos).toBe('N');
  });

  it('adds an alternative analysis from the token menu and reads the graph back', async () => {
    await LinguisticService.layers.saveTranslation({
      id: 'lane-pos',
      textId: 'text-pos',
      key: 'lane-pos',
      name: { default: 'lane' },
      languageId: 'und',
      modality: 'text',
      layerType: 'transcription',
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.units.saveBatch([
      {
        id: 'unit-pos',
        textId: 'text-pos',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'dog' },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const graphRow: AnnotationIgtRow = {
      ...row,
      tokens: [{ id: 'tok-pos', form: 'dog', gloss: '', pos: 'N', glossLang: 'default' }],
    };
    render(
      <MemoryRouter>
        <LocaleProvider locale="zh-CN">
          <AnnotationIgtRowView
            row={graphRow}
            focused
            inputFocused={false}
            drafts={{ 'tok-pos': { pos: 'VERB', gloss: '' } }}
            morphology={morphology}
            acousticLayers={{ showWave: false, showSpectrum: false, showPitch: false }}
            onFocusRow={() => undefined}
            onFocusInput={() => undefined}
            onTokenDraftChange={() => undefined}
            layout={EMPTY_ANNOTATION_DOCUMENT_LAYOUT}
            onLayoutChange={() => undefined}
            onAddAlternative={() => {
              const base = projectUtteranceAnalysisGraph({
                id: 'unit-pos',
                text: 'dog',
                tokens: [{ id: 'tok-pos', form: 'dog', pos: 'N' }],
              });
              void saveAnnotationUnitAnalysisGraph({
                textId: 'text-pos',
                unitId: 'unit-pos',
                graph: addAlternativePos(base, 'tok-pos', 'VERB'),
              });
            }}
          />
        </LocaleProvider>
      </MemoryRouter>,
    );
    fireEvent.contextMenu(screen.getByTestId('annotation-igt-form-tok-pos'));
    fireEvent.click(screen.getByTestId('annotation-igt-alt-add-tok-pos'));
    await waitFor(async () => {
      const stored = (await LinguisticService.units.listByTextId('text-pos')).find(
        (unit) => unit.id === 'unit-pos',
      );
      expect(
        stored?.analysisGraph?.relations.some(
          (relation) => relation.type === 'alternativeAnalysis',
        ),
      ).toBe(true);
    });
  });
});
