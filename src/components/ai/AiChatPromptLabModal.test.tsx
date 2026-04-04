// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiChatPromptLabModal } from './AiChatPromptLabModal';

function makeTemplate(index: number) {
  return {
    id: `tpl-${index}`,
    title: `模板 ${index}`,
    content: `内容 ${index}`,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  };
}

describe('AiChatPromptLabModal', () => {
  it('renders all saved prompt templates instead of truncating after six items', () => {
    const promptTemplates = Array.from({ length: 7 }, (_, index) => makeTemplate(index + 1));

    render(
      <AiChatPromptLabModal
        isZh
        showPromptLab
        promptTemplates={promptTemplates}
        editingTemplateId={null}
        templateTitleInput=""
        templateContentInput=""
        onInjectTemplate={vi.fn()}
        onEditTemplate={vi.fn()}
        onRemoveTemplate={vi.fn()}
        onTemplateTitleInputChange={vi.fn()}
        onTemplateContentInputChange={vi.fn()}
        onAppendPromptVariable={vi.fn()}
        onSaveTemplate={vi.fn()}
        onInjectAndClose={vi.fn()}
      />,
    );

    expect(screen.getByText('模板 7')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '模板名称' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '模板内容，支持 {{selected_text}} 等变量' })).toBeTruthy();
    expect(document.querySelector('.ai-chat-prompt-lab-panel-content .dialog-header')).toBeTruthy();
    expect(document.querySelector('.ai-chat-prompt-lab-panel-content .dialog-footer')).toBeTruthy();
  });
});
