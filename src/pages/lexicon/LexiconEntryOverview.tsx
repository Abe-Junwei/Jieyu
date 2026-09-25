import { PanelSection } from '../../components/ui/PanelSection';
import { t, useLocale } from '../../i18n';
import type { LexemeDocType } from '../../types/jieyuDbDocTypes';

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

function etymologyText(lexeme: LexemeDocType, notSet: string): string {
  if (!lexeme.etymology) return notSet;
  return [lexeme.etymology.form, lexeme.etymology.gloss, lexeme.etymology.sourceLanguage]
    .filter((part) => (part ?? '').length > 0)
    .join(' · ');
}

export function LexiconEntryOverview({ lexeme }: { lexeme: LexemeDocType }) {
  const locale = useLocale();
  const notSet = t(locale, 'workspace.lexicon.notSet');
  return (
    <PanelSection
      className="lexicon-workspace-detail-panel"
      title={t(locale, 'workspace.lexicon.overviewTitle')}
      description={t(locale, 'workspace.lexicon.overviewDescription')}
    >
      <dl className="lexicon-workspace-detail-grid">
        <OverviewField
          label={t(locale, 'workspace.lexicon.languageLabel')}
          value={lexeme.language ?? notSet}
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.citationLabel')}
          value={lexeme.citationForm ?? notSet}
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.pronunciationLabel')}
          value={lexeme.pronunciation ?? notSet}
          testId="lexicon-workspace-pronunciation"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.etymologyLabel')}
          value={etymologyText(lexeme, notSet)}
          testId="lexicon-workspace-etymology"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.literalMeaningLabel')}
          value={lexeme.literalMeaning ?? notSet}
          testId="lexicon-workspace-literal-meaning"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.bibliographyLabel')}
          value={lexeme.bibliography ?? notSet}
          testId="lexicon-workspace-bibliography"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.restrictionsLabel')}
          value={lexeme.restrictions ?? notSet}
          testId="lexicon-workspace-restrictions"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.summaryDefinitionLabel')}
          value={lexeme.summaryDefinition ?? notSet}
          testId="lexicon-workspace-summary-definition"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.lexemeTypeLabel')}
          value={lexeme.lexemeType ?? notSet}
          testId="lexicon-workspace-lexeme-type"
        />
        <OverviewField
          label={t(locale, 'workspace.lexicon.morphemeTypeLabel')}
          value={lexeme.morphemeType ?? notSet}
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
