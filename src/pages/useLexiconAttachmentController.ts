import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinguisticService, type LexemeAttachmentView } from '../app/languageAssetPageAccess';
import { t, useLocale, type DictKey } from '../i18n';

function mapAttachmentError(message: string): DictKey {
  if (message === 'UNSUPPORTED_TYPE') return 'workspace.lexicon.attachments.error.unsupportedType';
  if (message === 'TOO_LARGE') return 'workspace.lexicon.attachments.error.tooLarge';
  if (message === 'EMPTY') return 'workspace.lexicon.attachments.error.empty';
  if (message === 'NOT_FOUND') return 'workspace.lexicon.attachments.error.notFound';
  return 'workspace.lexicon.attachments.error.generic';
}

export function useLexiconAttachmentController(lexemeId: string) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [languageCode, setLanguageCode] = useState('');
  const [errorKey, setErrorKey] = useState<DictKey | null>(null);

  const attachmentsQuery = useQuery({
    queryKey: ['lexeme-attachments', lexemeId],
    queryFn: () => LinguisticService.lexemes.listAttachments(lexemeId),
    enabled: lexemeId.length > 0,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['lexeme-attachments', lexemeId] });
  }, [lexemeId, queryClient]);

  const attachFile = useCallback(
    async (file: File) => {
      setErrorKey(null);
      try {
        await LinguisticService.lexemes.attachFile(lexemeId, file, {
          displayName: file.name,
          ...(languageCode.trim() ? { languageCode: languageCode.trim() } : {}),
        });
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        setErrorKey(mapAttachmentError(message));
      }
    },
    [languageCode, lexemeId, refresh],
  );

  const unlinkAttachment = useCallback(
    async (linkId: string) => {
      setErrorKey(null);
      try {
        await LinguisticService.lexemes.unlinkAttachment(linkId);
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        setErrorKey(mapAttachmentError(message));
      }
    },
    [refresh],
  );

  return {
    attachments: (attachmentsQuery.data ?? []) as LexemeAttachmentView[],
    loading: attachmentsQuery.isLoading,
    languageCode,
    setLanguageCode,
    errorText: errorKey ? t(locale, errorKey) : '',
    attachFile,
    unlinkAttachment,
  };
}
