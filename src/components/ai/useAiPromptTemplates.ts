import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  interpolatePromptTemplate,
  loadPromptTemplatesFromStorage,
  newTemplateId,
  PROMPT_TEMPLATES_STORAGE_KEY,
  type PromptTemplateItem,
} from './aiChatCardUtils';

interface UseAiPromptTemplatesOptions {
  promptVars: Record<string, string>;
  onInjectRenderedPrompt: (rendered: string) => void;
  onEditTemplate?: () => void;
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

const RAG_QUICK_PROMPT_TEMPLATES: PromptTemplateItem[] = [
  {
    id: 'rag-qa-template',
    title: 'RAG 问答模板',
    content: '[RAG_SCENARIO:qa]\n【问答模板】请基于检索上下文回答问题，并标注关键依据。\n问题：{{selected_text}}',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  },
  {
    id: 'rag-review-template',
    title: 'RAG 审校模板',
    content: '[RAG_SCENARIO:review]\n【审校模板】请对当前内容做审校，指出不一致、歧义和可改进点。\n目标：{{current_utterance}}',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  },
  {
    id: 'rag-terminology-template',
    title: 'RAG 术语查证模板',
    content: '[RAG_SCENARIO:terminology]\n【术语查证模板】请检索术语定义、上下文用例与对译建议。\n术语：{{selected_text}}',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  },
];

export function useAiPromptTemplates({
  promptVars,
  onInjectRenderedPrompt,
  onEditTemplate,
}: UseAiPromptTemplatesOptions): UseAiPromptTemplatesReturn {
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

  return {
    quickPromptTemplates: RAG_QUICK_PROMPT_TEMPLATES,
    promptTemplates,
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
