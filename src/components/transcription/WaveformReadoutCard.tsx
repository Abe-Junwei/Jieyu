import type { FC } from 'react';
import { t, useLocale } from '../../i18n';

export interface WaveformReadoutCardData {
  source: 'waveform' | 'spectrogram';
  timeSec: number;
  frequencyHz?: number | null;
  f0Hz?: number | null;
  intensityDb?: number | null;
}

interface WaveformReadoutCardProps {
  readout: WaveformReadoutCardData | null;
  formatTime: (seconds: number) => string;
}

export const WaveformReadoutCard: FC<WaveformReadoutCardProps> = ({ readout, formatTime }) => {
  const locale = useLocale();

  if (!readout) return null;

  return (
    <div className="transcription-wave-corner-readout">
      <span>{t(locale, 'transcription.wave.spectrogram.readout.time')} {formatTime(readout.timeSec)}</span>
      {readout.source === 'spectrogram' ? (
        <span>{t(locale, 'transcription.wave.spectrogram.readout.frequency')} {readout.frequencyHz != null ? `${Math.round(readout.frequencyHz)} Hz` : '—'}</span>
      ) : null}
      <span>{t(locale, 'transcription.wave.acoustic.f0')} {readout.f0Hz != null ? `${Math.round(readout.f0Hz)} Hz` : '—'}</span>
      <span>{t(locale, 'transcription.wave.spectrogram.readout.intensity')} {readout.intensityDb != null ? `${readout.intensityDb.toFixed(1)} dB` : '—'}</span>
    </div>
  );
};