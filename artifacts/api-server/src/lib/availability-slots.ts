export function toMinutes(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function toDisplayTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const period = hours24 >= 12 ? "PM" : "AM";
  return `${hours24 % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${period}`;
}

function toInputTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

type Interval = { start: number; end: number };
type Window = { start: string; end: string };

export function availableStarts(
  windows: Window[],
  duration: number,
  bookings: Interval[],
  blocks: Interval[],
  earliestStart = 0,
) {
  const starts = new Set<number>();
  const suggestions = new Set<number>();
  const busyIntervals = [...bookings, ...blocks];
  for (const window of windows) {
    const open = toMinutes(window.start);
    const close = toMinutes(window.end);
    for (let start = Math.max(open, earliestStart); start + duration <= close; start++) {
      const end = start + duration;
      if (busyIntervals.some((busy) => start < busy.end && end > busy.start)) continue;
      starts.add(start);
      if ((start - open) % 30 === 0) suggestions.add(start);
    }
  }
  const sorted = [...starts].sort((a, b) => a - b);
  const availableStartRanges: { start: string; end: string }[] = [];
  for (const start of sorted) {
    const last = availableStartRanges.at(-1);
    if (last && toMinutes(last.end) === start - 1) {
      last.end = toInputTime(start);
    } else {
      availableStartRanges.push({ start: toInputTime(start), end: toInputTime(start) });
    }
  }
  if (!suggestions.size && sorted.length) suggestions.add(sorted[0]);
  return {
    times: [...suggestions].sort((a, b) => a - b).map(toDisplayTime),
    availableStartRanges,
  };
}