// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinguisticService } from '../services/LinguisticService';
import { useDialogs } from './useDialogs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDialogs', () => {
  it('preserves time mapping history from text metadata', async () => {
    const textDoc = {
      id: 'text-1',
      title: { und: 'Demo' },
      metadata: {
        timelineMode: 'document',
        logicalDurationSec: 1800,
        timeMapping: {
          offsetSec: 5,
          scale: 1.5,
          revision: 4,
        },
        timeMappingRollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
        timeMappingHistory: [
          {
            offsetSec: 0.5,
            scale: 0.95,
            revision: 2,
          },
          {
            offsetSec: 0,
            scale: 1,
            revision: 1,
          },
        ],
      },
    } as never;
    vi.spyOn(LinguisticService, 'getTextById').mockResolvedValue(textDoc);
    vi.spyOn(LinguisticService, 'getAllTexts').mockResolvedValue([textDoc] as never);

    const { result } = renderHook(() => useDialogs([{ textId: 'text-1' }]));

    await waitFor(() => {
      expect(result.current.activeTextTimeMapping).toMatchObject({
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        logicalDurationSec: 1800,
        rollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
        history: [
          {
            offsetSec: 0.5,
            scale: 0.95,
            revision: 2,
          },
          {
            offsetSec: 0,
            scale: 1,
            revision: 1,
          },
        ],
      });
    });
  });
});
