import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, t } from '../i18n';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { isKnownIso639_3Code } from '../utils/langMapping';
import {
  buildLanguageInputSeed,
  normalizeLanguageInputCode,
} from '../utils/languageInputHostState';
import {
  normalizeProjectLanguageIds,
  readProjectLanguageLists,
} from '../utils/projectLanguageLists';
import { getActiveProjectTextId } from '../utils/transcriptionUrlDeepLink';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import { FormField, ModalPanel, PanelButton, PanelFeedback } from './ui';

const EDIT_EVENT = 'jieyu:project-languages-edit';

export function openProjectLanguageListsEditor(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EDIT_EVENT));
}

function languageCodes(inputs: readonly LanguageIsoInputValue[]): {
  codes: string[];
  invalid: boolean;
} {
  const codes: string[] = [];
  let invalid = false;
  for (const input of inputs) {
    const code = normalizeLanguageInputCode(input);
    if (code.length === 0) continue;
    if (!isKnownIso639_3Code(code)) invalid = true;
    else codes.push(code);
  }
  return { codes, invalid };
}

export function ProjectLanguageListsEditorHost() {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [textId, setTextId] = useState('');
  const [primaryTitle, setPrimaryTitle] = useState('');
  const [englishTitle, setEnglishTitle] = useState('');
  const [objectInputs, setObjectInputs] = useState<LanguageIsoInputValue[]>([
    { languageName: '', languageCode: '' },
  ]);
  const [workingInputs, setWorkingInputs] = useState<LanguageIsoInputValue[]>([
    { languageName: '', languageCode: '' },
  ]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      const id = getActiveProjectTextId();
      setTextId(id);
      setError('');
      setLoaded(false);
      setOpen(true);
      if (id.length === 0) {
        setLoaded(true);
        return;
      }
      void LinguisticService.timeline.getTextById(id).then((text) => {
        const lists = readProjectLanguageLists(text?.metadata);
        setPrimaryTitle(text?.title.und?.trim() ?? '');
        setEnglishTitle(text?.title.eng?.trim() ?? '');
        setObjectInputs(
          lists.objectLanguageIds.length > 0
            ? lists.objectLanguageIds.map((languageId) =>
                buildLanguageInputSeed(languageId, locale),
              )
            : [{ languageName: '', languageCode: '' }],
        );
        setWorkingInputs(
          lists.workingLanguageIds.length > 0
            ? lists.workingLanguageIds.map((languageId) =>
                buildLanguageInputSeed(languageId, locale),
              )
            : [{ languageName: '', languageCode: '' }],
        );
        setLoaded(true);
      });
    };
    window.addEventListener(EDIT_EVENT, onOpen);
    return () => window.removeEventListener(EDIT_EVENT, onOpen);
  }, [locale]);

  if (!open) return null;

  const emptyInput = { languageName: '', languageCode: '' };

  return (
    <ModalPanel
      isOpen
      title={t(locale, 'msg.projectSetup.editLanguagesTitle')}
      onClose={() => setOpen(false)}
      closeLabel={t(locale, 'msg.projectSetup.close')}
      footer={
        loaded && textId.length > 0 ? (
          <>
            <PanelButton variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {t(locale, 'msg.projectSetup.cancel')}
            </PanelButton>
            <PanelButton
              variant="primary"
              disabled={saving}
              onClick={() => {
                const objectLanguages = languageCodes(objectInputs);
                const workingLanguages = languageCodes(workingInputs);
                if (objectLanguages.invalid || workingLanguages.invalid) {
                  setError(t(locale, 'msg.projectSetup.invalidLanguageCode'));
                  return;
                }
                if (primaryTitle.trim().length === 0) return;
                if (objectLanguages.codes.length === 0) {
                  setError(t(locale, 'msg.projectSetup.objectLanguageRequired'));
                  return;
                }
                setSaving(true);
                void LinguisticService.timeline
                  .updateProjectLanguageLists({
                    textId,
                    primaryTitle: primaryTitle.trim(),
                    englishFallbackTitle: englishTitle.trim(),
                    objectLanguageIds: normalizeProjectLanguageIds(objectLanguages.codes),
                    workingLanguageIds: normalizeProjectLanguageIds(workingLanguages.codes),
                  })
                  .then(() => {
                    void queryClient.invalidateQueries({
                      queryKey: ['project-language-lists', textId],
                    });
                    void queryClient.invalidateQueries({ queryKey: ['annotation-workspace'] });
                  })
                  .then(() => setOpen(false))
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : t(locale, 'msg.projectSetup.createFailed'),
                    );
                  })
                  .finally(() => setSaving(false));
              }}
            >
              {t(locale, 'msg.projectSetup.saveLanguages')}
            </PanelButton>
          </>
        ) : null
      }
    >
      {!loaded ? null : textId.length === 0 ? (
        <PanelFeedback level="error">
          {t(locale, 'msg.projectSetup.objectLanguageRequired')}
        </PanelFeedback>
      ) : (
        <>
          <FormField label={t(locale, 'msg.projectSetup.titleZhLabel')}>
            <input
              className="input panel-input"
              type="text"
              value={primaryTitle}
              onChange={(event) => setPrimaryTitle(event.target.value)}
            />
          </FormField>
          <FormField label={t(locale, 'msg.projectSetup.titleEnLabel')}>
            <input
              className="input panel-input"
              type="text"
              value={englishTitle}
              onChange={(event) => setEnglishTitle(event.target.value)}
            />
          </FormField>
          <div className="dialog-field">
            {objectInputs.map((input, index) => (
              <LanguageIsoInput
                key={`object-${index}`}
                locale={locale}
                value={input}
                onChange={(nextValue) =>
                  setObjectInputs((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? nextValue : item)),
                  )
                }
                searchScope="language"
                nameLabel={t(locale, 'msg.projectSetup.languageLabel')}
                codeLabel={t(locale, 'msg.projectSetup.languageCodeLabel')}
                namePlaceholder={t(locale, 'msg.projectSetup.languagePlaceholder')}
                codePlaceholder={t(locale, 'msg.projectSetup.languageCodePlaceholder')}
              />
            ))}
            <PanelButton
              type="button"
              variant="ghost"
              onClick={() => setObjectInputs((current) => [...current, emptyInput])}
            >
              {t(locale, 'msg.projectSetup.addObjectLanguage')}
            </PanelButton>
          </div>
          <div className="dialog-field">
            {workingInputs.map((input, index) => (
              <LanguageIsoInput
                key={`working-${index}`}
                locale={locale}
                value={input}
                onChange={(nextValue) =>
                  setWorkingInputs((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? nextValue : item)),
                  )
                }
                searchScope="language"
                nameLabel={t(locale, 'msg.projectSetup.workingLanguagesLabel')}
                codeLabel={t(locale, 'msg.projectSetup.languageCodeLabel')}
                namePlaceholder={t(locale, 'msg.projectSetup.languagePlaceholder')}
                codePlaceholder={t(locale, 'msg.projectSetup.languageCodePlaceholder')}
              />
            ))}
            <PanelButton
              type="button"
              variant="ghost"
              onClick={() => setWorkingInputs((current) => [...current, emptyInput])}
            >
              {t(locale, 'msg.projectSetup.addWorkingLanguage')}
            </PanelButton>
          </div>
          {error.length > 0 ? <PanelFeedback level="error">{error}</PanelFeedback> : null}
        </>
      )}
    </ModalPanel>
  );
}
