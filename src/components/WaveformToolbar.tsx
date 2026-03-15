import type { ReactNode } from 'react';
import { FastForward, Pause, Play, Repeat, Rewind, Volume2, Waves } from 'lucide-react';

interface WaveformToolbarProps {
  filename: string;
  isReady: boolean;
  isPlaying: boolean;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  onTogglePlayback: () => void;
  onSeek: (delta: number) => void;
  children?: ReactNode;
}

export function WaveformToolbar({
  filename,
  isReady,
  isPlaying,
  playbackRate,
  onPlaybackRateChange,
  volume,
  onVolumeChange,
  loop,
  onLoopChange,
  onTogglePlayback,
  onSeek,
  children,
}: WaveformToolbarProps) {
  return (
    <div className="transcription-wave-toolbar">
      <div className="transcription-wave-toolbar-left">
        <div className="transcription-file-brand">
          <span className="transcription-file-icon"><Waves size={14} /></span>
          <strong>{filename}</strong>
        </div>
        <span className="transcription-sync-chip">Synced</span>
        <span className="transcription-toolbar-sep" />
        <button className="icon-btn" onClick={() => onSeek(-10)} title="后退 10 秒">
          <Rewind size={16} />
        </button>
        <button className="play-btn" onClick={onTogglePlayback} disabled={!isReady}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="icon-btn" onClick={() => onSeek(10)} title="前进 10 秒">
          <FastForward size={16} />
        </button>
        <select
          className="speed-select"
          value={String(playbackRate)}
          onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1.0x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2.0x</option>
        </select>
        <button
          className={`icon-btn ${loop ? 'icon-btn-active' : ''}`}
          onClick={() => onLoopChange(!loop)}
          title={loop ? '关闭全局循环播放' : '开启全局循环播放'}
        >
          <Repeat size={15} />
        </button>
      </div>
      <div className="transcription-wave-toolbar-right">
        <label className="player-control volume-control compact-volume">
          <Volume2 size={15} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
        </label>
        {children}
      </div>
    </div>
  );
}
