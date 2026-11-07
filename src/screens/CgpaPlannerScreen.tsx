import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { colors, spacing } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { getCurrentSemester } from "../utils/academicInfo";
import { subscribeToMyGrades, GradeEntry } from "../firebase/gradesService";
import { subscribeToCurriculum, CurriculumSubject } from "../firebase/curriculumService";
import { POINTS, PICKABLE, pastTotals, whatIf, needed, gradeForPoints } from "../utils/cgpaPlan";
import { Segmented, SelectField, SheetPicker } from "../components/ui";
import LoadingSpinner from "../components/LoadingSpinner";
import PlusGate from "../components/PlusGate";

const TARGETS = Array.from({ length: 17 }, (_, i) => 6 + i * 0.25);
const CGPA_CHOICES = Array.from({ length: 101 }, (_, i) => Math.round((10 - i * 0.05) * 100) / 100);
const CREDIT_CHOICES = Array.from({ length: 191 }, (_, i) => 10 + i);
const norm = (c: string) => String(c ?? "").replace(/\s+/g, "").toUpperCase();

function Planner() {
  const { profile } = useAuth();
  const semester = profile?.admissionYear ? getCurrentSemester(profile.admissionYear, undefined, profile.program) : null;
  const totalSems = profile?.program === "PG" ? 4 : 8;
  const [grades, setGrades] = useState<GradeEntry[] | null>(null);
  const [subjects, setSubjects] = useState<CurriculumSubject[] | null>(null);
  const [mode, setMode] = useState<"whatif" | "target">("whatif");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [target, setTarget] = useState(8);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualCgpa, setManualCgpa] = useState<number | null>(null);
  const [manualCredits, setManualCredits] = useState<number | null>(null);
  const [manualSheet, setManualSheet] = useState<null | "cgpa" | "credits">(null);

  useEffect(() => {
    if (!profile?.enrollmentNumber) {
      setGrades([]);
      return;
    }
    return subscribeToMyGrades(profile.enrollmentNumber, setGrades);
  }, [profile?.enrollmentNumber]);

  useEffect(() => {
    if (!profile?.branch || !semester) {
      setSubjects([]);
      return;
    }
    const unsub = subscribeToCurriculum(profile.branch, semester, setSubjects);
    const t = setTimeout(() => setSubjects((s) => s ?? []), 6000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [profile?.branch, semester]);

  const fromGrades = useMemo(() => pastTotals(grades ?? []), [grades]);
  const noGrades = fromGrades.credits === 0 && (semester ?? 1) > 1;
  const past = useMemo(
    () =>
      noGrades && manualCgpa !== null && manualCredits
        ? { points: manualCgpa * manualCredits, credits: manualCredits }
        : fromGrades,
    [noGrades, manualCgpa, manualCredits, fromGrades],
  );
  const cgpaNow = past.credits ? Math.round((past.points / past.credits) * 100) / 100 : null;

  const current = useMemo(() => {
    const graded = new Set((grades ?? []).map((g) => norm(g.subjectCode)));
    return (subjects ?? [])
      .filter((s) => !graded.has(norm(s.code)))
      .map((s) => ({ code: s.code, name: s.name, credits: s.credits && s.credits > 0 ? s.credits : 3, guessed: !(s.credits && s.credits > 0) }));
  }, [subjects, grades]);

  const semCredits = current.reduce((s, c) => s + c.credits, 0);
  const projected = useMemo(
    () => whatIf(past, current.map((c) => ({ credits: c.credits, grade: picks[c.code] ?? "BB" }))),
    [past, current, picks],
  );
  const need = needed(past, target, semCredits, totalSems - (semester ?? totalSems) + 1);

  if (grades === null || subjects === null) return <LoadingSpinner style={{ flex: 1, backgroundColor: colors.background }} label="Loading your results…" />;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>CGPA planner</Text>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroLabel}>CGPA now</Text>
            <Text style={styles.heroBig}>{cgpaNow?.toFixed(2) ?? "—"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.heroLabel}>{past.credits} credits done</Text>
            <Text style={styles.heroLabel}>Sem {semester}: {semCredits} credits</Text>
          </View>
        </View>
      </View>

      {noGrades && (
        <View style={styles.card}>
          <Text style={styles.answerSub}>
            Your earlier grades aren't in the app yet. Pick your current CGPA and credits done (from your last result) so the planner can work.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <SelectField label="Current CGPA" value={manualCgpa?.toFixed(2) ?? null} placeholder="Pick" onPress={() => setManualSheet("cgpa")} />
            </View>
            <View style={{ flex: 1 }}>
              <SelectField label="Credits done" value={manualCredits ? String(manualCredits) : null} placeholder="Pick" onPress={() => setManualSheet("credits")} />
            </View>
          </View>
          <SheetPicker
            visible={manualSheet === "cgpa"}
            title="Current CGPA"
            items={CGPA_CHOICES}
            keyOf={(x) => x.toFixed(2)}
            labelOf={(x) => x.toFixed(2)}
            selectedKey={manualCgpa?.toFixed(2) ?? null}
            onPick={setManualCgpa}
            onClose={() => setManualSheet(null)}
            searchable
          />
          <SheetPicker
            visible={manualSheet === "credits"}
            title="Credits done"
            items={CREDIT_CHOICES}
            keyOf={(x) => String(x)}
            labelOf={(x) => `${x} credits`}
            selectedKey={manualCredits ? String(manualCredits) : null}
            onPick={setManualCredits}
            onClose={() => setManualSheet(null)}
            searchable
          />
        </View>
      )}

      <Segmented
        options={[
          { value: "whatif", label: "What if" },
          { value: "target", label: "Reach a target" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {current.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>No ungraded subjects this semester. Your planner opens up again when the next semester’s subjects are added.</Text>
        </View>
      ) : mode === "whatif" ? (
        <>
          <View style={styles.resultRow}>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>SGPA this sem</Text>
              <Text style={styles.resultBig}>{projected.sgpa?.toFixed(2) ?? "—"}</Text>
            </View>
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>New CGPA</Text>
              <Text style={styles.resultBig}>{projected.cgpa?.toFixed(2) ?? "—"}</Text>
              {cgpaNow !== null && projected.cgpa !== null ? (
                <Text style={[styles.delta, { color: projected.cgpa >= cgpaNow ? colors.success : colors.danger }]}>
                  {projected.cgpa >= cgpaNow ? "+" : ""}
                  {(projected.cgpa - cgpaNow).toFixed(2)}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.hint}>Pick the grade you expect in each subject.</Text>
          {current.map((c) => {
            const g = picks[c.code] ?? "BB";
            return (
              <View key={c.code} style={styles.card}>
                <View style={styles.subjHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.code}>{c.code}</Text>
                    <Text style={styles.name} numberOfLines={2}>{c.name}</Text>
                  </View>
                  <Text style={styles.cr}>{c.guessed ? "~" : ""}{c.credits} cr</Text>
                </View>
                <View style={styles.chips}>
                  {PICKABLE.map((x) => (
                    <TouchableOpacity
                      key={x}
                      style={[styles.chip, g === x && styles.chipOn, x === "FF" && g !== x && styles.chipFail]}
                      onPress={() => setPicks((p) => ({ ...p, [c.code]: x }))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: g === x }}
                    >
                      <Text style={[styles.chipText, g === x && styles.chipTextOn]}>{x}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </>
      ) : (
        <>
          <SelectField label="Target CGPA" value={target.toFixed(2)} placeholder="Pick a target" onPress={() => setPickerOpen(true)} icon="flag-outline" />
          <View style={styles.card}>
            {need.thisSem === null ? (
              <Text style={styles.empty}>No subjects found for this semester.</Text>
            ) : need.already ? (
              <>
                <Text style={styles.answer}>You’re on track.</Text>
                <Text style={styles.answerSub}>Even DD in every subject this semester keeps your CGPA at {target.toFixed(2)} or above.</Text>
              </>
            ) : need.thisSem <= 10 ? (
              <>
                <Text style={styles.answer}>You need an SGPA of {need.thisSem.toFixed(2)} this semester.</Text>
                <Text style={styles.answerSub}>
                  That’s about {gradeForPoints(need.thisSem)} on average across {current.length} subjects ({semCredits} credits).
                  {need.perSemLater !== null && totalSems - (semester ?? totalSems) > 0
                    ? ` Or an average SGPA of ${need.perSemLater.toFixed(2)} across your remaining ${totalSems - (semester ?? totalSems) + 1} semesters.`
                    : ""}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.answer}>Not reachable this semester alone.</Text>
                <Text style={styles.answerSub}>
                  {need.perSemLater !== null && need.perSemLater <= 10 && totalSems - (semester ?? totalSems) > 0
                    ? `You’d need an average SGPA of ${need.perSemLater.toFixed(2)} across your remaining ${totalSems - (semester ?? totalSems) + 1} semesters.`
                    : "Even all AA grades from here won’t get there. Try a lower target."}
                </Text>
              </>
            )}
          </View>
          <Text style={styles.hint}>Later semesters are assumed to have about as many credits as this one.</Text>
          <SheetPicker
            visible={pickerOpen}
            title="Target CGPA"
            items={TARGETS}
            keyOf={(t) => t.toFixed(2)}
            labelOf={(t) => t.toFixed(2)}
            selectedKey={target.toFixed(2)}
            onPick={(t) => {
              setTarget(t);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        </>
      )}
      <Text style={styles.hint}>
        Grade points: {Object.entries(POINTS).map(([g, p]) => `${g} ${p}`).join(" · ")}. FF earns no credits. Estimates only; your official CGPA is in Transcript.
      </Text>
    </ScrollView>
  );
}

export default function CgpaPlannerScreen() {
  return (
    <PlusGate title="CGPA planner" sub="See what your CGPA becomes with the grades you expect, or what SGPA you need to hit your target.">
      <Planner />
    </PlusGate>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: spacing.xl * 2, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  hero: { backgroundColor: colors.primary, borderRadius: 24, padding: 20 },
  kicker: { fontSize: 12, fontWeight: "800", color: colors.onPrimary, opacity: 0.8, letterSpacing: 0.4, textTransform: "uppercase" },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 },
  heroLabel: { fontSize: 12, fontWeight: "600", color: colors.onPrimary, opacity: 0.85 },
  heroBig: { fontSize: 40, fontWeight: "800", color: colors.onPrimary, letterSpacing: -1 },
  resultRow: { flexDirection: "row", gap: 12 },
  resultBox: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 16, alignItems: "center" },
  resultLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  resultBig: { fontSize: 30, fontWeight: "800", color: colors.primary, marginTop: 2 },
  delta: { fontSize: 13, fontWeight: "800", marginTop: 2 },
  hint: { fontSize: 12, fontWeight: "500", color: colors.textSecondary, lineHeight: 18, paddingHorizontal: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 14 },
  subjHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  code: { fontSize: 12, fontWeight: "800", color: colors.primary },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 1 },
  cr: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { minWidth: 40, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.background, alignItems: "center" },
  chipOn: { backgroundColor: colors.primary },
  chipFail: { backgroundColor: colors.dangerBg },
  chipText: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  chipTextOn: { color: colors.onPrimary },
  answer: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  answerSub: { fontSize: 14, fontWeight: "500", color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
  empty: { fontSize: 14, fontWeight: "500", color: colors.textSecondary, lineHeight: 20 },
});
