
export interface PlacementHighlights {
  date: string;
  companiesVisited: string;
  offers: string;
  highest: string;
  placementPercent: string;
}

export interface BranchStat {
  branch: string;
  maxPackage: string;
  avgPackage: string;
  median: string;
  placementPercent: string;
}


export const placementHighlights: PlacementHighlights = {
  date: 'May 30, 2026',
  companiesVisited: '75+',
  offers: '100+',
  highest: '54.89 LPA',
  placementPercent: '63.38%',
};


export const branchStats: BranchStat[] = [
  { branch: 'CSE', maxPackage: '51 LPA', avgPackage: '16.69 LPA', median: '20 LPA', placementPercent: '65.75%' },
  { branch: 'ECE', maxPackage: '54.89 LPA', avgPackage: '12.32 LPA', median: '10 LPA', placementPercent: '60.87%' },
  { branch: 'Total', maxPackage: '54.89 LPA', avgPackage: '14.65 LPA', median: '12.25 LPA', placementPercent: '63.38%' },
];