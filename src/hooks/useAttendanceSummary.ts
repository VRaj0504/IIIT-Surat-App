import { readCached, writeCached } from "../firebase/liveCache";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { UserProfile } from "../context/AuthContext";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { subscribeToMyLeaveApplications, excusedSessionSet, LeaveApplication } from "../firebase/leaveService";
import { getMyAttendance, ATTENDANCE_TARGET } from "../firebase/attendanceService";
import { getCurrentSemester } from "../utils/academicInfo";
import { setLowAttendance } from "../utils/webBadges";

export type AttendanceSummary = { overall: number | null; low: number; lowSubjects?: { code: string; name: string; pct: number }[] };

export function useAttendanceSummary(profile: UserProfile | null, enabled: boolean) {
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;
  const ready = enabled && !!(profile?.enrollmentNumber && profile.branch && profile.admissionYear && semester);
  const [subjects, setSubjects] = useState<CurriculumSubject[] | null>(null);
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);

  useEffect(() => {
    if (!ready) return;
    const unsub = subscribeToCurriculum(profile!.branch!, semester!, setSubjects);
    const t = setTimeout(() => setSubjects((s) => s ?? []), 6000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [ready, profile?.branch, semester]);

  useEffect(() => {
    if (!ready || !profile?.uid) return;
    return subscribeToMyLeaveApplications(profile.uid, setLeaves);
  }, [ready, profile?.uid]);

  const excused = useMemo(() => excusedSessionSet(leaves), [leaves]);

  const cacheKey = ready ? `attsum:${profile!.enrollmentNumber}:${semester}` : "";
  useEffect(() => {
    if (!cacheKey) return;
    readCached<AttendanceSummary>(cacheKey).then((v) => {
      if (!v) return;
      setSummary((s) => s ?? v);
      setLowAttendance(v.low);
    });
  }, [cacheKey]);

  const load = useCallback(() => {
    if (!ready || subjects === null) return;
    getMyAttendance({
      enrollmentNumber: profile!.enrollmentNumber!,
      branch: profile!.branch!,
      admissionYear: profile!.admissionYear!,
      section: profile!.section ?? null,
      specialization: profile!.specialization ?? null,
      semester: semester!,
      subjects,
      medicalExcusedSessions: excused,
    })
      .then((rows) => {
        const held = rows.reduce((a, r) => a + r.totalSessions, 0);
        const present = rows.reduce((a, r) => a + r.presentCount, 0);
        const next = {
          overall: held ? Math.round((present / held) * 1000) / 10 : null,
          low: rows.filter((r) => r.percentage < ATTENDANCE_TARGET).length,
          lowSubjects: rows
            .filter((r) => r.percentage < ATTENDANCE_TARGET)
            .sort((a, b) => a.percentage - b.percentage)
            .map((r) => ({ code: r.subjectCode, name: r.subjectName, pct: r.percentage })),
        };
        writeCached(cacheKey, next);
        setSummary(next);
        setLowAttendance(next.low);
      })
      .catch(() => {});
  }, [ready, subjects, excused, profile, semester, cacheKey]);

  useFocusEffect(load);

  return summary;
}
