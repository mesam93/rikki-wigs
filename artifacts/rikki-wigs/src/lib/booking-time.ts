import type { AvailabilityDay } from '@workspace/api-client-react';

export function toInputTime(display: string): string {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/i.exec(display);
  if (!match) return '';
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

export function toDisplayTime(input: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(input);
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function isAvailableTime(day: AvailabilityDay | undefined, time: string): boolean {
  const input = toInputTime(time);
  return Boolean(input && day?.availableStartRanges.some((range) =>
    input >= range.start && input <= range.end,
  ));
}