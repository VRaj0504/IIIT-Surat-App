import React, { useState } from 'react';
import StartSessionScreen from '../screens/faculty/StartSessionScreen';
import LiveRosterScreen from '../screens/faculty/LiveRosterScreen';

export default function FacultyNavigator() {
  const [activeSession, setActiveSession] = useState<{ id: string; subject: string } | null>(null);

  if (activeSession) {
    return (
      <LiveRosterScreen
        sessionId={activeSession.id}
        subject={activeSession.subject}
        onFinalized={() => setActiveSession(null)}
      />
    );
  }

  return (
    <StartSessionScreen
      onSessionStarted={(sessionId: string, subject: string) => setActiveSession({ id: sessionId, subject })}
    />
  );
}
