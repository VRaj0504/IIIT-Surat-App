import { readCached, writeCached } from "../firebase/liveCache";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { UserProfile } from "../context/AuthContext";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { subscribeToMyLeaveApplications, excusedSessionSet, LeaveApplication } from "../firebase/leaveService";
import { getMyAttendance, ATTENDANCE_TARGET } from "../firebase/attendanceService";
import { getCurrentSemester } from "../utils/academicInfo";

export function useAttendanceSummary(profile: UserProfile | null, enabled: boolean) {
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;
  const ready = enabled && !!(profile?.enrollmentNumber && profile.branch && profile.admissionYear && semester);
  const [subjects, setSubjects] = useState<CurriculumSubject[] | null>(null);
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [summary, setSummary] = useState<{ overall: number | null; low: number } | null>(null);

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
    readCached<{ overall: number | null; low: number }>(cacheKey).then((v) => v && setSummary((s) => s ?? v));
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
        };
        writeCached(cacheKey, next);
        setSummary(next);
      })
      .catch(() => {});
  }, [ready, subjects, excused, profile, semester, cacheKey]);

  useFocusEffect(load);

  return summary;
}
