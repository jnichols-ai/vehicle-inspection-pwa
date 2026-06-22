// ISO-8601 week utilities (Monday-start weeks), shared by the API route and the UI.

export function getISOWeek(d: Date): { isoYear: number; isoWeek: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1 ... Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear: date.getUTCFullYear(), isoWeek };
}

export function getMondayOfISOWeek(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (isoWeek - 1) * 7);
  return monday;
}

export function weeksInISOYear(isoYear: number): number {
  return getISOWeek(new Date(Date.UTC(isoYear, 11, 28))).isoWeek;
}

export function weekKey(isoYear: number, isoWeek: number): string {
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

export function dateToWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const { isoYear, isoWeek } = getISOWeek(d);
  return weekKey(isoYear, isoWeek);
}

export function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// All ISO weeks (1..N) for a given ISO year, with Monday/Sunday date bounds and a label.
export function listWeeksOfYear(isoYear: number) {
  const total = weeksInISOYear(isoYear);
  const weeks: { key: string; isoWeek: number; isoYear: number; start: string; end: string; label: string }[] = [];
  for (let w = 1; w <= total; w++) {
    const start = getMondayOfISOWeek(isoYear, w);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    weeks.push({
      key: weekKey(isoYear, w),
      isoWeek: w,
      isoYear,
      start: formatDateUTC(start),
      end: formatDateUTC(end),
      label: `Wk ${w} (${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
    });
  }
  return weeks;
}
