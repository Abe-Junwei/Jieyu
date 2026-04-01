export type AiChatCandidateChipsMessages = {
  demoCandidate1: string;
  demoCandidate2: string;
};

const zhCN: AiChatCandidateChipsMessages = {
  demoCandidate1: '\u793a\u4f8b\u5019\u9009 1',
  demoCandidate2: '\u793a\u4f8b\u5019\u9009 2',
};

const enUS: AiChatCandidateChipsMessages = {
  demoCandidate1: 'Sample candidate 1',
  demoCandidate2: 'Sample candidate 2',
};

export function getAiChatCandidateChipsMessages(isZh: boolean): AiChatCandidateChipsMessages {
  return isZh ? zhCN : enUS;
}
