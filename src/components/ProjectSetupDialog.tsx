import { useState } from 'react';
import { X } from 'lucide-react';
import { fireAndForget } from '../utils/fireAndForget';

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
  onSubmit: (input: { titleZh: string; titleEn: string; primaryLanguageId: string }) => Promise<void>;
};

export function ProjectSetupDialog({ isOpen, onClose, onSubmit }: ProjectSetupDialogProps) {
  const [titleZh, setTitleZh] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [languageId, setLanguageId] = useState('');
  const [customLang, setCustomLang] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const effectiveLang = languageId === '__custom' ? customLang.trim() : languageId;
  const canSubmit = titleZh.trim() && effectiveLang && !submitting;

  const reset = () => {
    setTitleZh('');
    setTitleEn('');
    setLanguageId('');
    setCustomLang('');
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

          {error && <p className="error">{error}</p>}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={handleClose} disabled={submitting}>
            取消
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => fireAndForget(handleSubmit())}
          >
            {submitting ? '创建中...' : '创建项目'}
          </button>
        </div>
      </div>
    </div>
  );
}
