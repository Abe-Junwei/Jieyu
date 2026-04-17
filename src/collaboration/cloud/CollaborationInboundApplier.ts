import {
  compareProjectChangeOrder,
  type CollaborationProjectChangeRecord,
} from './syncTypes';

export interface CollaborationInboundApplierOptions {
  applier: (change: CollaborationProjectChangeRecord) => Promise<void>;
}

export class CollaborationInboundApplier {
  constructor(private readonly options: CollaborationInboundApplierOptions) {}

  async apply(change: CollaborationProjectChangeRecord): Promise<void> {
    await this.options.applier(change);
  }

  async applyMany(changes: CollaborationProjectChangeRecord[]): Promise<void> {
    const ordered = [...changes].sort(compareProjectChangeOrder);
    for (const change of ordered) {
      await this.apply(change);
    }
  }
}
