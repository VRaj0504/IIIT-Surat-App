import { useEffect, useState } from "react";
import {
  APPROVER_ROLES,
  ApproverRole,
  subscribeToLeaveRequestsForFaculty,
  subscribeToMedicalLeavesFor,
  subscribeToMyTeacherAcks,
} from "../firebase/leaveService";
import { subscribeMedicalQueue } from "../firebase/medicalService";

export type FacultyWaiting = { leave: number; acks: number; total: number };

export function useFacultyWaiting(email: string | null | undefined, enabled: boolean): FacultyWaiting | null {
  const [casual, setCasual] = useState<number | null>(null);
  const [medical, setMedical] = useState<Partial<Record<ApproverRole, number>>>({});
  const [acks, setAcks] = useState<number | null>(null);
  const [med2, setMed2] = useState(0);

  useEffect(() => {
    const e = email?.toLowerCase();
    if (!enabled || !e) return;
    const unsubs = [
      subscribeToLeaveRequestsForFaculty(e, (apps) =>
        setCasual(apps.filter((a) => (a.type !== "medical" || !a.stage) && a.status === "pending").length),
      ),
      ...APPROVER_ROLES.map((role) =>
        subscribeToMedicalLeavesFor(role, e, (apps) =>
          setMedical((prev) => ({ ...prev, [role]: apps.filter((a) => a.stage === role).length })),
        ),
      ),
      subscribeToMyTeacherAcks(e, (list) => setAcks(list.filter((a) => a.status === "pending").length)),
      subscribeMedicalQueue(e, (list) => setMed2(list.length)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [email, enabled]);

  if (!enabled || casual === null) return null;
  const leave = casual + med2 + Object.values(medical).reduce((a, b) => a + (b ?? 0), 0);
  const a = acks ?? 0;
  return { leave, acks: a, total: leave + a };
}
