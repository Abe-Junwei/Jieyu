import type { AiChatToolName } from './chatDomain.types';

/** 将模型/别名工具名归一为 `AiChatToolName`；无法识别时返回 null */
export function normalizeToolCallName(rawName: string): AiChatToolName | null {
  const name = rawName.trim().toLowerCase();
  if (!name) return null;

  if (name === 'create_transcription_segment') return name;
  if (name === 'split_transcription_segment') return name;
  if (name === 'merge_transcription_segments') return name;
  if (name === 'delete_transcription_segment') return name;
  if (name === 'clear_translation_segment') return name;
  if (name === 'merge_prev') return name;
  if (name === 'merge_next') return name;
  if (['split_segment', 'split_transcription_row', 'split_row', 'split_unit', 'cut_segment', 'split_current_segment'].includes(name)) return 'split_transcription_segment';
  if (['create_transcription_row', 'create_segment', 'new_segment', 'add_segment', 'new_transcription_row', 'add_transcription_row'].includes(name)) return 'create_transcription_segment';
  if (['merge_segments', 'merge_segment_selection', 'merge_selected_segments', 'merge_selected_transcription_segments', 'merge_transcription_segment_selection'].includes(name)) return 'merge_transcription_segments';
  if (['delete_transcription_row', 'remove_transcription_row', 'remove_unit', 'delete_unit', 'remove_row', 'delete_row', 'delete_segment', 'remove_segment'].includes(name)) return 'delete_transcription_segment';
  if (['delete_translation_row', 'clear_translation_text', 'clear_translation', 'empty_translation', 'remove_translation_text', 'clear_segment_translation'].includes(name)) return 'clear_translation_segment';
  if (name === 'set_transcription_text') return name;
  if (name === 'set_translation_text') return name;
  if (name === 'create_transcription_layer') return name;
  if (name === 'create_translation_layer') return name;
  if (name === 'delete_layer') return name;
  if (name === 'link_translation_layer') return name;
  if (name === 'unlink_translation_layer') return name;
  if (name === 'add_host') return name;
  if (name === 'remove_host') return name;
  if (name === 'switch_preferred_host') return name;
  if (name === 'auto_gloss_unit') return name;
  if (name === 'set_token_pos') return name;
  if (name === 'set_token_gloss') return name;
  if (name === 'propose_changes') return name;

  if (['auto_gloss', 'auto_gloss_selected', 'gloss_unit', 'auto_annotate'].includes(name)) {
    return 'auto_gloss_unit';
  }

  if (['create_layer', 'new_layer', 'add_layer', 'new_transcription_layer', 'add_transcription_layer'].includes(name)) {
    return 'create_transcription_layer';
  }
  if (['new_translation_layer', 'add_translation_layer'].includes(name)) {
    return 'create_translation_layer';
  }
  if (['remove_layer', 'delete_translation_layer', 'delete_transcription_layer'].includes(name)) {
    return 'delete_layer';
  }
  if (['link_layer', 'create_layer_link', 'add_layer_link', 'connect_layers', 'toggle_layer_link'].includes(name)) {
    return 'link_translation_layer';
  }
  if (['unlink_layer', 'remove_layer_link', 'disconnect_layers'].includes(name)) {
    return 'unlink_translation_layer';
  }
  if (['add_translation_host', 'add_host_to_translation_layer'].includes(name)) {
    return 'add_host';
  }
  if (['remove_translation_host', 'remove_host_from_translation_layer'].includes(name)) {
    return 'remove_host';
  }
  if (['set_preferred_host', 'switch_translation_preferred_host'].includes(name)) {
    return 'switch_preferred_host';
  }

  return null;
}
