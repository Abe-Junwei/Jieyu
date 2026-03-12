import { useEffect, useState } from 'react';
import { getDb } from '../../db';

type DbState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      dbName: string;
      totalCollections: number;
      collections: string[];
      textCount: number;
      utteranceCount: number;
    }
  | { phase: 'error'; message: string };

export function TranscriptionPage() {
  const [state, setState] = useState<DbState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const db = await getDb();
        const collections = Object.keys(db.collections);
        const [texts, utterances] = await Promise.all([
          db.collections.texts.find().exec(),
          db.collections.utterances.find().exec(),
        ]);

        if (cancelled) return;

        setState({
          phase: 'ready',
          dbName: db.name,
          totalCollections: collections.length,
          collections,
          textCount: texts.length,
          utteranceCount: utterances.length,
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : '未知错误',
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <h2>转写</h2>
      <p>该页面已接入本地数据库，可用于后续音频分段与转写工作流。</p>

      {state.phase === 'loading' && <p className="hint">正在连接本地数据库...</p>}

      {state.phase === 'error' && (
        <p className="error">数据库连接失败：{state.message}</p>
      )}

      {state.phase === 'ready' && (
        <div className="status-grid">
          <div>
            <span className="label">数据库名</span>
            <strong>{state.dbName}</strong>
          </div>
          <div>
            <span className="label">集合总数</span>
            <strong>{state.totalCollections}</strong>
          </div>
          <div>
            <span className="label">Texts 记录数</span>
            <strong>{state.textCount}</strong>
          </div>
          <div>
            <span className="label">Utterances 记录数</span>
            <strong>{state.utteranceCount}</strong>
          </div>

          <div className="full-row">
            <span className="label">已注册集合</span>
            <p>{state.collections.join(', ')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
