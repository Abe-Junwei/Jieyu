/**
 * readModelMeta — Build read-model meta for local context tool results
 * Extracted from localContextToolExecutors.ts
 */

import type { AiLocalToolReadModelMeta, AiPromptContext } from '../chatDomain.types';
import { buildLocalToolReadModelMeta } from '../localContextToolReadModelMeta';

export function buildReadModelMetaWithSource(
  context: AiPromptContext,
  source: AiLocalToolReadModelMeta['source'],
): AiLocalToolReadModelMeta {
  return {
    ...buildLocalToolReadModelMeta(context),
    ...(source ? { source } : {}),
  };
}
