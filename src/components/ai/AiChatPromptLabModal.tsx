import type { PromptTemplateItem } from './aiChatCardUtils';

interface AiChatPromptLabModalProps {
  isZh: boolean;
  showPromptLab: boolean;
  quickPromptTemplates: PromptTemplateItem[];
  promptTemplates: PromptTemplateItem[];
  editingTemplateId: string | null;
  templateTitleInput: string;
  templateContentInput: string;
  onClose: () => void;
  onInjectTemplate: (content: string) => void;
  onEditTemplate: (item: PromptTemplateItem) => void;
  onRemoveTemplate: (id: string) => void;
  onTemplateTitleInputChange: (value: string) => void;
  onTemplateContentInputChange: (value: string) => void;
  onAppendPromptVariable: (name: string) => void;
  onSaveTemplate: () => void;
  onInjectAndClose: () => void;
}

export function AiChatPromptLabModal({
  isZh,
  showPromptLab,
  quickPromptTemplates,
  promptTemplates,
  editingTemplateId,
  templateTitleInput,
  templateContentInput,
  onClose,
  onInjectTemplate,
  onEditTemplate,
  onRemoveTemplate,
  onTemplateTitleInputChange,
  onTemplateContentInputChange,
  onAppendPromptVariable,
  onSaveTemplate,
  onInjectAndClose,
}: AiChatPromptLabModalProps) {
  if (!showPromptLab) return null;

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        background: 'rgba(15,23,42,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--color-bg-primary, #fff)', borderRadius: 12,
          padding: 16, width: '100%', maxWidth: 480,
          display: 'grid', gap: 10, maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>{isZh ? 'Prompt 实验室' : 'Prompt Lab'}</strong>
          <button type="button" className="icon-btn" style={{ height: 26, minWidth: 48, fontSize: 12 }} onClick={onClose}>{isZh ? '关闭' : 'Close'}</button>
        </div>

        {quickPromptTemplates.length > 0 && (
          <div style={{ display: 'grid', gap: 6, borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
            <strong style={{ fontSize: 12 }}>{isZh ? 'RAG 快速模板' : 'RAG Quick Templates'}</strong>
            {quickPromptTemplates.map((item) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
                <span className="small-text" title={item.content}>{item.title}</span>
                <button type="button" className="icon-btn" style={{ height: 24, minWidth: 76, fontSize: 11 }} onClick={() => onInjectTemplate(item.content)}>
                  {isZh ? '注入模板' : 'Inject'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gap: 6 }}>
          {promptTemplates.length === 0 ? (
            <p className="small-text" style={{ margin: 0 }}>{isZh ? '暂无模板。可创建并在对话前一键注入。' : 'No template yet.'}</p>
          ) : (
            promptTemplates.map((item) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 4, alignItems: 'center' }}>
                <span className="small-text" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.content}>{item.title}</span>
                <button type="button" className="icon-btn" style={{ height: 24, minWidth: 52, fontSize: 11 }} onClick={() => onInjectTemplate(item.content)}>{isZh ? '注入' : 'Inject'}</button>
                <button type="button" className="icon-btn" style={{ height: 24, minWidth: 44, fontSize: 11 }} onClick={() => onEditTemplate(item)}>{isZh ? '编辑' : 'Edit'}</button>
                <button type="button" className="icon-btn" style={{ height: 24, minWidth: 44, fontSize: 11 }} onClick={() => onRemoveTemplate(item.id)}>{isZh ? '删除' : 'Del'}</button>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'grid', gap: 6, borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
          <input
            type="text"
            value={templateTitleInput}
            placeholder={isZh ? '模板名称' : 'Template title'}
            onChange={(event) => onTemplateTitleInputChange(event.currentTarget.value)}
            style={{ height: 28, fontSize: 12, padding: '0 8px' }}
          />
          <textarea
            value={templateContentInput}
            placeholder={isZh ? '模板内容，支持 {{selected_text}} 等变量' : 'Template body with {{selected_text}} {{current_utterance}}...'}
            onChange={(event) => onTemplateContentInputChange(event.currentTarget.value)}
            style={{ minHeight: 80, fontSize: 12, padding: 8, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['selected_text', 'current_utterance', 'lexicon_summary', 'project_stage', 'current_row'].map((token) => (
              <button key={token} type="button" className="icon-btn" style={{ height: 22, minWidth: 72, fontSize: 10 }} onClick={() => onAppendPromptVariable(token)}>{`{{${token}}}`}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="icon-btn" style={{ height: 26, minWidth: 80, fontSize: 12 }} disabled={templateTitleInput.trim().length === 0 || templateContentInput.trim().length === 0} onClick={onSaveTemplate}>{editingTemplateId ? (isZh ? '更新' : 'Update') : (isZh ? '保存' : 'Save')}</button>
            <button type="button" className="icon-btn" style={{ height: 26, minWidth: 100, fontSize: 12 }} disabled={templateContentInput.trim().length === 0} onClick={onInjectAndClose}>{isZh ? '注入并关闭' : 'Inject & close'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
