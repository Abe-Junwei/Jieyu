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
    title: 'RAG \u95ee\u7b54\u6a21\u677f',
    content: '[RAG_SCENARIO:qa]\n\u3010\u95ee\u7b54\u6a21\u677f\u3011\u8bf7\u57fa\u4e8e\u68c0\u7d22\u4e0a\u4e0b\u6587\u56de\u7b54\u95ee\u9898\uff0c\u5e76\u6807\u6ce8\u5173\u952e\u4f9d\u636e\u3002\n\u95ee\u9898\uff1a{{selected_text}}',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  },
  {
    id: 'rag-review-template',
    title: 'RAG \u5ba1\u6821\u6a21\u677f',
    content: '[RAG_SCENARIO:review]\n\u3010\u5ba1\u6821\u6a21\u677f\u3011\u8bf7\u5bf9\u5f53\u524d\u5185\u5bb9\u505a\u5ba1\u6821\uff0c\u6307\u51fa\u4e0d\u4e00\u81f4\u3001\u6b67\u4e49\u548c\u53ef\u6539\u8fdb\u70b9\u3002\n\u76ee\u6807\uff1a{{current_utterance}}',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  },
  {
    id: 'rag-terminology-template',
    title: 'RAG \u672f\u8bed\u67e5\u8bc1\u6a21\u677f',
    content: '[RAG_SCENARIO:terminology]\n\u3010\u672f\u8bed\u67e5\u8bc1\u6a21\u677f\u3011\u8bf7\u68c0\u7d22\u672f\u8bed\u5b9a\u4e49\u3001\u4e0a\u4e0b\u6587\u7528\u4f8b\u4e0e\u5bf9\u8bd1\u5efa\u8bae\u3002\n\u672f\u8bed\uff1a{{selected_text}}',
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
