import { describe, expect, it, vi } from 'vitest';
import { createCloudSyncedWriteActions } from './createCloudSyncedWriteActions';

describe('createCloudSyncedWriteActions selfCertainty (#365)', () => {
  it('清除时 payload.value 为 null，JSON 往返后仍可识别清除 | clear uses null so JSON keeps the field', async () => {
    const enqueueMutation = vi.fn();
    const rememberLocalShadowMutation = vi.fn();
    const saveUnitSelfCertainty = vi.fn(async () => undefined);
    const actions = createCloudSyncedWriteActions({
      wrappedActionsRef: {
        current: {
          saveUnitText: vi.fn(async () => undefined),
          saveUnitSelfCertainty,
          saveUnitLayerFields: vi.fn(async () => undefined),
          saveUnitTiming: vi.fn(async () => undefined),
          saveUnitLayerText: vi.fn(async () => undefined),
          createUnitFromSelection: vi.fn(async () => undefined),
          deleteUnit: vi.fn(async () => undefined),
          deleteSelectedUnits: vi.fn(async () => undefined),
          createLayer: vi.fn(async () => false),
          deleteLayer: vi.fn(async () => undefined),
          toggleLayerLink: vi.fn(async () => undefined),
        },
      },
      enqueueMutation,
      rememberLocalShadowMutation,
      unitsRef: { current: [{ id: 'u-1' }] },
      layersRef: { current: [] },
      layerLinksRef: { current: [] },
    });

    await actions.saveUnitSelfCertainty(['u-1'], undefined);

    expect(saveUnitSelfCertainty).toHaveBeenCalledWith(['u-1'], undefined);
    const enqueued = enqueueMutation.mock.calls[0]?.[0] as {
      payload: Record<string, unknown>;
    };
    expect(enqueued.payload).toEqual({
      action: 'self-certainty',
      unitIds: ['u-1'],
      value: null,
    });
    const roundTrip = JSON.parse(JSON.stringify(enqueued.payload)) as Record<string, unknown>;
    expect(roundTrip).toEqual({
      action: 'self-certainty',
      unitIds: ['u-1'],
      value: null,
    });
    // 对照：旧的 undefined 会被 JSON 丢掉 | Contrast: legacy undefined is stripped by JSON
    expect(
      Object.prototype.hasOwnProperty.call(
        JSON.parse(JSON.stringify({ action: 'self-certainty', unitIds: ['u-1'], value: undefined })),
        'value',
      ),
    ).toBe(false);
  });
});
