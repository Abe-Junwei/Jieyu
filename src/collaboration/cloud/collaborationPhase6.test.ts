/**
 * Phase 6 资产托管与版本历史回归测试
 * Phase 6 asset hosting & version history regression tests
 *
 * 验证 CollaborationAssetService、CollaborationSnapshotService（扩展）、
 * CollaborationAuditLogService 的类型安全与关键行为。
 * Uses lightweight mocks to avoid real Supabase network calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 模块级 mock | Module-level mocks ──

const mockSupabaseFrom = vi.fn();
const mockSupabaseStorage = { from: vi.fn() };
const mockSupabaseChannel = vi.fn();

vi.mock('./collaborationSupabaseFacade', () => ({
  getSupabaseBrowserClient: () => ({
    from: mockSupabaseFrom,
    storage: mockSupabaseStorage,
    channel: mockSupabaseChannel,
  }),
}));

vi.mock('../../integrations/supabase/storage', () => ({
  COLLABORATION_STORAGE_BUCKETS: ['project-audio', 'project-exports', 'project-attachments'],
  uploadProjectAsset: vi.fn().mockResolvedValue({ path: 'proj-1/audio-abc123/file.wav' }),
  createSignedProjectAssetUrl: vi.fn().mockResolvedValue('https://example.com/signed-url'),
  removeProjectAsset: vi.fn().mockResolvedValue(undefined),
  buildProjectAssetPath: vi.fn(
    (projectId: string, assetId: string, fileName: string) => `${projectId}/${assetId}/${fileName}`,
  ),
}));

import { CollaborationAssetService } from './CollaborationAssetService';
import { CollaborationSnapshotService, computeSnapshotChecksum } from './CollaborationSnapshotService';
import { CollaborationAuditLogService } from './CollaborationAuditLogService';

// ── 辅助工厂 | Helper factories ──

function makeAssetRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'asset-1',
    project_id: 'proj-1',
    asset_type: 'audio',
    storage_bucket: 'project-audio',
    storage_path: 'proj-1/audio-abc/file.wav',
    mime_type: 'audio/wav',
    size_bytes: 1024,
    checksum: 'abc123',
    uploaded_by: 'user-1',
    created_at: '2026-04-17T00:00:00.000Z',
    ...overrides,
  };
}

function makeSnapshotRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'snap-1',
    project_id: 'proj-1',
    version: 5,
    schema_version: 1,
    created_by: 'user-1',
    snapshot_storage_bucket: 'project-exports',
    snapshot_storage_path: 'proj-1/snapshot-v5/snapshot-v5-12345.json',
    checksum: 'ff001122',
    size_bytes: 2048,
    change_cursor: 42,
    note: 'manual save',
    created_at: '2026-04-17T00:00:00.000Z',
    ...overrides,
  };
}

function makeChangeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'ch-1',
    project_id: 'proj-1',
    actor_id: 'user-1',
    client_id: 'cl-1',
    client_op_id: 'op-1',
    session_id: 'sess-1',
    protocol_version: 1,
    project_revision: 10,
    base_revision: 9,
    entity_type: 'text',
    entity_id: 'e-1',
    op_type: 'upsert_text',
    payload: { patch: { content: 'hello' } },
    payload_ref_path: null,
    vector_clock: null,
    source_kind: 'user',
    created_at: '2026-04-17T00:00:00.000Z',
    ...overrides,
  };
}

// ── Supabase query builder mock 链 | Query builder mock chain ──

function createQueryChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  Object.defineProperty(chain, 'then', {
    get() {
      return (resolve: (v: unknown) => void) => resolve({ ...result });
    },
  });
  return chain;
}

// ── CollaborationAssetService ──

describe('CollaborationAssetService', () => {
  let service: CollaborationAssetService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CollaborationAssetService();
  });

  it('[register] 上传文件并插入元数据 | uploads file and inserts metadata', async () => {
    const assetRow = makeAssetRow();
    const chain = createQueryChain({ data: assetRow, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.register({
      projectId: 'proj-1',
      assetType: 'audio',
      fileName: 'recording.wav',
      data: new Blob(['audio data'], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      checksum: 'abc123',
      uploadedBy: 'user-1',
    });

    expect(result.projectId).toBe('proj-1');
    expect(result.assetType).toBe('audio');
    expect(result.storageBucket).toBe('project-audio');
    expect(result.uploadedBy).toBe('user-1');
    expect(mockSupabaseFrom).toHaveBeenCalledWith('project_assets');
  });

  it('[register] 元数据插入失败时回滚 Storage | rolls back storage when metadata insert fails', async () => {
    const chain = createQueryChain({ data: null, error: new Error('insert-failed') });
    mockSupabaseFrom.mockReturnValue(chain);

    await expect(service.register({
      projectId: 'proj-1',
      assetType: 'audio',
      fileName: 'recording.wav',
      data: new Blob(['audio data'], { type: 'audio/wav' }),
      uploadedBy: 'user-1',
    })).rejects.toThrow('insert-failed');

    const { removeProjectAsset } = await import('../../integrations/supabase/storage');
    expect(removeProjectAsset).toHaveBeenCalledWith('project-audio', 'proj-1/audio-abc123/file.wav');
  });

  it('[list] 返回资产列表并映射字段 | returns mapped asset list', async () => {
    const rows = [makeAssetRow(), makeAssetRow({ id: 'asset-2', asset_type: 'attachment' })];
    const chain = createQueryChain({ data: rows, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.list({ projectId: 'proj-1' });

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('asset-1');
    expect(result[1]!.assetType).toBe('attachment');
  });

  it('[list] 支持 assetType 筛选 | supports assetType filter', async () => {
    const chain = createQueryChain({ data: [], error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    await service.list({ projectId: 'proj-1', assetType: 'audio' });

    expect(chain.eq).toHaveBeenCalledWith('project_id', 'proj-1');
    expect(chain.eq).toHaveBeenCalledWith('asset_type', 'audio');
  });

  it('[getSignedUrl] 委托到 storage 签名函数 | delegates to storage signed URL', async () => {
    const { createSignedProjectAssetUrl } = await import('../../integrations/supabase/storage');
    const url = await service.getSignedUrl({
      storageBucket: 'project-audio',
      storagePath: 'proj-1/audio-abc/file.wav',
    });

    expect(url).toBe('https://example.com/signed-url');
    expect(createSignedProjectAssetUrl).toHaveBeenCalled();
  });

  it('[remove] 删除成功时同时删除元数据与 Storage | removes metadata and storage on success', async () => {
    const row = makeAssetRow();
    const chain = createQueryChain({ data: row, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    await service.remove('asset-1');

    const { removeProjectAsset } = await import('../../integrations/supabase/storage');
    expect(removeProjectAsset).toHaveBeenCalledWith('project-audio', 'proj-1/audio-abc/file.wav');
  });

  it('[remove] Storage 删除失败时补回元数据 | restores metadata when storage deletion fails', async () => {
    const row = makeAssetRow();
    const chain = createQueryChain({ data: row, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const { removeProjectAsset } = await import('../../integrations/supabase/storage');
    const mockedRemoveProjectAsset = vi.mocked(removeProjectAsset);
    mockedRemoveProjectAsset.mockRejectedValueOnce(new Error('storage-down'));

    await expect(service.remove('asset-1')).rejects.toThrow('storage-down');
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'asset-1',
      project_id: 'proj-1',
      storage_path: 'proj-1/audio-abc/file.wav',
      created_at: '2026-04-17T00:00:00.000Z',
    }));
  });
});

// ── CollaborationSnapshotService（扩展部分） ──

describe('CollaborationSnapshotService (Phase 6 extensions)', () => {
  let service: CollaborationSnapshotService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CollaborationSnapshotService();
  });

  it('[registerSnapshot] 插入快照元数据并返回映射记录 | inserts and returns mapped record', async () => {
    const row = makeSnapshotRow();
    const chain = createQueryChain({ data: row, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.registerSnapshot({
      projectId: 'proj-1',
      version: 5,
      schemaVersion: 1,
      createdBy: 'user-1',
      changeCursor: 42,
      note: 'manual save',
      storage: {
        snapshotStorageBucket: 'project-exports',
        snapshotStoragePath: 'proj-1/snapshot-v5/snapshot-v5-12345.json',
        checksum: 'ff001122',
        sizeBytes: 2048,
      },
    });

    expect(result.projectId).toBe('proj-1');
    expect(result.version).toBe(5);
    expect(result.changeCursor).toBe(42);
    expect(result.note).toBe('manual save');
    expect(mockSupabaseFrom).toHaveBeenCalledWith('project_snapshots');
  });

  it('[createSnapshotVersion] 注册失败时回滚 Storage | rolls back storage if metadata register fails', async () => {
    const chain = createQueryChain({ data: null, error: new Error('snapshot-insert-failed') });
    mockSupabaseFrom.mockReturnValue(chain);

    await expect(service.createSnapshotVersion({
      projectId: 'proj-1',
      version: 7,
      payloadJson: '{"state":"x"}',
      schemaVersion: 1,
      createdBy: 'user-1',
      changeCursor: 88,
    })).rejects.toThrow('snapshot-insert-failed');

    const { removeProjectAsset } = await import('../../integrations/supabase/storage');
    expect(removeProjectAsset).toHaveBeenCalledWith('project-exports', 'proj-1/audio-abc123/file.wav');
  });

  it('[listSnapshots] 返回按版本倒序的快照列表 | returns snapshots ordered by version desc', async () => {
    const rows = [
      makeSnapshotRow({ id: 'snap-2', version: 6 }),
      makeSnapshotRow({ id: 'snap-1', version: 5 }),
    ];
    const chain = createQueryChain({ data: rows, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.listSnapshots({ projectId: 'proj-1' });

    expect(result).toHaveLength(2);
    expect(result[0]!.version).toBe(6);
    expect(result[1]!.version).toBe(5);
    expect(chain.order).toHaveBeenCalledWith('version', { ascending: false });
  });

  it('[downloadSnapshotById] checksum 匹配时返回正文 | returns payload when checksum matches', async () => {
    const expectedPayloadJson = '{"entities":[]}';
    const row = makeSnapshotRow({ checksum: await computeSnapshotChecksum(expectedPayloadJson) });
    const chain = createQueryChain({ data: row, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const mockBlob = new Blob([expectedPayloadJson], { type: 'application/json' });
    mockSupabaseStorage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
    });

    const { record, payloadJson: restoredPayloadJson } = await service.downloadSnapshotById('snap-1');

    expect(record.id).toBe('snap-1');
    expect(restoredPayloadJson).toBe(expectedPayloadJson);
  });

  it('[downloadSnapshotById] checksum 不匹配时报错 | throws on checksum mismatch', async () => {
    const row = makeSnapshotRow({ checksum: 'deadbeef' });
    const chain = createQueryChain({ data: row, error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const mockBlob = new Blob(['{"entities":[]}'], { type: 'application/json' });
    mockSupabaseStorage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: mockBlob, error: null }),
    });

    await expect(service.downloadSnapshotById('snap-1')).rejects.toThrow('Snapshot checksum mismatch');
  });

  it('[uploadSnapshot] 保留原有功能：上传并返回存储元数据 | preserves original upload behavior', async () => {
    const { uploadProjectAsset } = await import('../../integrations/supabase/storage');

    const result = await service.uploadSnapshot({
      projectId: 'proj-1',
      version: 3,
      payloadJson: '{"data":"test"}',
    });

    expect(result.snapshotStorageBucket).toBe('project-exports');
    expect(result.checksum).toBeTruthy();
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(uploadProjectAsset).toHaveBeenCalled();
  });
});

// ── CollaborationAuditLogService ──

describe('CollaborationAuditLogService', () => {
  let service: CollaborationAuditLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CollaborationAuditLogService();
  });

  it('[queryTimeline] 返回映射后的变更列表与总数 | returns mapped changes with total', async () => {
    const rows = [makeChangeRow(), makeChangeRow({ id: 'ch-2', project_revision: 11 })];
    const chain = createQueryChain({ data: rows, error: null, count: 2 });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.queryTimeline({ projectId: 'proj-1' });

    expect(result.changes).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.changes[0]!.projectId).toBe('proj-1');
    expect(result.changes[0]!.opType).toBe('upsert_text');
    expect(mockSupabaseFrom).toHaveBeenCalledWith('project_changes');
  });

  it('[queryTimeline] 丢弃非法枚举行（与 Realtime 校验一致）| drops invalid enum rows like realtime parser', async () => {
    const rows = [
      makeChangeRow(),
      makeChangeRow({ id: 'ch-bad', op_type: 'not-a-real-op' }),
    ];
    const chain = createQueryChain({ data: rows, error: null, count: 2 });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.queryTimeline({ projectId: 'proj-1' });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.id).toBe('ch-1');
  });

  it('[queryTimeline] 支持多维筛选 | supports multi-dimensional filters', async () => {
    const chain = createQueryChain({ data: [], error: null, count: 0 });
    mockSupabaseFrom.mockReturnValue(chain);

    await service.queryTimeline({
      projectId: 'proj-1',
      entityType: 'layer',
      opType: 'upsert_layer',
      actorId: 'user-1',
      since: '2026-04-01T00:00:00Z',
      until: '2026-04-17T23:59:59Z',
      sinceRevision: 5,
    });

    expect(chain.eq).toHaveBeenCalledWith('project_id', 'proj-1');
    expect(chain.eq).toHaveBeenCalledWith('entity_type', 'layer');
    expect(chain.eq).toHaveBeenCalledWith('op_type', 'upsert_layer');
    expect(chain.eq).toHaveBeenCalledWith('actor_id', 'user-1');
    expect(chain.gte).toHaveBeenCalledWith('created_at', '2026-04-01T00:00:00Z');
    expect(chain.lte).toHaveBeenCalledWith('created_at', '2026-04-17T23:59:59Z');
    expect(chain.gte).toHaveBeenCalledWith('project_revision', 5);
  });

  it('[queryTimeline] 省略可选筛选时不调用对应 filter | omits unused filters', async () => {
    const chain = createQueryChain({ data: [], error: null, count: 0 });
    mockSupabaseFrom.mockReturnValue(chain);

    await service.queryTimeline({ projectId: 'proj-1' });

    const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toHaveLength(1);
    expect(eqCalls[0]).toEqual(['project_id', 'proj-1']);
  });

  it('[queryEntityHistory] 查询单实体历史并委托 queryTimeline | queries single entity history', async () => {
    const rows = [makeChangeRow()];
    const chain = createQueryChain({ data: rows, error: null, count: 1 });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.queryEntityHistory('proj-1', 'e-1', 20);

    expect(result).toHaveLength(1);
    expect(chain.eq).toHaveBeenCalledWith('entity_id', 'e-1');
  });

  it('[queryEntityHistory] 传入 entityType 时按实体类型过滤 | filters by entityType when provided', async () => {
    const rows = [makeChangeRow()];
    const chain = createQueryChain({ data: rows, error: null, count: 1 });
    mockSupabaseFrom.mockReturnValue(chain);

    await service.queryEntityHistory('proj-1', 'e-1', 20, 'text');

    expect(chain.eq).toHaveBeenCalledWith('entity_type', 'text');
  });

  it('[queryTimeline] 变更行 payload 和可选字段正确映射 | maps optional fields correctly', async () => {
    const row = makeChangeRow({
      payload: { patch: { name: 'updated' } },
      payload_ref_path: 'proj-1/large-payload/ref.json',
      vector_clock: { 'cl-1': 5, 'cl-2': 3 },
    });
    const chain = createQueryChain({ data: [row], error: null, count: 1 });
    mockSupabaseFrom.mockReturnValue(chain);

    const result = await service.queryTimeline({ projectId: 'proj-1' });
    const change = result.changes[0]!;

    expect(change.payload).toEqual({ patch: { name: 'updated' } });
    expect(change.payloadRefPath).toBe('proj-1/large-payload/ref.json');
    expect(change.vectorClock).toEqual({ 'cl-1': 5, 'cl-2': 3 });
  });
});
