import { useEffect } from 'react';

interface UseBatchOperationPanelShortcutInput {
  setShowBatchOperationPanel: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useBatchOperationPanelShortcut({
  setShowBatchOperationPanel,
}: UseBatchOperationPanelShortcutInput) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )) {
        return;
      }
      const hasMod = event.metaKey || event.ctrlKey;
      if (!hasMod || !event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'b') return;
      event.preventDefault();
      setShowBatchOperationPanel((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setShowBatchOperationPanel]);
}
