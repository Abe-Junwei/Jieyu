import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { LayerUnitDocType, NoteCategory } from '../../db';
import { t, useOptionalLocale } from '../../i18n';
import {
  listAnnotationUnitNotes,
  saveAnnotationUnitNote,
  saveAnnotationUnitTurn,
} from '../../pages/annotation/saveAnnotationUnitMeta';
import { reportActionError } from '../../utils/actionErrorReporter';

type TurnDraft = {
  addressee: string;
  ungrammatical: boolean;
  actualForm: string;
  targetForm: string;
};

function turnFromUnit(unit: LayerUnitDocType): TurnDraft {
  return {
    addressee: unit.addressee ?? '',
    ungrammatical: unit.ungrammatical === true,
    actualForm: unit.actualForm ?? '',
    targetForm: unit.targetForm ?? '',
  };
}

export function UnitRecordFields({ unit }: { unit: LayerUnitDocType }) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const queryClient = useQueryClient();
  const notesQuery = useQuery({
    queryKey: ['annotation-unit-note', unit.id],
    queryFn: () => listAnnotationUnitNotes(unit.id),
  });
  const { id, addressee, ungrammatical, actualForm, targetForm } = unit;
  const [turn, setTurn] = useState<TurnDraft>(() => turnFromUnit(unit));
  useEffect(() => {
    setTurn({
      addressee: addressee ?? '',
      ungrammatical: ungrammatical === true,
      actualForm: actualForm ?? '',
      targetForm: targetForm ?? '',
    });
  }, [id, addressee, ungrammatical, actualForm, targetForm]);
  const transcription = notesQuery.data?.find((note) => note.category === 'comment')?.content ?? '';
  const translation = notesQuery.data?.find((note) => note.category === 'topic')?.content ?? '';

  const saveNote = (category: NoteCategory, content: string, previous: string) => {
    if (content === previous) return;
    void saveAnnotationUnitNote({ unitId: unit.id, content, category })
      .then(() => queryClient.invalidateQueries({ queryKey: ['annotation-unit-note', unit.id] }))
      .catch((error: unknown) => {
        reportActionError({
          actionLabel: 'save-unit-layer-note',
          error,
          i18nKey: 'workspace.annotation.saveFailed',
        });
      });
  };

  const saveTurn = (next: TurnDraft) => {
    void saveAnnotationUnitTurn({ textId: unit.textId, unitId: unit.id, ...next }).catch(
      (error: unknown) => {
        reportActionError({
          actionLabel: 'save-unit-turn',
          error,
          i18nKey: 'workspace.annotation.saveFailed',
        });
      },
    );
  };

  return (
    <div className="note-popover-unit-record" data-testid={`transcription-unit-record-${unit.id}`}>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.transcriptionNote')}</span>
        <textarea
          key={`${unit.id}:comment:${transcription}`}
          className="panel-input"
          data-testid={`transcription-note-${unit.id}`}
          defaultValue={transcription}
          onBlur={(event) => saveNote('comment', event.target.value, transcription)}
        />
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.translationNote')}</span>
        <textarea
          key={`${unit.id}:topic:${translation}`}
          className="panel-input"
          data-testid={`translation-note-${unit.id}`}
          defaultValue={translation}
          onBlur={(event) => saveNote('topic', event.target.value, translation)}
        />
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.addressee')}</span>
        <input
          className="panel-input"
          data-testid={`transcription-addressee-${unit.id}`}
          value={turn.addressee}
          onChange={(event) =>
            setTurn((current) => ({ ...current, addressee: event.target.value }))
          }
          onBlur={() => saveTurn(turn)}
        />
      </label>
      <label className="annotation-document-tools-check">
        <input
          type="checkbox"
          data-testid={`transcription-ungrammatical-${unit.id}`}
          checked={turn.ungrammatical}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const next = { ...turn, ungrammatical: event.target.checked };
            setTurn(next);
            saveTurn(next);
          }}
        />
        {t(locale, 'workspace.annotation.ungrammatical')}
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.actualForm')}</span>
        <input
          className="panel-input"
          data-testid={`transcription-actual-form-${unit.id}`}
          value={turn.actualForm}
          onChange={(event) =>
            setTurn((current) => ({ ...current, actualForm: event.target.value }))
          }
          onBlur={() => saveTurn(turn)}
        />
      </label>
      <label className="annotation-igt-extra-field">
        <span>{t(locale, 'workspace.annotation.targetForm')}</span>
        <input
          className="panel-input"
          data-testid={`transcription-target-form-${unit.id}`}
          value={turn.targetForm}
          onChange={(event) =>
            setTurn((current) => ({ ...current, targetForm: event.target.value }))
          }
          onBlur={() => saveTurn(turn)}
        />
      </label>
    </div>
  );
}
