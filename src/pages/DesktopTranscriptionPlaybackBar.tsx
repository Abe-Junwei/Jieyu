import type { CSSProperties } from 'react';
import { featureFlags } from '../ai/config/featureFlags';
import { IconTipButton } from '../components/ui/IconTip';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { t, tf, type Locale } from '../i18n';
import { JIEYU_ICON_INLINE, JIEYU_ICON_WAVE, JIEYU_ICON_WAVE_PLAY } from '../utils/jieyuIcon';
import { DesktopRateControl, DesktopViewControls } from './DesktopTranscriptionWorkspaceControls';
import type { useDesktopLayerView } from './useDesktopLayerView';
import type { useDesktopTranscriptionMediaController } from './useDesktopTranscriptionMediaController';
import type { useDesktopTranscriptionRetimeController } from './useDesktopTranscriptionRetimeController';

type Playback = ReturnType<typeof useDesktopTranscriptionMediaController>;
type LayerView = ReturnType<typeof useDesktopLayerView>;
type Retime = ReturnType<typeof useDesktopTranscriptionRetimeController>;

export function DesktopTranscriptionPlaybackBar(props: {
  locale: Locale;
  playback: Playback;
  layerView: LayerView;
  retime: Retime;
  hasTimedUnits: boolean;
  readout: React.ReactNode;
}) {
  const { locale, playback, layerView } = props;
  return (
    <div className="desktop-tx-bar" data-testid="desktop-playback-bar">
      <IconTipButton
        className="desktop-tx-play"
        disabled={!playback.isReady}
        label={t(
          locale,
          playback.isPlaying
            ? 'transcription.wave.toolbar.pause'
            : 'transcription.wave.toolbar.play',
        )}
        onClick={playback.togglePlayback}
      >
        <JieyuIcon
          name={playback.isPlaying ? 'Pause' : 'Play'}
          aria-hidden
          className={JIEYU_ICON_WAVE_PLAY}
        />
      </IconTipButton>
      <IconTipButton
        className="desktop-tx-icon"
        label={t(locale, 'transcription.wave.toolbar.rewind10')}
        onClick={() => playback.seekBySeconds(-10)}
      >
        <JieyuIcon name="SkipBack" aria-hidden className={JIEYU_ICON_WAVE} />
      </IconTipButton>
      <IconTipButton
        className="desktop-tx-icon"
        label={t(locale, 'transcription.wave.toolbar.forward10')}
        onClick={() => playback.seekBySeconds(10)}
      >
        <JieyuIcon name="SkipForward" aria-hidden className={JIEYU_ICON_WAVE} />
      </IconTipButton>
      <DesktopRateControl
        locale={locale}
        rate={playback.playbackRate}
        onChange={playback.setPlaybackRate}
      />
      <IconTipButton
        className="desktop-tx-icon"
        aria-pressed={playback.loop}
        label={t(
          locale,
          playback.loop
            ? 'transcription.wave.toolbar.globalLoopOff'
            : 'transcription.wave.toolbar.globalLoopOn',
        )}
        onClick={() => playback.setLoop(!playback.loop)}
      >
        <JieyuIcon name="Repeat" aria-hidden className={JIEYU_ICON_WAVE} />
      </IconTipButton>
      <label className="desktop-tx-volume">
        <JieyuIcon name="Volume2" aria-hidden className={JIEYU_ICON_WAVE} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={playback.volume}
          style={{ '--volume-fill': `${playback.volume * 100}%` } as CSSProperties}
          aria-label={tf(locale, 'transcription.voiceWidget.signal.volume', {
            percent: Math.round(playback.volume * 100),
          })}
          onChange={(event) => playback.setVolume(Number(event.target.value))}
        />
      </label>
      {props.readout}
      <DesktopViewControls
        locale={locale}
        mode={playback.waveformDisplayMode}
        onChange={playback.setWaveformDisplayMode}
      />
      <IconTipButton
        className="desktop-tx-icon desktop-tx-compact"
        aria-pressed={layerView.compact}
        label={t(
          locale,
          layerView.compact
            ? 'app.desktopTranscription.compactOff'
            : 'app.desktopTranscription.compactOn',
        )}
        onClick={layerView.toggleCompact}
      >
        <JieyuIcon name="Rows3" aria-hidden className={JIEYU_ICON_INLINE} />
      </IconTipButton>
      {featureFlags.desktopTranscriptionBatchEditingEnabled && props.hasTimedUnits ? (
        <button
          type="button"
          className="desktop-tx-bar__retime"
          data-testid="desktop-tx-retime-audio"
          onClick={() => props.retime.ask()}
        >
          {t(locale, 'app.desktopTranscription.retimeOpen')}
        </button>
      ) : null}
    </div>
  );
}
