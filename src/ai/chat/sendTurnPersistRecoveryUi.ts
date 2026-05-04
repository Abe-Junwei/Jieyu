/**
 * Detects the user-visible persist-layer recovery hint produced by send-turn
 * (`tf(..., 'ai.chat.persistLayerRecoveryHint', ...)`). Used only to show inline actions.
 */
export function isSendTurnPersistLayerRecoveryHintMessage(message: string): boolean {
  const s = message.trim();
  if (s.includes('Local session save failed')) return true;
  return s.includes('\u672c\u5730\u4f1a\u8bdd\u5b58\u6863\u5931\u8d25');
}
