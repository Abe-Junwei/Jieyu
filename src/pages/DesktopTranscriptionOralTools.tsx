import { useState } from 'react';
import { TimelineTranslationAudioControls } from '../components/TimelineTranslationAudioControls';
import { useLocale } from '../i18n';
import { TEXT_AUDIO_CAP } from '../utils/textAudioCap';
import { currentClipIndex, OralClipList } from './OralClipList';
import { pauseOralAudios } from './oralPlayback';
import { TranscriptionTargetDialog } from './TranscriptionTargetDialog';
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
  const [ask, setAsk] = useState(false);
  const clips = oral.clips(layerId, unitId);
  const currentId = oral.currentId(layerId, unitId);
  const index = currentClipIndex(clips, currentId);
  const live = oral.isRecording(layerId, unitId) || oral.isArming(layerId, unitId);
  const mine = live || oral.isSaving(layerId, unitId) || oral.isFailed(layerId, unitId);
  const capped = !mine && clips.length >= TEXT_AUDIO_CAP;
  const showRecord = mine ? live : !oral.micBusy && !oral.saveLocked;
  return (
    <>
      <TimelineTranslationAudioControls
        compact
        clipRow
        showRecord={showRecord}
        recordCapped={capped}
        clipCount={clips.length}
        clipNumber={index + 1}
        clips={clips}
        onPickClip={(id) => oral.pick(layerId, unitId, id)}
        trailing={
          mine ? null : (
            <OralClipList
              locale={locale}
              clips={clips}
              currentId={currentId}
              onPick={(id) => oral.pick(layerId, unitId, id)}
            />
          )
        }
        audioSrc={oral.src(layerId, unitId)}
        isRecording={oral.isRecording(layerId, unitId)}
        isArming={oral.isArming(layerId, unitId)}
        isSaving={oral.isSaving(layerId, unitId)}
        isFailed={oral.isFailed(layerId, unitId)}
        elapsed={oral.elapsed}
        takePaused={oral.paused}
        level={oral.level}
        onStartRecording={() => {
          if (props.playing) props.togglePlayback();
          pauseOralAudios();
          void oral.start(layerId, unitId);
        }}
        onRetrySave={() => oral.retry()}
        onDiscardSave={() => oral.discardSave()}
        onStopRecording={oral.stop}
        onPauseRecording={oral.pause}
        onResumeRecording={oral.resume}
        onDeleteRecording={() => void oral.remove(layerId, unitId)}
        onTranscribeRecording={() => setAsk(true)}
      />
      {ask ? (
        <TranscriptionTargetDialog
          layerId={layerId}
          unitId={unitId}
          onClose={() => setAsk(false)}
          listTargets={oral.listTargets}
          plan={oral.planTranscription}
          createLayer={oral.createTranslationLayer}
          transcribe={oral.transcribe}
        />
      ) : null}
    </>
  );
}
