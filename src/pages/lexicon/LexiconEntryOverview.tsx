import { PanelSection } from '../../components/ui/PanelSection';
import type { DmlexRelation } from '../../db/dmlexTypes';
import { t, useLocale } from '../../i18n';
import type { LexemeEntryDoc } from '../../types/jieyuDbDocTypes';
import { homographPartnerId } from '../../utils/dmlexEntry';

function OverviewField({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd {...(testId ? { 'data-testid': testId } : {})}>{value}</dd>
    </div>
  );
}

export function LexiconEntryOverview({
  lexeme,
  relations = [],
}: {
  lexeme: LexemeEntryDoc;
  relations?: readonly DmlexRelation[];
}) {
  const locale = useLocale();
  const notSet = t(locale, 'workspace.lexicon.notSet');
  const entry = lexeme.entry;
  const pronunciation = entry.pronunciations?.[0]?.transcriptions?.[0]?.text ?? '';
  const etymon = entry.etymologies?.[0]?.etymons?.[0]?.etymonUnits?.[0];
  const etymology = etymon ? [etymon.text, etymon.langCode].filter(Boolean).join(' · ') : '';
  const note = lexeme.jieyu?.notes?.find((row) => row.owner === 'entry' && row.ref === lexeme.id);
  return (
    <PanelSection
      className="lexicon-workspace-detail-panel"
      title={t(locale, 'workspace.lexicon.overviewTitle')}
      description={t(locale, 'workspace.lexicon.overviewDescription')}
    >
      <dl className="lexicon-workspace-detail-grid">
        <OverviewField
          label={t(locale, 'workspace.lexicon.edit.partsOfSpeechLabel')}
          value={(entry.partsOfSpeech ?? []).join(', ') || notSet}
          testId="lexicon-workspace-parts-of-speech"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.pronunciationLabel')}
          value={pronunciation || notSet}
          testId="lexicon-workspace-pronunciation"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.edit.etymonLabel')}
          value={etymology || notSet}
          testId="lexicon-workspace-etymology"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.edit.inflectedFormLabel')}
          value={(entry.inflectedForms ?? []).map((form) => form.text).join(', ') || notSet}
          testId="lexicon-workspace-inflected-forms"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.edit.labelsLabel')}
          value={(entry.labels ?? []).join(', ') || notSet}
          testId="lexicon-workspace-labels"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.edit.homographLinkLabel')}
          value={homographPartnerId(lexeme.id, relations) || notSet}
          testId="lexicon-workspace-homograph"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.edit.noteLabel')}
          value={note?.text || notSet}
          testId="lexicon-workspace-note"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.usageCountLabel')}
          value={String(lexeme.usageCount ?? 0)}
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.updatedAtLabel')}
          value={lexeme.updatedAt}
        />
      </dl>
    </PanelSection>
  );
}
