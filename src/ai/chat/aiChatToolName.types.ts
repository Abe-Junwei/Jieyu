/**
 * AI 聊天工具名。单独成文件，避免策略矩阵 ↔ chatDomain.types 循环依赖（JY-24）。
 * AI chat tool names; its own file so the policy matrix and chatDomain.types do not form a
 * cycle (JY-24). Re-exported from chatDomain.types.
 */
import type { VoiceActionToolName } from '../voice/VoiceActionTools';

export type AiChatToolName =
  | 'create_transcription_segment'
  | 'split_transcription_segment'
  | 'merge_transcription_segments'
  | 'delete_transcription_segment'
  | 'clear_translation_segment'
  | 'set_transcription_text'
  | 'set_translation_text'
  | 'create_transcription_layer'
  | 'create_translation_layer'
  | 'delete_layer'
  | 'link_translation_layer'
  | 'unlink_translation_layer'
  | 'add_host'
  | 'remove_host'
  | 'switch_preferred_host'
  | 'auto_gloss_unit'
  | 'set_token_pos'
  | 'set_token_gloss'
  | 'propose_changes'
  | VoiceActionToolName;
