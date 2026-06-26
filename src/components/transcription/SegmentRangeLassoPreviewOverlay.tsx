import { tf, type Locale } from '../../i18n';
import type {
  SegmentRangeGesturePreviewReadModel,
  TierLassoPreviewRect,
} from '../../utils/segmentRangeGesturePreviewReadModel';
import { waveLassoOverlayFromSegmentRangeGesturePreview } from '../../utils/segmentRangeGesturePreviewReadModel';

type WaveLassoOverlay = NonNullable<
  ReturnType<typeof waveLassoOverlayFromSegmentRangeGesturePreview>
>;

export function TierLassoPreviewOverlay(props: { rect: TierLassoPreviewRect }) {
  const { rect } = props;
  return (
    <svg className="timeline-lasso-overlay" aria-hidden="true">
      <rect
        className="timeline-lasso-rect"
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={2}
        ry={2}
      />
    </svg>
  );
}

export function WaveLassoPreviewOverlay(props: { overlay: WaveLassoOverlay; locale: Locale }) {
  const { overlay, locale } = props;
  return (
    <svg className="wave-lasso-overlay" aria-hidden="true">
      <rect
        className={`wave-lasso-rect ${overlay.mode === 'create' ? 'wave-lasso-rect-create' : 'wave-lasso-rect-select'}`}
        x={overlay.x}
        y={overlay.y}
        width={Math.max(2, overlay.w)}
        height={Math.max(2, overlay.h)}
        rx={overlay.mode === 'create' ? 0 : 2}
        ry={overlay.mode === 'create' ? 0 : 2}
      />
      {overlay.mode === 'select' ? (
        <foreignObject x={overlay.x + 8} y={overlay.y + 8} width={172} height={28}>
          <div className="wave-lasso-hint">
            {tf(locale, 'transcription.wave.selectionHint', { count: overlay.hintCount })}
          </div>
        </foreignObject>
      ) : null}
    </svg>
  );
}

/** 阶段 D：tier / wave 套索预览统一渲染入口（读模型 surface 分支）。 */
export function SegmentRangeLassoPreviewOverlay(props: {
  model: SegmentRangeGesturePreviewReadModel;
  surface: 'tier' | 'wave';
  locale: Locale;
}) {
  const { model, surface, locale } = props;
  if (surface === 'tier') {
    if (model.surface !== 'tier') return null;
    return <TierLassoPreviewOverlay rect={model.rect} />;
  }
  const overlay = waveLassoOverlayFromSegmentRangeGesturePreview(model);
  if (!overlay) return null;
  return <WaveLassoPreviewOverlay overlay={overlay} locale={locale} />;
}
