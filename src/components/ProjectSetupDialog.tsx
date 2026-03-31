import { useState } from 'react';
import { X } from 'lucide-react';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import { OrthographyTransformManager } from './OrthographyTransformManager';
import {
  formatOrthographyOptionLabel,
  ORTHOGRAPHY_CREATE_SENTINEL,
  useOrthographyPicker,
} from '../hooks/useOrthographyPicker';

const LANGUAGE_SUGGESTIONS = [
  { code: 'cmn', label: '普通话 Mandarin' },
  { code: 'yue', label: '粤语 Cantonese' },
  { code: 'wuu', label: '吴语 Wu' },
  { code: 'nan', label: '闽南语 Min Nan' },
  { code: 'hak', label: '客家话 Hakka' },
  { code: 'bod', label: '藏语 Tibetan' },
  { code: 'iii', label: '彝语 Yi' },
  { code: 'khb', label: '傣仂语 Tai Lue' },
  { code: 'eng', label: '英语 English' },
  { code: 'jpn', label: '日语 Japanese' },
] as const;

type ProjectSetupDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { titleZh: string; titleEn: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
};

export function ProjectSetupDialog({ isOpen, onClose, onSubmit }: ProjectSetupDialogProps) {
  const [titleZh, setTitleZh] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [languageId, setLanguageId] = useState('');
  const [customLang, setCustomLang] = useState('');
  const [orthographyId, setOrthographyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const effectiveLang = languageId === '__custom' ? customLang.trim() : languageId;
  const orthographyPicker = useOrthographyPicker(effectiveLang, orthographyId, setOrthographyId);
  const selectedOrthography = orthographyPicker.orthographies.find((item) => item.id === orthographyId);
  const canSubmit = titleZh.trim() && effectiveLang && !submitting && !orthographyPicker.isCreating;

  const reset = () => {
    setTitleZh('');
    setTitleEn('');
    setLanguageId('');
    setCustomLang('');
    setOrthographyId('');
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        titleZh: titleZh.trim(),
        titleEn: titleEn.trim(),
        primaryLanguageId: effectiveLang,
        ...(orthographyId ? { primaryOrthographyId: orthographyId } : {}),
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>新建项目</h3>
          <button className="icon-btn" onClick={handleClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <label className="dialog-field">
            <span>项目名称（中文）<em>*</em></span>
            <input
              className="input"
              type="text"
              value={titleZh}
              onChange={(e) => setTitleZh(e.target.value)}
              placeholder="例：白马藏语田野调查"
              autoFocus
            />
          </label>

          <label className="dialog-field">
            <span>项目名称（英文）</span>
            <input
              className="input"
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="e.g. Baima Tibetan Fieldwork"
            />
          </label>

          <label className="dialog-field">
            <span>目标语言 <em>*</em></span>
            <select
              className="input"
              value={languageId}
              onChange={(e) => setLanguageId(e.target.value)}
            >
              <option value="">请选择语言...</option>
              {LANGUAGE_SUGGESTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label} ({lang.code})</option>
              ))}
              <option value="__custom">其他（手动输入 ISO 639-3 代码）</option>
            </select>
          </label>

          {languageId === '__custom' && (
            <label className="dialog-field">
              <span>语言代码（ISO 639-3）</span>
              <input
                className="input"
                type="text"
                maxLength={8}
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                placeholder="例：bfy"
              />
            </label>
          )}

          {effectiveLang && (
            <div className="dialog-field">
              <span>正字法 / 书写系统</span>
              <select
                className="input"
                value={orthographyPicker.isCreating ? ORTHOGRAPHY_CREATE_SENTINEL : orthographyId}
                onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
              >
                {orthographyPicker.orthographies.length === 0 && <option value="">沿用默认脚本推断</option>}
                {orthographyPicker.orthographies.map((orthography) => (
                  <option key={orthography.id} value={orthography.id}>
                    {formatOrthographyOptionLabel(orthography)}
                  </option>
                ))}
                <option value={ORTHOGRAPHY_CREATE_SENTINEL}>+ 新建正字法…</option>
              </select>

              {orthographyPicker.orthographies.length === 0 && !orthographyPicker.isCreating && (
                <p className="dialog-hint">当前语言暂无正字法记录，可直接新建或沿用默认脚本推断。</p>
              )}

              {orthographyPicker.isCreating && (
                <OrthographyBuilderPanel
                  picker={orthographyPicker}
                  languageOptions={LANGUAGE_SUGGESTIONS}
                />
              )}

              {!orthographyPicker.isCreating && selectedOrthography && (
                <OrthographyTransformManager
                  targetOrthography={selectedOrthography}
                  languageOptions={LANGUAGE_SUGGESTIONS}
                />
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={handleClose} disabled={submitting}>
            取消
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {submitting ? '创建中...' : '创建项目'}
          </button>
        </div>
      </div>
    </div>
  );
}
