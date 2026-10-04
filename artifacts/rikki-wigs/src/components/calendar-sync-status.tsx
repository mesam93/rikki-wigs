import { getGetCalendarSyncStatusQueryKey, useGetCalendarSyncStatus, useRetryCalendarSync } from '@workspace/api-client-react';

export function CalendarSyncStatus() {
  const status = useGetCalendarSyncStatus({ query: { queryKey: getGetCalendarSyncStatusQueryKey(), refetchInterval: 30_000, staleTime: 0 } });
  const retry = useRetryCalendarSync({ mutation: { onSuccess: () => { void status.refetch(); } } });
  const data = status.data;
  return (
    <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Google Calendar synchronization">
      <h3 className="font-editorial text-xl">Google Calendar</h3>
      {status.isPending ? <p className="mt-2 text-sm">Checking calendar status…</p>
        : status.isError ? <p className="mt-2 text-sm" role="alert">Calendar status could not be loaded. <button type="button" className="underline" onClick={() => { void status.refetch(); }}>Check again</button></p>
        : data ? <>
          <p className="mt-2 text-sm font-semibold">{data.enabled ? 'Automatic syncing is enabled' : 'Automatic syncing is disabled'}</p>
          {data.disabledReason && <p className="mt-1 text-sm">{data.disabledReason}</p>}
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{data.connected ? 'Calendar connection is available.' : 'Calendar connection is not ready.'}</p>
          {data.error && <p className="mt-1 text-sm" role="alert">{data.error}</p>}
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Queued: {data.queued} · Failed: {data.failed} · Upcoming without a link: {data.unsynced}</p>
          <button type="button" className="editorial-link mt-3 text-sm disabled:opacity-40" disabled={!data.enabled || !data.connected || Boolean(data.error) || retry.isPending} onClick={() => retry.mutate()}>
            {retry.isPending ? 'Retrying…' : 'Retry calendar sync'}
          </button>
          {retry.isError && <p className="mt-2 text-sm" role="alert">The retry did not complete. Check the calendar status before trying again.</p>}
          {retry.isSuccess && <p className="mt-2 text-sm" role="status">Processed {retry.data.processed}; failed {retry.data.failed}.</p>}
        </> : null}
    </section>
  );
}