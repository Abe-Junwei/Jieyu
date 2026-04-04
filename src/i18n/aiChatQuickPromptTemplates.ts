import type { Locale } from './index';

export interface AiChatQuickPromptTemplateDefinition {
  id: string;
  title: string;
  content: string;
}

const zhCN: AiChatQuickPromptTemplateDefinition[] = [
  {
    id: 'rag-qa-template',
    title: 'RAG 问答模板',
    content: '[RAG_SCENARIO:qa]\n【问答模板】请基于检索上下文回答问题，并标注关键依据。\n问题：{{selected_text}}',
  },
  {
    id: 'rag-review-template',
    title: 'RAG 审校模板',
    content: '[RAG_SCENARIO:review]\n【审校模板】请对当前内容做审校，指出不一致、歧义和可改进点。\n目标：{{current_utterance}}',
  },
  {
    id: 'rag-terminology-template',
    title: 'RAG 术语查证模板',
    content: '[RAG_SCENARIO:terminology]\n【术语查证模板】请检索术语定义、上下文用例与对译建议。\n术语：{{selected_text}}',
  },
];

const enUS: AiChatQuickPromptTemplateDefinition[] = [
  {
    id: 'rag-qa-template',
    title: 'RAG QA Template',
    content: '[RAG_SCENARIO:qa]\n[QA Template] Answer the question using retrieved context and cite the key evidence.\nQuestion: {{selected_text}}',
  },
  {
    id: 'rag-review-template',
    title: 'RAG Review Template',
    content: '[RAG_SCENARIO:review]\n[Review Template] Review the current content, point out inconsistencies or ambiguities, and suggest improvements.\nTarget: {{current_utterance}}',
  },
  {
    id: 'rag-terminology-template',
    title: 'RAG Terminology Template',
    content: '[RAG_SCENARIO:terminology]\n[Terminology Template] Retrieve term definitions, contextual examples, and translation suggestions.\nTerm: {{selected_text}}',
  },
];

export function getAiChatQuickPromptTemplates(locale: Locale): AiChatQuickPromptTemplateDefinition[] {
  return locale === 'zh-CN' ? zhCN : enUS;
}
