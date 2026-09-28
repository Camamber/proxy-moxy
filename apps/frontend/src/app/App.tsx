import { SessionPage } from '../session/SessionPage.tsx';
import { useSessionUid } from './useSessionUid.ts';

export function App() {
  const { uid, newSession } = useSessionUid();
  // `key` remounts the page on session change so no state leaks between sessions.
  return <SessionPage key={uid} uid={uid} onNewSession={newSession} />;
}
