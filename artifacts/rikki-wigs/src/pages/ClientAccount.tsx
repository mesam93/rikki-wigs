import { Link } from "wouter";
import { useClientSession, apiUrl } from "@/hooks/use-client-auth";
import { FileText, Calendar as CalendarIcon, Clock, Download, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

type ClientHistory = {
  email: string;
  appointments: Array<{ id: number; service: string; appointmentDate: string; appointmentTime: string; status: "pending" | "confirmed" }>;
  receipts: Array<{ id: number; orderId: number; receiptNumber: string; issuedAt: string; customerName: string | null; itemCode: string | null }>;
};

export function ClientAccount() {
  const { user, isLoading } = useClientSession();
  const isLoaded = !isLoading;
  const { data: history, isPending, error, refetch } = useQuery<ClientHistory>({
    queryKey: ["client-history", user?.id],
    enabled: Boolean(isLoaded && user?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(apiUrl("/client/history"), { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Your account could not be loaded. Please try again.");
      }
      return res.json() as Promise<ClientHistory>;
    },
  });

  if (!isLoaded || !user || isPending) {
    return (
      <div className="container-rikki py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">
        <div className="skeleton mx-auto h-12 w-12 rounded-full mb-4" />
        Loading your account details...
      </div>
    );
  }

  return (
    <div className="container-rikki py-16 md:py-24">
      <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-[hsl(var(--border))] pb-8">
        <div>
          <p className="eyebrow opacity-55">Client Account</p>
          <h1 className="display-title mt-3 text-4xl">Hello, {user?.firstName || "Lovely"}</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{user?.email}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-8 rounded-xl border border-[hsl(var(--destructive)/.2)] bg-[hsl(var(--destructive)/.05)] p-5 text-sm text-[hsl(var(--destructive))]">
          <p>{error.message}</p>
          <button type="button" className="mt-3 underline" onClick={() => void refetch()}>Try again</button>
        </div>
      )}

      {!error && <div className="grid gap-12 lg:grid-cols-2">
        <section>
          <h2 className="font-editorial text-2xl mb-6">Upcoming Appointments</h2>
          {!history?.appointments?.length ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              <CalendarIcon size={24} className="mx-auto mb-3 opacity-40" />
              You have no upcoming appointments.
              <div className="mt-4">
                <Link href="~/book" className="btn-primary">Book appointment</Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {history.appointments.map(apt => (
                <div key={apt.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm transition-all hover:border-[hsl(var(--primary))]">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] uppercase tracking-wider font-semibold ${
                      apt.status === "confirmed" 
                        ? "bg-[hsl(147,35%,81%)] text-[hsl(150,35%,28%)]" 
                        : "bg-[hsl(42,68%,82%)] text-[hsl(29,70%,35%)]"
                    }`}>
                      {apt.status}
                    </span>
                  </div>
                  <h3 className="font-editorial text-xl">{apt.service}</h3>
                  <div className="mt-4 flex flex-col gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                    <div className="flex items-center gap-2">
                      <CalendarIcon size={14} />
                       {format(new Date(`${apt.appointmentDate.slice(0, 10)}T12:00:00`), "EEEE, MMMM do, yyyy")}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                       {apt.appointmentTime} (New York time)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-editorial text-2xl mb-6">Past Receipts</h2>
          {!history?.receipts?.length ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              <FileText size={24} className="mx-auto mb-3 opacity-40" />
              No past receipts found.
            </div>
          ) : (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm overflow-hidden">
              <div className="divide-y divide-[hsl(var(--border))]">
                {history.receipts.map(receipt => (
                  <div
                    key={receipt.id}
                     className="flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:bg-[hsl(var(--secondary))]"
                  >
                    <div>
                      <p className="font-semibold text-sm">Receipt {receipt.receiptNumber}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        {format(new Date(receipt.issuedAt), "MMM d, yyyy")} {receipt.itemCode ? `• ${receipt.itemCode}` : ""}
                      </p>
                    </div>
                     <div className="flex items-center gap-4">
                       <a href={`/api/client/receipts/${receipt.id}/view`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] hover:underline">View PDF <ChevronRight size={16} /></a>
                       <a href={`/api/client/receipts/${receipt.id}/pdf`} className="flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] hover:underline"><Download size={14} /> Download</a>
                    </div>
                   </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>}
    </div>
  );
}
