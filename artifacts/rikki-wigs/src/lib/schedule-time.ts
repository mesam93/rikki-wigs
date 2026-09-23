type ScheduledAppointment = {
  status: string;
  appointmentDate: string;
  appointmentTime: string;
};

export function appointmentTimeMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;

  return ((period ? hour % 12 + (period === 'PM' ? 12 : 0) : hour) * 60) + minute;
}

export function findNextConfirmedAppointment<T extends ScheduledAppointment>(
  appointments: readonly T[],
  now: Date,
): { appointment: T | undefined; hasInvalidTimes: boolean } {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let next: { appointment: T; day: string; minutes: number } | undefined;
  let hasInvalidTimes = false;

  for (const appointment of appointments) {
    const day = appointment.appointmentDate.slice(0, 10);
    if (appointment.status !== 'confirmed' || day < today) continue;
    const minutes = appointmentTimeMinutes(appointment.appointmentTime);
    if (minutes === null) {
      hasInvalidTimes = true;
      continue;
    }
    if (day === today && minutes < currentMinutes) continue;
    if (!next || day < next.day || (day === next.day && minutes < next.minutes)) {
      next = { appointment, day, minutes };
    }
  }

  return { appointment: next?.appointment, hasInvalidTimes };
}