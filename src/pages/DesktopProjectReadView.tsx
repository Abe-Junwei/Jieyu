import { useRef } from 'react';

export interface DesktopProjectReadManuscript {
  id: string;
  title: Record<string, string>;
}

export interface DesktopProjectReadUnit {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export function DesktopProjectReadView(props: {
  manuscripts: readonly DesktopProjectReadManuscript[];
  manuscriptId: string | null;
  units: readonly DesktopProjectReadUnit[];
  audioUrl: string | null;
  emptyLabel: string;
  audioLabel: string;
  onSelectManuscript: (id: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  return (
    <div className="desktop-project-read">
      <div className="desktop-project-read-manuscripts">
        {props.manuscripts.map((manuscript) => (
          <button
            key={manuscript.id}
            type="button"
            aria-current={manuscript.id === props.manuscriptId ? 'true' : 'false'}
            onClick={() => props.onSelectManuscript(manuscript.id)}
          >
            {manuscriptLabel(manuscript.title, manuscript.id)}
          </button>
        ))}
      </div>
      {props.manuscripts.length === 0 ? <p>{props.emptyLabel}</p> : null}
      {props.audioUrl === null ? null : (
        <audio ref={audioRef} src={props.audioUrl} controls aria-label={props.audioLabel} />
      )}
      <div className="desktop-project-read-units">
        {props.units.map((unit) => (
          <button
            key={unit.id}
            type="button"
            onClick={() => {
              const audio = audioRef.current;
              if (audio === null) return;
              audio.currentTime = unit.startTime;
            }}
          >
            {`${unit.startTime.toFixed(1)}–${unit.endTime.toFixed(1)} ${unit.text}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function manuscriptLabel(title: Record<string, string>, id: string): string {
  const candidates = [title.zh, title['zh-CN'], title.und, ...Object.values(title)];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return id;
}
