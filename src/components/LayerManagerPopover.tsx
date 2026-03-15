import { useEffect, useRef, useState } from 'react';
import { AudioLines, Languages, Trash2 } from 'lucide-react';
import type { TranslationLayerDocType } from '../../db';
import type { LayerCreateInput } from '../hooks/useTranscriptionData';
import { COMMON_LANGUAGES } from '../utils/transcriptionFormatters';

const BUBBLE_ANIMATION_MS = 180;

function getLayerDisplayName(layer: TranslationLayerDocType): string {
  return layer.name.zho
    ?? layer.name.zh
    ?? layer.name.cmn
    ?? layer.name.eng
    ?? layer.name.en
    ?? Object.values(layer.name).find((value) => Boolean(value?.trim()))
    ?? layer.key;
}

function formatLayerLanguage(layer: TranslationLayerDocType): string {
  const code = (layer.languageId ?? '').trim().toLowerCase();
  if (!code) {
    return '未设置语言';
  }
  const matched = COMMON_LANGUAGES.find((item) => item.code === code);
  return matched ? `${matched.label} ${code}` : code;
}

type LayerManagerPopoverProps = {
  allLayers: TranslationLayerDocType[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCreateTranscriptionLayer: (input: LayerCreateInput) => Promise<boolean>;
  onCreateTranslationLayer: (
    input: LayerCreateInput & { modality: 'text' | 'audio' | 'mixed' },
  ) => Promise<boolean>;
  deletableLayers: TranslationLayerDocType[];
  layerToDeleteId: string;
  onLayerToDeleteIdChange: (value: string) => void;
  layerPendingDelete: TranslationLayerDocType | undefined;
  onDeleteLayer: () => void | Promise<void>;
  message: string;
};

export function LayerManagerPopover({
  allLayers,
  isOpen,
  onToggle,
  onClose,
  onCreateTranscriptionLayer,
  onCreateTranslationLayer,
  deletableLayers,
  layerToDeleteId,
  onLayerToDeleteIdChange,
  layerPendingDelete,
  onDeleteLayer,
  message,
}: LayerManagerPopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldRenderBubble, setShouldRenderBubble] = useState(isOpen);
  const [transcriptionForm, setTranscriptionForm] = useState<LayerCreateInput>({
    languageId: '',
  });
  const [translationForm, setTranslationForm] = useState<LayerCreateInput>({
    languageId: '',
  });
  const [transcriptionCustomLang, setTranscriptionCustomLang] = useState('');
  const [translationCustomLang, setTranslationCustomLang] = useState('');
  const [translationModality, setTranslationModality] = useState<'text' | 'audio' | 'mixed'>('text');

  const translationModalityOptions = [
    { value: 'text', label: '文本（纯文字翻译）' },
    { value: 'audio', label: '语音（口译录音）' },
    { value: 'mixed', label: '混合（文字 + 录音）' },
  ] as const;

  const transcriptionLayerCount = allLayers.filter((layer) => layer.layerType === 'transcription').length;
  const translationLayerCount = allLayers.filter((layer) => layer.layerType === 'translation').length;

  const handleCreateTranscription = async () => {
    const langId = transcriptionForm.languageId === '__custom__' ? transcriptionCustomLang.trim() : transcriptionForm.languageId;
    const success = await onCreateTranscriptionLayer({ languageId: langId, alias: transcriptionForm.alias });
    if (success) {
      setTranscriptionForm({ languageId: '' });
      setTranscriptionCustomLang('');
    }
  };

  const handleCreateTranslation = async () => {
    const langId = translationForm.languageId === '__custom__' ? translationCustomLang.trim() : translationForm.languageId;
    const success = await onCreateTranslationLayer({
      languageId: langId,
      alias: translationForm.alias,
      modality: translationModality,
    });
    if (success) {
      setTranslationForm({ languageId: '' });
      setTranslationCustomLang('');
      setTranslationModality('text');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRenderBubble(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setShouldRenderBubble(false);
    }, BUBBLE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className="transcription-layer-popover" ref={rootRef}>
      <div className="transcription-list-toolbar transcription-list-toolbar-layer-only">
        <button className="btn btn-sm" onClick={onToggle}>
          层管理
        </button>
      </div>

      {shouldRenderBubble && (
        <div className={`transcription-layer-bubble ${isOpen ? 'transcription-layer-bubble-open' : 'transcription-layer-bubble-closing'}`}>
          <div className="transcription-layer-bubble-arrow" />
          <div className="transcription-layer-form transcription-layer-manager">
            <div className="transcription-layer-manager-head">
              <div className="transcription-layer-form-title">层管理</div>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
            </div>

            <div className="transcription-layer-columns">
              <div className="transcription-layer-section transcription-layer-section-transcription">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <AudioLines size={14} />
                    <span>新建转写层</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">现有 {transcriptionLayerCount}</span>
                </div>
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={transcriptionForm.languageId}
                    onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, languageId: event.target.value }))}
                  >
                    <option value="">选择语言…</option>
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                    ))}
                    <option value="__custom__">其他（手动输入）</option>
                  </select>
                  {transcriptionForm.languageId === '__custom__' && (
                    <input
                      className="input"
                      placeholder="ISO 639-3 代码（如 tib）"
                      value={transcriptionCustomLang}
                      onChange={(event) => setTranscriptionCustomLang(event.target.value)}
                    />
                  )}
                  <input
                    className="input"
                    placeholder="别名（可选，同语言多层时用于区分）"
                    value={transcriptionForm.alias ?? ''}
                    onChange={(event) => setTranscriptionForm((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                </div>
                <div className="action-row">
                  <button className="btn" onClick={() => void handleCreateTranscription()}>创建转写层</button>
                </div>
              </div>

              <div className="transcription-layer-section transcription-layer-section-translation">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <Languages size={14} />
                    <span>新建翻译层</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">现有 {translationLayerCount}</span>
                </div>
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={translationForm.languageId}
                    onChange={(event) => setTranslationForm((prev) => ({ ...prev, languageId: event.target.value }))}
                  >
                    <option value="">选择语言…</option>
                    {COMMON_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>{lang.label}（{lang.code}）</option>
                    ))}
                    <option value="__custom__">其他（手动输入）</option>
                  </select>
                  {translationForm.languageId === '__custom__' && (
                    <input
                      className="input"
                      placeholder="ISO 639-3 代码（如 tib）"
                      value={translationCustomLang}
                      onChange={(event) => setTranslationCustomLang(event.target.value)}
                    />
                  )}
                  <input
                    className="input"
                    placeholder="别名（可选，同语言多层时用于区分）"
                    value={translationForm.alias ?? ''}
                    onChange={(event) => setTranslationForm((prev) => ({ ...prev, alias: event.target.value }))}
                  />
                  <select
                    className="input"
                    value={translationModality}
                    onChange={(event) => setTranslationModality(event.target.value as 'text' | 'audio' | 'mixed')}
                  >
                    {translationModalityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="action-row">
                  <button className="btn" onClick={() => void handleCreateTranslation()}>创建翻译层</button>
                </div>
              </div>

              <div className="transcription-layer-section transcription-layer-section-delete">
                <div className="transcription-layer-section-head-row">
                  <div className="transcription-layer-section-head">
                    <Trash2 size={14} />
                    <span>删除层</span>
                  </div>
                  <span className="toolbar-chip small-chip transcription-layer-count-chip">可删 {deletableLayers.length}</span>
                </div>
                <div className="transcription-layer-column-fields">
                  <select
                    className="input"
                    value={layerToDeleteId}
                    onChange={(event) => onLayerToDeleteIdChange(event.target.value)}
                    disabled={deletableLayers.length === 0}
                  >
                    {deletableLayers.length > 0 ? (
                      deletableLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>
                          {layer.layerType === 'translation' ? '翻译层' : '转写层'}
                          {' · '}
                          {getLayerDisplayName(layer)}
                          {' · '}
                          {formatLayerLanguage(layer)}
                        </option>
                      ))
                    ) : (
                      <option value="">无可删除层</option>
                    )}
                  </select>

                  <p className="small-text">
                    {deletableLayers.length === 0
                      ? '当前没有可删除层。默认层会被保护，不能删除。'
                      : '删除时会同时清理该层下的文本/录音记录与关联链接。'}
                  </p>
                </div>

                <div className="action-row">
                  <button
                    className="btn btn-danger"
                    onClick={() => void onDeleteLayer()}
                    disabled={deletableLayers.length === 0 || !layerPendingDelete}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </div>

            {message && <p className="small-text">{message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}