/**
 * AI 域应用服务 — 页面与 AI 基础设施之间的编排层
 * AI domain application service — orchestration layer between pages and AI infrastructure
 *
 * 职责 | Responsibilities:
 * 1. 对话生命周期管理（创建、续接、清理）
 * 2. 工具调用路由与风险门禁
 * 3. 嵌入式搜索与 RAG 编排
 * 4. 语音交互与意图路由
 *
 * 限制 | Constraints:
 * - 不持有 React 状态（无 useState/useEffect）
 * - 仅依赖 db 层、services 层和 ai 层
 * - 页面通过 hook 调用本服务，不直接操作底层
 */
import type { AppServiceMeta, AppServiceResult } from './contracts';

export const AiAppServiceMeta: AppServiceMeta = {
  domain: 'ai',
  version: 1,
} as const;

// ── 对话操作契约 | Conversation operation contracts ──

export interface SendMessageRequest {
  conversationId: string;
  userMessage: string;
  contextTextId?: string;
}

export interface ClearConversationRequest {
  conversationId: string;
}

// ── 工具调用契约 | Tool call contracts ──

export interface ToolCallDecision {
  toolName: string;
  approved: boolean;
  riskLevel: 'safe' | 'moderate' | 'destructive';
}

// ── 嵌入搜索契约 | Embedding search contracts ──

export interface SemanticSearchRequest {
  query: string;
  textId: string;
  topK?: number;
}

export interface SemanticSearchHit {
  unitId: string;
  score: number;
  text: string;
}

// ── 应用服务接口（M4 绞杀迁移逐步实现） | Application service interface (implemented incrementally during M4 strangler migration) ──

export interface IAiAppService {
  sendMessage(request: SendMessageRequest): Promise<AppServiceResult<{ messageId: string }>>;
  clearConversation(request: ClearConversationRequest): Promise<AppServiceResult>;
  semanticSearch(request: SemanticSearchRequest): Promise<AppServiceResult<SemanticSearchHit[]>>;
}
