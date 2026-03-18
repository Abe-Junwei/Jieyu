export type DbState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      dbName: string;
      utteranceCount: number;
      translationLayerCount: number;
      translationRecordCount: number;
    }
  | { phase: 'error'; message: string };

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

export type LayerCreateInput = {
  languageId: string;
  alias?: string | undefined;
  textId?: string | undefined;
};

export type SnapGuide = {
  visible: boolean;
  left?: number;
  right?: number;
  nearSide?: 'left' | 'right' | 'both';
};
