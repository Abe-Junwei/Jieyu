import { normalizeLocale, t, tf, type Locale } from './index';

export type TranscriptionOverlaysMessages = {
  note: string;
  segment: string;
  deleteSegments: (count: number) => string;
  mergeSegments: (count: number) => string;
  selectBeforeAll: string;
  selectAfterAll: string;
  deleteSegment: string;
  mergePrevious: string;
  mergeNext: string;
  splitFromCurrent: string;
  splitSegment: string;
  addNote: string;
  assignSpeakerRecent: (name: string) => string;
  assignSpeaker: (name: string) => string;
  clearSpeaker: string;
  createSpeakerAndAssign: string;
  speakerManagement: string;
  layerDisplayStyle: string;
};

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getTranscriptionOverlaysMessages(locale: Locale): TranscriptionOverlaysMessages {
  const l = dictLocale(locale);
  return {
    note: t(l, 'msg.overlay.note'),
    segment: t(l, 'msg.overlay.segment'),
    deleteSegments: (count) => tf(l, 'msg.overlay.deleteSegments', { count }),
    mergeSegments: (count) => tf(l, 'msg.overlay.mergeSegments', { count }),
    selectBeforeAll: t(l, 'msg.overlay.selectBeforeAll'),
    selectAfterAll: t(l, 'msg.overlay.selectAfterAll'),
    deleteSegment: t(l, 'msg.overlay.deleteSegment'),
    mergePrevious: t(l, 'msg.overlay.mergePrevious'),
    mergeNext: t(l, 'msg.overlay.mergeNext'),
    splitFromCurrent: t(l, 'msg.overlay.splitFromCurrent'),
    splitSegment: t(l, 'msg.overlay.splitSegment'),
    addNote: t(l, 'msg.overlay.addNote'),
    assignSpeakerRecent: (name) => tf(l, 'msg.overlay.assignSpeakerRecent', { name }),
    assignSpeaker: (name) => tf(l, 'msg.overlay.assignSpeaker', { name }),
    clearSpeaker: t(l, 'msg.overlay.clearSpeaker'),
    createSpeakerAndAssign: t(l, 'msg.overlay.createSpeakerAndAssign'),
    speakerManagement: t(l, 'msg.overlay.speakerManagement'),
    layerDisplayStyle: t(l, 'msg.overlay.layerDisplayStyle'),
  };
}
