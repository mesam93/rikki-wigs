import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type Status = {
  connected: boolean;
  calendarId: string;
  calendars: { id: string; summary: string; primary?: boolean }[];
  failed: number;
  queued: number;
  unsynced: number;
  error: string | null;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Calendar request failed');
  return response.json();
}

export function CalendarSyncPanel() {
  const client = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['calendar-sync'],
    queryFn: () => request<Status>('/api/calendar-sync'),
    refetchInterval: 60_000,
  });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: ['calendar-sync'] });
  const select = async (calendarId: string) => {
    setWorking(true); setMessage('');
    try {
      await request<Status>('/api/calendar-sync', { method: 'PUT', body: JSON.stringify({ calendarId }) });
      setMessage('Calendar selected. Existing events will move automatically; you can also retry now.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not select calendar.'); }
    finally { setWorking(false); }
  };
  const retry = async () => {
    setWorking(true); setMessage('');
    try {
      const result = await request<{ processed: number; failed: number }>('/api/calendar-sync/retry', { method: 'POST' });
      setMessage(`${result.processed} appointments checked${result.processed === 20 ? ' in this batch' : ''}. ${result.failed ? `${result.failed} failed; they will retry automatically.` : result.processed === 20 ? 'Any remaining updates will run automatically.' : 'No failures in this batch.'}`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sync could not run.'); }
    finally { setWorking(false); }
  };
  return <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Google Calendar sync">
    <h2 className="font-editorial text-3xl">Google Calendar sync</h2>
    <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">One-way from this appointment book. Only service, status, time and booking number are shared—never customer notes or contact details.</p>
    {isLoading ? <p className="mt-4 text-sm">Checking connection…</p> : isError ? <p role="alert" className="mt-4 text-sm text-[hsl(var(--destructive))]">Sync status could not be loaded.</p> : data && <>
      <p className={`mt-4 text-sm font-semibold ${data.connected && !data.error ? '' : 'text-[hsl(var(--destructive))]'}`}>
        {data.connected && !data.error ? 'Connected' : 'Connection needs attention'}
        {data.queued > 0 && ` · ${data.queued} queued`}
        {data.failed > 0 && ` · ${data.failed} failed`}
      </p>
      {(data.queued > 0 || data.failed > 0) && <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Calendar updates retry automatically when the connection is available. You can also retry now.</p>}
      {data.error && <p role="alert" className="mt-2 break-words text-sm text-[hsl(var(--destructive))]">{data.error}</p>}
      {data.calendars.length > 0 && <label className="field-label mt-5 max-w-sm">Destination calendar
        <select value={data.calendarId === 'primary' ? data.calendars.find((calendar) => calendar.primary)?.id ?? 'primary' : data.calendarId} onChange={(event) => void select(event.target.value)} disabled={working} className="field-input">
          {data.calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? ' (primary)' : ''}</option>)}
        </select>
      </label>}
      <button type="button" className="btn-primary mt-5" disabled={working || !data.connected || !!data.error} onClick={() => void retry()}>
        {working ? 'Syncing…' : 'Retry now (up to 20)'}
      </button>
    </>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}