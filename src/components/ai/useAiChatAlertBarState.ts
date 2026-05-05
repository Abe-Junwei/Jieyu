import { useEffect, useRef, useState } from 'react';

export function useAiChatAlertBarState(alertCount: number) {
  const [showAlertBar, setShowAlertBar] = useState(() => alertCount > 0);
  const prevAlertCountRef = useRef(alertCount);

  useEffect(() => {
    const prev = prevAlertCountRef.current;
    if (prev === 0 && alertCount > 0) {
      setShowAlertBar(true);
    }
    if (alertCount === 0) {
      setShowAlertBar(false);
    }
    prevAlertCountRef.current = alertCount;
  }, [alertCount]);

  return {
    showAlertBar,
    setShowAlertBar,
  };
}
