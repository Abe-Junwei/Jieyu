export type AiPanelMode = 'auto' | 'all';

export type AiPanelTask =
  | 'segmentation'
  | 'transcription'
  | 'translation'
  | 'pos_tagging'
  | 'glossing'
  | 'risk_review'
  | 'ai_chat_setup';

export type AiPanelCardKey =
  | 'ai_chat'
  | 'embedding_ops'
  | 'task_observer'
  | 'translation_focus'
  | 'generation_status'
  | 'context_analysis'
  | 'dictionary_matches'
  | 'token_notes'
  | 'pos_tagging'
  | 'phoneme_consistency';

/** 底部面板 tab 类型 | Bottom panel tab keys */
export type AnalysisBottomTab = 'embedding' | 'stats' | 'acoustic';
