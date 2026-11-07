import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firestore";
import { placementHighlights, branchStats, PlacementHighlights, BranchStat } from "../data/placement";

export type PlacementStats = {
  highlights: PlacementHighlights;
  branches: BranchStat[];
  link: string | null;
};

export const DEFAULT_PLACEMENT_STATS: PlacementStats = {
  highlights: placementHighlights,
  branches: branchStats,
  link: null,
};

export function subscribeToPlacementStats(onUpdate: (stats: PlacementStats) => void): () => void {
  return onSnapshot(
    doc(db, "config", "placementStats"),
    (snap) => {
      if (!snap.exists()) return onUpdate(DEFAULT_PLACEMENT_STATS);
      const d = snap.data() as Partial<PlacementStats>;
      onUpdate({
        highlights: { ...DEFAULT_PLACEMENT_STATS.highlights, ...(d.highlights ?? {}) },
        branches: Array.isArray(d.branches) && d.branches.length ? d.branches : DEFAULT_PLACEMENT_STATS.branches,
        link: d.link === undefined ? DEFAULT_PLACEMENT_STATS.link : d.link || null,
      });
    },
    () => onUpdate(DEFAULT_PLACEMENT_STATS),
  );
}
