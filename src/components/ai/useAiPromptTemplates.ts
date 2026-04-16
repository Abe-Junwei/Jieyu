import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { AiAdaptiveInputProfile } from '../../ai/chat/chatDomain.types';
import { useLocale } from '../../i18n';
import { getAiChatQuickPromptTemplates } from '../../i18n/aiChatQuickPromptTemplates';
import { interpolatePromptTemplate, loadPromptTemplatesFromStorage, newTemplateId, PROMPT_TEMPLATES_STORAGE_KEY, type PromptTemplateItem } from './aiChatCardUtils';
import { rankPromptTemplatesByAdaptiveProfile } from './aiChatAdaptiveRanking';

interface UseAiPromptTemplatesOptions {
  promptVars: Record<string, string>;
  onInjectRenderedPrompt: (rendered: string) => void;
  onEditTemplate?: () => void;
  adaptiveInputProfile?: AiAdaptiveInputProfile;
}

interface UseAiPromptTemplatesReturn {
  quickPromptTemplates: PromptTemplateItem[];
  promptTemplates: PromptTemplateItem[];
  editingTemplateId: string | null;
  templateTitleInput: string;
  templateContentInput: string;
  setTemplateTitleInput: Dispatch<SetStateAction<string>>;
  setTemplateContentInput: Dispatch<SetStateAction<string>>;
  savePromptTemplate: () => void;
  editPromptTemplate: (item: PromptTemplateItem) => void;
  removePromptTemplate: (id: string) => void;
  injectPromptTemplate: (content: string) => void;
  appendPromptVariable: (name: string) => void;
}

export function useAiPromptTemplates({
  promptVars,
  onInjectRenderedPrompt,
  onEditTemplate,
  adaptiveInputProfile,
}: UseAiPromptTemplatesOptions): UseAiPromptTemplatesReturn {
  const locale = useLocale();
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>(() => loadPromptTemplatesFromStorage());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitleInput, setTemplateTitleInput] = useState('');
  const [templateContentInput, setTemplateContentInput] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(promptTemplates));
  }, [promptTemplates]);

  const savePromptTemplate = (): void => {
    const title = templateTitleInput.trim();
    const content = templateContentInput.trim();
    if (!title || !content) return;

    const now = new Date().toISOString();
    if (editingTemplateId) {
      setPromptTemplates((prev) => prev
        .map((item) => (item.id === editingTemplateId
          ? { ...item, title, content, updatedAt: now }
          : item
        ))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } else {
      const next: PromptTemplateItem = {
        id: newTemplateId(),
        title,
        content,
        createdAt: now,
        updatedAt: now,
      };
      setPromptTemplates((prev) => [next, ...prev]);
    }

    setEditingTemplateId(null);
    setTemplateTitleInput('');
    setTemplateContentInput('');
  };

  const editPromptTemplate = (item: PromptTemplateItem): void => {
    setEditingTemplateId(item.id);
    setTemplateTitleInput(item.title);
    setTemplateContentInput(item.content);
    onEditTemplate?.();
  };

  const removePromptTemplate = (id: string): void => {
    setPromptTemplates((prev) => prev.filter((item) => item.id !== id));
    if (editingTemplateId === id) {
      setEditingTemplateId(null);
      setTemplateTitleInput('');
      setTemplateContentInput('');
    }
  };

  const injectPromptTemplate = (content: string): void => {
    const rendered = interpolatePromptTemplate(content, promptVars).trim();
    if (!rendered) return;
    onInjectRenderedPrompt(rendered);
  };

  const appendPromptVariable = (name: string): void => {
    const token = `{{${name}}}`;
    setTemplateContentInput((prev) => `${prev}${prev.endsWith(' ') || prev.length === 0 ? '' : ' '}${token}`);
  };

  const rankedQuickPromptTemplates = useMemo(
    () => rankPromptTemplatesByAdaptiveProfile(
      getAiChatQuickPromptTemplates(locale).map((item) => ({
        ...item,
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z',
      })),
      adaptiveInputProfile,
    ),
    [adaptiveInputProfile, locale],
  );
  const rankedPromptTemplates = useMemo(
    () => rankPromptTemplatesByAdaptiveProfile(promptTemplates, adaptiveInputProfile),
    [adaptiveInputProfile, promptTemplates],
  );

  return {
    quickPromptTemplates: rankedQuickPromptTemplates,
    promptTemplates: rankedPromptTemplates,
    editingTemplateId,
    templateTitleInput,
    templateContentInput,
    setTemplateTitleInput,
    setTemplateContentInput,
    savePromptTemplate,
    editPromptTemplate,
    removePromptTemplate,
    injectPromptTemplate,
    appendPromptVariable,
  };
}
