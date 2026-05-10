import type { AcousticFeatureResult } from '../utils/acousticOverlayTypes';

export function buildVowelSpacePointsFromAcousticDetail(
  acousticDetail: Pick<AcousticFeatureResult, 'frames'> | null | undefined,
): Array<{ x: number; y: number; f1Hz: number; f2Hz: number }> {
  if (!acousticDetail) return [];

  const points = acousticDetail.frames
    .filter(
      (frame) =>
        typeof frame.formantF1Hz === 'number' &&
        Number.isFinite(frame.formantF1Hz) &&
        typeof frame.formantF2Hz === 'number' &&
        Number.isFinite(frame.formantF2Hz),
    )
    .map((frame) => ({
      f1Hz: frame.formantF1Hz as number,
      f2Hz: frame.formantF2Hz as number,
    }));

  if (points.length === 0) return [];

  const f1Min = Math.min(...points.map((point) => point.f1Hz));
  const f1Max = Math.max(...points.map((point) => point.f1Hz));
  const f2Min = Math.min(...points.map((point) => point.f2Hz));
  const f2Max = Math.max(...points.map((point) => point.f2Hz));

  return points.slice(-48).map((point) => ({
    ...point,
    x: 6 + (1 - (f2Max - f2Min < 1 ? 0.5 : (point.f2Hz - f2Min) / (f2Max - f2Min))) * 108,
    y: 6 + (f1Max - f1Min < 1 ? 0.5 : (point.f1Hz - f1Min) / (f1Max - f1Min)) * 46,
  }));
}
