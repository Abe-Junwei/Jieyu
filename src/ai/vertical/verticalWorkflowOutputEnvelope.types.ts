/**
 * 垂直工作流输出信封（V0）类型。单独成文件，避免 selection ↔ completion checklist 循环依赖（JY-24）。
 * Vertical workflow output envelope (V0); its own file so selection and the completion
 * checklist do not import each other (JY-24).
 */
import type { EvidencePacketV0 } from './evidencePacket';
import type { VerticalWorkflowId, VerticalWorkflowV0 } from './verticalWorkflowRegistry';

export interface VerticalWorkflowOutputEnvelopeV0 {
  schemaVersion: 0;
  workflowId: VerticalWorkflowId;
  writeMode: VerticalWorkflowV0['writeMode'];
  outputKind: VerticalWorkflowV0['outputKind'];
  evidencePackets: ReadonlyArray<EvidencePacketV0>;
  generatedAt: string;
  status: 'ready' | 'degraded';
}
