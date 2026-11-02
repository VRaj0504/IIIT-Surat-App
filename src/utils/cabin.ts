type TsLike = { toDate?: () => Date; seconds?: number } | Date | null | undefined;

const toDate = (v: TsLike): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return null;
};

export function isInCabin(inCabin?: boolean, inCabinAt?: TsLike, now = new Date()): boolean {
  if (!inCabin) return false;
  const at = toDate(inCabinAt);
  if (!at) return true;
  return at.toDateString() === now.toDateString();
}

export function cabinSince(inCabinAt?: TsLike): string | null {
  const at = toDate(inCabinAt);
  return at ? at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : null;
}
