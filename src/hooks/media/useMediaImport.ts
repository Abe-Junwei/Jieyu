/**
 * useMediaImport - 隐藏 file input ref（实际导入走 AudioImportDialog / projectMediaController）
 */

import { useRef } from 'react';

export function useMediaImport() {
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  return { mediaFileInputRef };
}
