import { createSessionUid, isSessionUid } from '@proxy-moxy/shared';
import { useCallback, useEffect, useState } from 'react';

function uidFromLocation(): string | null {
  const [, first = '', ...rest] = window.location.pathname.split('/');
  return rest.filter(Boolean).length === 0 && isSessionUid(first) ? first : null;
}

/** The session uid lives in the URL (`/:uid`). A missing or invalid one is replaced with a fresh uid. */
export function useSessionUid(): { uid: string; newSession: () => void } {
  const [uid, setUid] = useState(() => uidFromLocation() ?? createSessionUid());

  useEffect(() => {
    if (uidFromLocation() !== uid) window.history.replaceState(null, '', `/${uid}`);
  }, [uid]);

  useEffect(() => {
    const onPopState = () => setUid(uidFromLocation() ?? createSessionUid());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const newSession = useCallback(() => {
    const next = createSessionUid();
    window.history.pushState(null, '', `/${next}`);
    setUid(next);
  }, []);

  return { uid, newSession };
}
