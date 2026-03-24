/**
 * Speaker management shared types | 说话人管理共享类型
 */

export interface SpeakerVisual {
  name: string;
  color: string;
}

export interface SpeakerFilterOption {
  key: string;
  name: string;
  count: number;
  color?: string;
  isEntity: boolean;
}

export type SpeakerActionDialogState =
  | {
      mode: 'rename';
      speakerKey: string;
      speakerName: string;
      draftName: string;
    }
  | {
      mode: 'merge';
      sourceSpeakerKey: string;
      sourceSpeakerName: string;
      targetSpeakerKey: string;
      candidates: Array<{ key: string; name: string }>;
    }
  | {
      mode: 'clear';
      speakerKey: string;
      speakerName: string;
      affectedCount: number;
    }
  | {
      mode: 'delete';
      sourceSpeakerKey: string;
      sourceSpeakerName: string;
      replacementSpeakerKey: string;
      candidates: Array<{ key: string; name: string }>;
      affectedCount: number;
    };