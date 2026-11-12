import React, { useState } from "react";
import { Platform, StyleProp, TouchableOpacity, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme/theme";
import { SheetPicker } from "./ui";
import { useAuth } from "../context/AuthContext";
import { blockUser, confirmAction, notice, REPORT_REASONS, ReportReason, reportContent, ReportTarget } from "../firebase/moderationService";

export type MenuAction = { label: string; destructive?: boolean; onPress: () => void };

type Option = { key: string; label: string; sub?: string; run: () => void };

// iOS cannot open a second Modal (or an Alert) while the first is still animating away.
const later = (fn: () => void) => setTimeout(fn, Platform.OS === "ios" ? 450 : 50);

/**
 * The "⋯" button on a club event or notice. Everyone except the author can Report the post or Block its
 * author; the author (and staff, through ownerActions) also get Edit and Delete here.
 */
export default function ContentMenu({
  target,
  ownerActions = [],
  allowBlock = true,
  style,
}: {
  target: ReportTarget;
  ownerActions?: MenuAction[];
  allowBlock?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const mine = !!user?.uid && user.uid === target.createdBy;
  const author = target.createdByName || target.clubName || "this person";

  const sendReport = async (reason: ReportReason) => {
    try {
      await reportContent(target, reason);
      later(() =>
        notice(
          "Thanks for reporting",
          "An admin reviews every report within 24 hours and removes posts that break the community guidelines." +
            (allowBlock && target.createdBy ? `\n\nYou can also block ${author} so you don't see their posts.` : ""),
        ),
      );
    } catch {
      later(() => notice("Couldn't send report", "Check your internet and try again."));
    }
  };

  const confirmBlock = () =>
    confirmAction(
      `Block ${author}?`,
      "You won't see their events or notices any more. You can unblock them from Profile → Blocked people.",
      "Block",
      () => blockUser(target.createdBy!, author).catch(() => notice("Couldn't block", "Check your internet and try again.")),
      true,
    );

  const options: Option[] = [
    ...ownerActions.map((a, i) => ({ key: `own${i}`, label: a.label, run: () => later(a.onPress) })),
    ...(!mine
      ? [
          { key: "report", label: "Report post", sub: "Tell an admin this breaks the guidelines", run: () => later(() => setReasonOpen(true)) },
          ...(allowBlock && target.createdBy
            ? [{ key: "block", label: `Block ${author}`, sub: "Hide everything they post", run: () => later(confirmBlock) }]
            : []),
        ]
      : []),
  ];

  if (options.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setMenuOpen(true)}
        hitSlop={10}
        accessibilityLabel="More options"
        style={[{ paddingHorizontal: 4, paddingVertical: 2 }, style]}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      <SheetPicker
        visible={menuOpen}
        title={target.title || "Options"}
        items={options}
        keyOf={(o) => o.key}
        labelOf={(o) => o.label}
        sublabelOf={(o) => o.sub}
        onPick={(o) => o.run()}
        onClose={() => setMenuOpen(false)}
      />
      <SheetPicker
        visible={reasonOpen}
        title="Why are you reporting this?"
        items={[...REPORT_REASONS]}
        keyOf={(r) => r.key}
        labelOf={(r) => r.label}
        onPick={(r) => sendReport(r.key)}
        onClose={() => setReasonOpen(false)}
      />
    </>
  );
}
