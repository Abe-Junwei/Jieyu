// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StructuralRuleProfileSandboxPanel } from './StructuralRuleProfileSandboxPanel';
import type { StructuralRuleProfilePreview } from '../services/LinguisticService.structuralProfiles';

const preview: StructuralRuleProfilePreview = {
  resolution: {
    profile: {
      id: 'system.leipzig-structural.v1',
      label: 'Leipzig structural profile',
      version: '1',
      scope: 'system',
      symbols: {
        morphemeBoundary: '-',
        featureSeparator: '.',
        cliticBoundary: '=',
        infixStart: '<',
        infixEnd: '>',
        suppliedStart: '[',
        suppliedEnd: ']',
        alternationMarker: '\\',
      },
      zeroMarkers: ['ZERO'],
      reduplicationMarkers: ['REDUP'],
      warningPolicy: {
        emptySegment: 'warning',
        unmatchedWrapper: 'warning',
        alternationMarker: 'info',
      },
      projectionTargets: ['latex'],
    },
    appliedAssetIds: [],
    diagnostics: [],
  },
  parseResult: {
    profileId: 'system.leipzig-structural.v1',
    input: 'dog-PL',
    segments: [
      { id: 'seg-1', text: 'dog', kind: 'lexical', wordIndex: 0, startOffset: 0, endOffset: 3 },
      { id: 'seg-2', text: 'PL', kind: 'feature', wordIndex: 0, startOffset: 4, endOffset: 6 },
    ],
    boundaries: [{ type: 'morpheme', marker: '-', offset: 3, wordIndex: 0 }],
    features: [{ segmentId: 'seg-2', label: 'PL' }],
    warnings: [],
    projectionDiagnostics: [{ target: 'latex', status: 'complete', message: 'ready' }],
  },
  candidateGraph: {
    id: 'candidate',
    text: 'dog-PL',
    displayGloss: 'dog-PL',
    nodes: [{ id: 'token-1', type: 'token', label: 'dog-PL' }],
    relations: [],
    projectionDiagnostics: [{ target: 'latex', status: 'complete', message: 'ready' }],
  },
};

describe('StructuralRuleProfileSandboxPanel', () => {
  it('toggles enabled state using the current enabled value', () => {
    const onToggleEnabled = vi.fn();
    render(
      <StructuralRuleProfileSandboxPanel
        preview={null}
        onPreview={vi.fn()}
        templateEnabled
        onToggleEnabled={onToggleEnabled}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    expect(onToggleEnabled).toHaveBeenCalledWith(false);
  });

  it('catches import and export errors inside the panel', async () => {
    render(
      <StructuralRuleProfileSandboxPanel
        preview={preview}
        onPreview={vi.fn()}
        onImportTemplate={() => { throw new Error('bad import'); }}
        onExportTemplate={() => { throw new Error('bad export'); }}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Paste exported StructuralRuleProfile JSON'), {
      target: { value: '{bad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect((await screen.findByRole('alert')).textContent).toContain('bad import');

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('bad export');
    });
  });
});
