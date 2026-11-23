import { TimelineTranslationAudioControls } from '../components/TimelineTranslationAudioControls';
import { tf, useLocale } from '../i18n';
import { currentClipIndex, OralClipList } from './OralClipList';
import { pauseOralAudios } from './oralPlayback';
import type { useDesktopTranscriptionOralController } from './useDesktopTranscriptionOralController';

type Oral = ReturnType<typeof useDesktopTranscriptionOralController>;

/** The record / play / delete controls for one oral cell. */
export function DesktopTranscriptionOralTools(props: {
  oral: Oral;
  layerId: string;
  unitId: string;
  playing: boolean;
  togglePlayback: () => void;
}) {
  const { oral, layerId, unitId } = props;
  const locale = useLocale();
  const clips = oral.clips(layerId, unitId);
  const currentId = oral.currentId(layerId, unitId);
  const index = currentClipIndex(clips, currentId);
  const live = oral.isRecording(layerId, unitId) || oral.isArming(layerId, unitId);
  return (
    <TimelineTranslationAudioControls
      compact
      showRecord={clips.length === 0 || live}
      wholeSeconds={clips.length > 1}
      leading={
        clips.length < 2 ? null : (
          <span className="timeline-translation-audio-status">
            {tf(locale, 'app.desktopTranscription.clipIndex', { index: String(index + 1) })}
          </span>
        )
      }
      trailing={
        <OralClipList
          locale={locale}
          clips={clips}
          currentId={currentId}
          onPick={(id) => oral.pick(layerId, unitId, id)}
        />
      }
      audioSrc={oral.src(layerId, unitId)}
      isRecording={oral.isRecording(layerId, unitId)}
      isArming={oral.isArming(layerId, unitId)}
      isSaving={oral.isSaving(layerId, unitId)}
      isFailed={oral.isFailed(layerId, unitId)}
      elapsed={oral.elapsed}
      takePaused={oral.paused}
      level={oral.level}
      disabled={
        (oral.micBusy || oral.saveLocked) &&
        !oral.isRecording(layerId, unitId) &&
        !oral.isArming(layerId, unitId) &&
        !oral.isSaving(layerId, unitId) &&
        !oral.isFailed(layerId, unitId)
      }
      onStartRecording={() => {
        if (props.playing) props.togglePlayback();
        pauseOralAudios();
        void oral.start(layerId, unitId);
      }}
      onRetrySave={() => oral.retry()}
      onDiscardSave={() => oral.discardSave()}
      onStopRecording={oral.stop}
      onDeleteRecording={() => void oral.remove(layerId, unitId)}
      onTranscribeRecording={() => oral.transcribe(layerId, unitId)}
    />
  );
}
