import { t, type Locale } from './index';

export type AiChatCandidateChipsMessages = {
  demoCandidate1: string;
  demoCandidate2: string;
};

export function getAiChatCandidateChipsMessages(isZh: boolean): AiChatCandidateChipsMessages {
  const locale: Locale = isZh ? 'zh-CN' : 'en-US';
  return {
    demoCandidate1: t(locale, 'ai.chat.candidateChip.demo1'),
    demoCandidate2: t(locale, 'ai.chat.candidateChip.demo2'),
  };
}
