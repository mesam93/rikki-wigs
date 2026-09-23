import { useEffect, useState, type FormEvent } from 'react';
import {
  getGetAdminAvailabilityQueryKey,
  useCreateAdminAppointment,
  useGetAdminAvailability,
  useListServices,
} from '@workspace/api-client-react';

type EmailOutcome = 'delivered' | 'tested' | 'disabled' | 'duplicate' | 'failed';
type EmailStatus = { mode: 'disabled' | 'test' | 'smtp' | 'resend'; configured: boolean; label: string };

function businessToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function displayDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function AdminAppointmentForm({
  initialDay,
  onCreated,
  onCancel,
  emailStatus,
}: {
  initialDay?: string;
  onCreated: (name: string, outcome: EmailOutcome, emailError?: string) => void;
  onCancel: () => void;
  emailStatus?: EmailStatus;
}) {
  const today = businessToday();
  const [form, setForm] = useState({
    service: '', appointmentDate: '', appointmentTime: '',
    name: '', phone: '', email: '', notes: '',
  });
  const [error, setError] = useState('');
  const { data: services, isLoading: servicesLoading, isError: servicesError } = useListServices();
  const bookableServices = services?.filter((service) => service.isBookable && !service.isArchived) ?? [];
  const { data: availableDays, isLoading: availabilityLoading, isError: availabilityError } =
    useGetAdminAvailability({ service: form.service }, { query: {
      queryKey: getGetAdminAvailabilityQueryKey({ service: form.service }),
      enabled: Boolean(form.service),
    } });
  const create = useCreateAdminAppointment();

  useEffect(() => {
    if (initialDay && initialDay >= today && availableDays?.some((day) => day.date === initialDay)) {
      setForm((current) => current.appointmentDate ? current : { ...current, appointmentDate: initialDay });
    }
  }, [availableDays, initialDay, today]);

  const selectedDay = availableDays?.find((day) => day.date === form.appointmentDate);
  const update = (field: keyof typeof form, value: string) => {
    setError('');
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'service' ? { appointmentDate: '', appointmentTime: '' } : {}),
      ...(field === 'appointmentDate' ? { appointmentTime: '' } : {}),
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!selectedDay?.times.includes(form.appointmentTime)) {
      setError('Please choose an available date and time.');
      return;
    }
    try {
      const result = await create.mutateAsync({
        data: { ...form, notes: form.notes.trim() || undefined },
      });
      onCreated(result.appointment.name, result.email.outcome, result.email.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this appointment.');
    }
  };

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <p className="rounded-lg bg-[hsl(var(--secondary))] p-3 text-sm">
        This appointment will be confirmed immediately. Times are shown in New York time.
      </p>
      {emailStatus && (!emailStatus.configured || emailStatus.mode === 'test') && (
        <p role="alert" className="rounded-lg border border-[hsl(var(--destructive)/.35)] p-3 text-sm text-[hsl(var(--destructive))]">
          {emailStatus.label}. You can still confirm the appointment, but no customer email will be sent until delivery is ready.
        </p>
      )}
      <label className="field-label">Service
        <select required value={form.service} onChange={(event) => update('service', event.target.value)} className="field-input">
          <option value="">Select a service</option>
          {bookableServices.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
        </select>
      </label>
      {servicesLoading && <p className="text-sm">Loading services…</p>}
      {servicesError && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">Services could not be loaded.</p>}
      {!servicesLoading && !servicesError && bookableServices.length === 0 && <p className="text-sm">No bookable services are configured.</p>}
      <label className="field-label">Date
        <select required value={form.appointmentDate} disabled={!form.service || availabilityLoading || availabilityError} onChange={(event) => update('appointmentDate', event.target.value)} className="field-input">
          <option value="">Select an available date</option>
          {availableDays?.map((day) => <option key={day.date} value={day.date}>{displayDate(day.date)}</option>)}
        </select>
      </label>
      {availabilityLoading && <p className="text-sm">Checking available times…</p>}
      {availabilityError && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">Availability could not be loaded. Try another service.</p>}
      {form.service && !availabilityLoading && !availabilityError && !availableDays?.length && <p className="text-sm">No openings are available for this service.</p>}
      <label className="field-label">Time
        <select required value={form.appointmentTime} disabled={!selectedDay} onChange={(event) => update('appointmentTime', event.target.value)} className="field-input">
          <option value="">Select a time</option>
          {selectedDay?.times.map((time) => <option key={time} value={time}>{time}</option>)}
        </select>
      </label>
      <label className="field-label">Customer name
        <input className="field-input" required minLength={2} value={form.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" />
      </label>
      <label className="field-label">Phone
        <input className="field-input" required minLength={7} type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" />
      </label>
      <label className="field-label">Email for confirmation
        <input className="field-input" required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" />
      </label>
      <label className="field-label">Notes (optional)
        <textarea className="field-input min-h-24" value={form.notes} onChange={(event) => update('notes', event.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={create.isPending || !selectedDay || !form.appointmentTime} className="btn-primary flex-1">
          {create.isPending ? 'Confirming…' : 'Confirm appointment'}
        </button>
        <button type="button" disabled={create.isPending} onClick={onCancel} className="btn-quiet">Cancel</button>
      </div>
    </form>
  );
}