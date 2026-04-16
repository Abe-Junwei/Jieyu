/**
 * WaveformHoverTooltip | 波形悬停气泡
 *
 * 在鼠标悬停位置显示时间戳，并通过二分查找匹配当前语段文本预览
 * Shows timestamp at hover position and previews the unit text via binary search
 */

import type { CSSProperties, FC } from 'react';
import type { LayerUnitDocType } from '../../db';

export interface WaveformHoverTooltipProps {
  time: number;
  x: number;
  y: number;
  units: LayerUnitDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType) => string | null | undefined;
  formatTime: (seconds: number) => string;
  previewDir?: 'ltr' | 'rtl';
  previewStyle?: CSSProperties;
}

export const WaveformHoverTooltip: FC<WaveformHoverTooltipProps> = ({
  time,
  x,
  y,
  units,
  getUnitTextForLayer,
  formatTime,
  previewDir,
  previewStyle,
}) => {
  // 二分查找当前时间命中的语段 | Binary search for unit at hover time
  let lo = 0, hi = units.length - 1;
  let hit: typeof units[0] | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const m = units[mid];
    if (!m) break;
    if (time < m.startTime) { hi = mid - 1; }
    else if (time > m.endTime) { lo = mid + 1; }
    else { hit = m; break; }
  }

  let textPreview: string | null = null;
  if (hit) {
    const text = getUnitTextForLayer(hit);
    if (text) {
      textPreview = text.length > 28 ? text.slice(0, 28) + '…' : text;
    }
  }

  return (
    <div className="waveform-hover-tooltip" style={{ left: x, top: y }}>
      {formatTime(time)}
      {textPreview && (
        <span className="waveform-hover-tooltip-text" dir={previewDir} style={previewStyle}>
          {textPreview}
        </span>
      )}
    </div>
  );
};
