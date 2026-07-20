import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Subject = {
  id: string;
  name: string;
  attended: number;
  total: number;
};

const STORAGE_KEY = 'attendance:subjects';

const defaultSubjects: Subject[] = [
  { id: '1', name: 'Data Structures', attended: 18, total: 22 },
  { id: '2', name: 'Discrete Mathematics', attended: 15, total: 20 },
  { id: '3', name: 'Probability & Statistics', attended: 12, total: 18 },
  { id: '4', name: 'Computer Organization', attended: 20, total: 22 },
];

export function useAttendance() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from disk once on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setSubjects(JSON.parse(raw));
        } else {
          setSubjects(defaultSubjects);
        }
      } catch (e) {
        setSubjects(defaultSubjects);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist any time subjects change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(subjects)).catch(() => {});
  }, [subjects, loaded]);

  const markClass = useCallback((subjectId: string, present: boolean) => {
    setSubjects((prev) =>
      prev.map((s) =>
        s.id === subjectId
          ? { ...s, total: s.total + 1, attended: s.attended + (present ? 1 : 0) }
          : s
      )
    );
  }, []);

  const setCounts = useCallback((subjectId: string, attended: number, total: number) => {
    setSubjects((prev) =>
      prev.map((s) =>
        s.id === subjectId
          ? { ...s, attended: Math.max(0, attended), total: Math.max(0, total) }
          : s
      )
    );
  }, []);

  const addSubject = useCallback((name: string) => {
    setSubjects((prev) => [...prev, { id: Date.now().toString(), name, attended: 0, total: 0 }]);
  }, []);

  const removeSubject = useCallback((subjectId: string) => {
    setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
  }, []);

  const overallPercentage = (() => {
    const totalClasses = subjects.reduce((sum, s) => sum + s.total, 0);
    const totalAttended = subjects.reduce((sum, s) => sum + s.attended, 0);
    return totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 100) : 0;
  })();

  return { subjects, loaded, markClass, setCounts, addSubject, removeSubject, overallPercentage };
}
