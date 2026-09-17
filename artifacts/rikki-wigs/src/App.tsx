import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Instagram, Mail, Menu, Phone, Trash2, X, XCircle } from 'lucide-react';
import {
  getGetAppointmentSummaryQueryKey,
  getListAppointmentsQueryKey,
  useCreateAppointment,
  useDeleteAppointment,
  useGetAppointmentSummary,
  useListAppointments,
  useUpdateAppointment,
} from '@workspace/api-client-react';
import type { Appointment } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Calendar } from '@/components/ui/calendar';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const services = ['Lace wig consultation', 'Skin top wig consultation', 'Custom color', 'Styling', 'Repair'];
const statuses = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
const instagramUrl = 'https://www.instagram.com/rikki_wigs/';
const phoneDisplay = '732-742-4559';
const phoneUrl = 'tel:+17327424559';
type TimeWindow = { id: string; start: string; end: string };
type BlockedSlot = { id: string; date: string; startTime: string; endTime: string; reason: string };
type SchedulingSettings = { serviceDurations: Record<string, number>; weeklyHours: Record<string, Record<string, TimeWindow[]>>; blockedSlots: BlockedSlot[] };
type EmailDeliveryStatus = { mode: 'disabled' | 'test' | 'smtp'; configured: boolean; label: string };
const weekdayLabels: Record<string, string> = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' };

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Request failed');
  return response.json();
}

function toDayKey(value: string | Date): string {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return value.slice(0, 10);
}

function formatDay(value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${toDayKey(value)}T12:00:00`).toLocaleDateString(undefined, options);
}

function SiteNav({ manage = false }: { manage?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="relative z-20 border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
      <div className="container-rikki flex items-center justify-between py-4 md:py-3">
        <Link href="/" className="flex w-24 items-center leading-none md:w-1/3" data-testid="link-home-logo" aria-label="Rikki Wigs home">
          <img src="/brand/rikki-header-wordmark.svg" alt="" className="w-full object-contain md:max-w-[180px] xl:max-w-[210px]" />
        </Link>
        <nav className="hidden items-center justify-center gap-9 md:flex md:flex-1" aria-label="Primary navigation">
          {manage ? <Link href="/" className="editorial-link text-base opacity-80 hover:opacity-100" data-testid="link-public-site">View public site</Link> : <>
            <a href="#services" className="editorial-link text-base" data-testid="link-services">Services</a>
            <a href="#story" className="editorial-link text-base" data-testid="link-story">Instagram</a>
            <Link href="/book" className="editorial-link text-base" data-testid="link-nav-book">Book</Link>
          </>}
        </nav>
        <div className="flex items-center gap-3 md:w-1/3 md:justify-end">
          {!manage && <Link href="/manage" className="hidden text-sm opacity-55 transition-opacity hover:opacity-100 xl:block" data-testid="link-manage">Manage appointments</Link>}
          {!manage && <Link href="/book" className="btn-primary hidden whitespace-nowrap !bg-[hsl(var(--accent))] !px-6 !py-3.5 !text-sm !text-[hsl(var(--foreground))] sm:inline-flex" data-testid="button-nav-book">Request appointment <ArrowRight size={15} /></Link>}
          <button className="rounded-full border border-current/20 p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu" data-testid="button-mobile-menu"><Menu size={19} /></button>
        </div>
      </div>
      {menuOpen && <div className="container-rikki pb-5 md:hidden">
        <div className="flex flex-col gap-4 border-t border-current/15 pt-4 text-sm">
          {!manage && <><a href="#services" onClick={() => setMenuOpen(false)} data-testid="link-mobile-services">Services</a><a href="#story" onClick={() => setMenuOpen(false)} data-testid="link-mobile-story">Our story</a></>}
          <Link href={manage ? '/' : '/book'} onClick={() => setMenuOpen(false)} data-testid="link-mobile-action">{manage ? 'View public site' : 'Request appointment'}</Link>
        </div>
      </div>}
    </header>
  );
}

function Home() {
  return <div className="site-shell texture bg-[hsl(var(--background))]">
    <SiteNav />
    <main>
      <section className="relative min-h-[680px] overflow-hidden bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
        <img src="/brand/hero-art.svg" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/10" />
        <div className="container-rikki relative z-10 flex min-h-[680px] items-center py-20 md:py-24">
         <div className="reveal">
          <h1 className="display-title max-w-[620px] text-[clamp(3.7rem,8vw,7.7rem)]">Confidence<br /><em className="text-[hsl(var(--brand-gold))]">starts here.</em></h1>
          <p className="mt-7 max-w-[430px] text-base leading-7 text-white/72">Luxury lace and skin top wigs, custom color, styling, and repairs—designed to look and feel natural.</p>
         </div>
        </div>
      </section>

      <section id="services" className="bg-[hsl(var(--sidebar))] py-24 text-[hsl(var(--sidebar-foreground))] md:py-32">
        <div className="container-rikki">
          <div><h2 className="display-title text-5xl md:text-7xl">Wigs, color,<br /><em>styling & care.</em></h2></div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['/services/lace-wigs.jpg', 'Lace wigs'],
              ['/services/skin-top-wigs.jpg', 'Skin top wigs'],
              ['/services/custom-color.jpg', 'Custom color'],
              ['/services/styling-repairs.jpg', 'Styling & repairs'],
            ].map(([image, title]) => <article key={title} className="group flex overflow-hidden rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.45)] transition-all hover:-translate-y-1 hover:border-[hsl(var(--accent)/.65)] hover:bg-[hsl(var(--sidebar-accent))]">
              <div className="flex w-full flex-col">
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={image} alt={`${title} service at Rikki Wigs`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="flex min-h-48 flex-1 flex-col p-6 text-center">
                  <div className="flex flex-1 items-center justify-center">
                    <h3 className="font-editorial text-3xl">{title}</h3>
                  </div>
                  <Link href="/book" className="mx-auto flex items-center gap-2 pt-5 text-xs font-semibold text-[hsl(var(--accent))]">Request this service <ArrowRight size={14} /></Link>
                </div>
              </div>
            </article>)}
          </div>
        </div>
      </section>

      <section id="story" className="container-rikki grid gap-12 py-24 md:grid-cols-[.8fr_1.2fr] md:py-32">
        <div><p className="eyebrow text-[hsl(var(--primary))]">Follow the work</p><div className="mt-16 hidden h-36 w-36 items-center justify-center rounded-full border border-[hsl(var(--primary))] md:flex"><Instagram className="text-[hsl(var(--primary))]" size={30} strokeWidth={1.2} /></div></div>
        <div>
          <h2 className="display-title max-w-3xl text-5xl md:text-7xl">See the latest <em>on Instagram.</em></h2>
          <div className="mt-9 grid gap-8 text-[hsl(var(--muted-foreground))] md:grid-cols-2">
            <p className="leading-7">The Instagram profile is the best place to see current looks, videos, updates, and the visual identity of Rikki Wigs.</p>
            <p className="leading-7">When you are ready, use the appointment form to share what you are looking for. Rikki can confirm the details with you.</p>
          </div>
          <div className="mt-9"><a href={instagramUrl} target="_blank" rel="noreferrer" className="editorial-link text-sm font-semibold" data-testid="link-story-instagram">Open @rikki_wigs <ArrowRight className="ml-2 inline" size={15} /></a></div>
        </div>
      </section>

      <section className="container-rikki grid gap-10 py-24 md:grid-cols-[1.2fr_.8fr] md:py-32">
        <div className="rounded-[12px_110px_12px_12px] bg-[hsl(var(--secondary))] p-8 md:p-14">
          <p className="eyebrow text-[hsl(var(--primary))]">03 / next step</p><h2 className="display-title mt-12 max-w-lg text-5xl md:text-6xl">Request a time that works for you.</h2>
          <div className="mt-14 grid gap-7 sm:grid-cols-3">
            {[['01', 'Choose a service', 'Select the closest option.'], ['02', 'Request a time', 'Pick an available date and time.'], ['03', 'Wait for confirmation', 'Rikki will follow up directly.']].map(([n, t, c]) => <div key={n}><p className="font-mono-ui text-xs text-[hsl(var(--primary))]">{n}</p><h3 className="mt-3 font-semibold">{t}</h3><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{c}</p></div>)}
          </div>
        </div>
        <div className="flex flex-col justify-end border-t border-[hsl(var(--border))] pt-8 md:border-t-0 md:border-l md:pl-12">
          <p className="font-editorial text-4xl leading-tight">Have a question first? Start with Instagram.</p>
          <a href={instagramUrl} target="_blank" rel="noreferrer" className="editorial-link mt-12 w-fit text-sm font-semibold" data-testid="link-ritual-instagram">Message @rikki_wigs <ArrowRight className="ml-2 inline" size={15} /></a>
        </div>
      </section>
    </main>
    <footer className="border-t border-[hsl(var(--border))] py-10"><div className="container-rikki flex flex-col justify-between gap-8 md:flex-row md:items-end"><div className="flex items-center gap-4"><img src="/brand/rikki-logo-official.svg" alt="" className="h-16 w-16 rounded-full object-contain" /><div><p className="font-editorial text-2xl tracking-[.12em]">RIKKI WIGS</p><p className="mt-2 max-w-[220px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">Luxury wig salon in New Jersey. By appointment.</p></div></div><div className="flex flex-wrap items-center gap-6 text-sm"><a href={phoneUrl} className="editorial-link" data-testid="link-footer-phone">{phoneDisplay}</a><a href={instagramUrl} target="_blank" rel="noreferrer" className="editorial-link" data-testid="link-footer-instagram">Follow @rikki_wigs</a><a href={instagramUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[hsl(var(--border))] p-2" aria-label="Instagram" data-testid="link-instagram"><Instagram size={16} /></a></div></div></footer>
  </div>;
}

function Book() {
  const createAppointment = useCreateAppointment();
  const timeSelectorRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', service: '', appointmentDate: '', appointmentTime: '', notes: '' });
  const { data: availability, isLoading: availabilityLoading, isError: availabilityError } = useQuery({
    queryKey: ['availability', form.service],
    queryFn: () => apiJson<Array<{ date: string; times: string[] }>>(`/api/availability?service=${encodeURIComponent(form.service)}`),
    enabled: Boolean(form.service),
  });
  const selectedDay = availability?.find((day) => toDayKey(day.date) === form.appointmentDate);
  const availableDays = availability ?? [];
  const availableDateKeys = new Set(availableDays.map((day) => toDayKey(day.date)));
  const selectedDate = form.appointmentDate ? new Date(`${form.appointmentDate}T12:00:00`) : undefined;
  const bookingHorizon = new Date();
  bookingHorizon.setDate(bookingHorizon.getDate() + 180);
  const canContinue = step === 1 ? Boolean(form.service) : step === 2 ? Boolean(form.appointmentDate && form.appointmentTime) : Boolean(form.name && form.phone && form.email);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  useEffect(() => {
    if (step !== 2 || !form.appointmentDate) return;
    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      timeSelectorRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [form.appointmentDate, step]);
  const submit = () => {
    setError('');
    createAppointment.mutate({ data: { ...form, notes: form.notes || undefined } }, { onSuccess: () => setSubmitted(true), onError: () => setError('We could not send that just now. Please try again or contact Rikki on Instagram.') });
  };
  if (submitted) return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav /><main className="container-rikki flex min-h-[75vh] items-center justify-center py-16"><div className="max-w-lg text-center reveal"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--accent))]"><Check size={28} /></div><p className="eyebrow mt-8 text-[hsl(var(--primary))]">request received</p><h1 className="display-title mt-4 text-6xl">You are on the list.</h1><p className="mx-auto mt-6 max-w-md leading-7 text-[hsl(var(--muted-foreground))]">Thank you, {form.name.split(' ')[0] || 'lovely'}. Rikki will be in touch shortly to confirm your time and answer any questions.</p><Link href="/" className="btn-primary mt-9" data-testid="button-back-home">Back to Rikki Wigs <ArrowRight size={15} /></Link></div></main></div>;
  return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav /><main className="container-rikki grid gap-12 pb-20 pt-8 md:grid-cols-[.65fr_1.35fr] md:gap-20 md:pt-16">
    <aside><p className="eyebrow text-[hsl(var(--primary))]">appointment request</p><h1 className="display-title mt-5 text-6xl md:text-7xl">Book with<br /><em>Rikki Wigs.</em></h1><p className="mt-7 max-w-xs leading-7 text-[hsl(var(--muted-foreground))]">Choose a service and request an available time. Rikki will contact you to confirm the appointment.</p><div className="mt-12 hidden space-y-5 md:block">{[['01', 'Choose a service'], ['02', 'Find a time'], ['03', 'Submit request']].map(([n, label], index) => <div key={n} className={`flex items-center gap-3 text-sm ${step === index + 1 ? 'font-semibold' : 'opacity-45'}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full font-mono-ui text-[10px] ${step === index + 1 ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-current'}`}>{n}</span>{label}</div>)}</div></aside>
    <section className="max-w-2xl md:pt-4"><div className="mb-8 flex items-center justify-between border-b border-[hsl(var(--border))] pb-4 md:hidden"><span className="eyebrow">step 0{step} of 03</span><span className="text-sm font-semibold">{step === 1 ? 'Service' : step === 2 ? 'Time' : 'Submit'}</span></div>
      {step === 1 && <div className="reveal"><p className="eyebrow opacity-55">Step 01</p><h2 className="font-editorial mt-3 text-4xl">What would you like to request?</h2><div className="mt-8 grid gap-3">{services.map((service) => <button key={service} onClick={() => update('service', service)} className={`flex items-center justify-between rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary))] ${form.service === service ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`} data-testid={`button-service-${service.toLowerCase().replaceAll(' ', '-')}`}><span className="font-semibold">{service}</span>{form.service === service && <CheckCircle2 className="text-[hsl(var(--primary))]" size={20} />}</button>)}</div></div>}
      {step === 2 && <div className="reveal"><p className="eyebrow opacity-55">Step 02</p><h2 className="font-editorial mt-3 text-4xl">When would you like to come in?</h2><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Choose an available date, then select a time.</p>{availabilityLoading ? <div className="skeleton mt-8 h-80 w-full" /> : availabilityError ? <div className="mt-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-sm text-[hsl(var(--muted-foreground))]">Availability could not be loaded. Please go back and try again.</div> : availableDays.length ? <div className="mt-10 w-full"><Calendar mode="single" month={calendarMonth} onMonthChange={setCalendarMonth} selected={selectedDate} onSelect={(date) => { if (!date) return; const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; setCalendarMonth(date); setForm((current) => ({ ...current, appointmentDate: key, appointmentTime: '' })); }} disabled={(date) => { const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; return !availableDateKeys.has(key); }} startMonth={new Date()} endMonth={bookingHorizon} className="w-full !bg-transparent !p-0 [--cell-size:clamp(2.7rem,11vw,4.5rem)]" classNames={{ root: 'w-full', months: 'w-full', month: 'w-full gap-6', month_caption: 'flex h-12 w-full items-center justify-center px-12 font-editorial text-2xl', nav: 'absolute inset-x-0 top-1 flex w-full items-center justify-between', month_grid: 'w-full border-collapse', weekdays: 'flex border-b border-[hsl(var(--border))] pb-3', weekday: 'flex-1 text-center font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]', week: 'mt-3 flex w-full', day: 'relative aspect-square h-full flex-1 p-1 text-center', today: 'rounded-full border border-[hsl(var(--accent))]', disabled: 'text-[hsl(var(--muted-foreground))] opacity-25' }} /></div> : <div className="mt-8 rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No available dates are currently configured for this service.</div>}{form.appointmentDate && <div ref={timeSelectorRef} className="mt-9 scroll-mt-6 border-t border-[hsl(var(--border))] pt-7"><label className="field-label">{formatDay(form.appointmentDate, { weekday: 'long', month: 'long', day: 'numeric' })} · Available times</label>{selectedDay?.times?.length ? <div className="flex flex-wrap gap-2">{selectedDay.times.map((time) => <button key={time} onClick={() => update('appointmentTime', time)} className={`rounded-full border px-4 py-2 text-sm transition-colors ${form.appointmentTime === time ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-transparent hover:border-[hsl(var(--primary))]'}`} data-testid={`button-time-${time.replaceAll(':', '-')}`}>{time}</button>)}</div> : null}</div>}</div>}
      {step === 3 && <div className="reveal"><p className="eyebrow opacity-55">Step 03</p><h2 className="font-editorial mt-3 text-4xl">Submit appointment request.</h2><div className="mt-8 grid gap-5 sm:grid-cols-2"><div><label className="field-label" htmlFor="name">Your name</label><input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} className="field-input" placeholder="First and last" data-testid="input-name" /></div><div><label className="field-label" htmlFor="phone">Phone</label><input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="field-input" placeholder="(555) 000-0000" data-testid="input-phone" /></div><div className="sm:col-span-2"><label className="field-label" htmlFor="email">Email address</label><input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="field-input" placeholder="you@example.com" data-testid="input-email" /></div><div className="sm:col-span-2"><label className="field-label" htmlFor="notes">Anything you want us to know <span className="font-normal opacity-50">(optional)</span></label><textarea id="notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} className="field-input min-h-28 resize-y" placeholder="Tell us about your hair goals, timeline, or questions." data-testid="input-notes" /></div></div></div>}
      {error && <div className="mt-6 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]" role="alert"><XCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
      <div className="mt-10 flex items-center justify-between border-t border-[hsl(var(--border))] pt-6"><button className="editorial-link text-sm font-semibold disabled:opacity-30" onClick={() => setStep((current) => current - 1)} disabled={step === 1} data-testid="button-book-back">Back</button>{step < 3 ? <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setStep((current) => current + 1)} disabled={!canContinue} data-testid="button-book-next">Continue <ArrowRight size={15} /></button> : <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={submit} disabled={!canContinue || createAppointment.isPending} data-testid="button-submit-appointment">{createAppointment.isPending ? 'Sending request…' : 'Send request'} <ArrowRight size={15} /></button>}</div>
    </section>
  </main></div>;
}

function ScheduleSettingsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['scheduling-settings'], queryFn: () => apiJson<SchedulingSettings>('/api/scheduling-settings') });
  const { data: emailStatus, isError: emailStatusError } = useQuery({ queryKey: ['email-status'], queryFn: () => apiJson<EmailDeliveryStatus>('/api/email-status') });
  const [draft, setDraft] = useState<SchedulingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedService, setSelectedService] = useState(services[0]);
  const [block, setBlock] = useState({ date: '', startTime: '10:00', endTime: '11:00', reason: '' });
  useEffect(() => { if (data) setDraft(data); }, [data]);
  if (isLoading || !draft) return <div className="skeleton mt-8 h-64" />;
  if (isError) return <div className="mt-8 rounded-xl border border-[hsl(var(--destructive))] p-5 text-[hsl(var(--destructive))]">Scheduling settings could not be loaded.</div>;
  const save = async (next = draft) => {
    setSaving(true); setMessage('');
    try {
      const saved = await apiJson<SchedulingSettings>('/api/scheduling-settings', { method: 'PUT', body: JSON.stringify(next) });
      setDraft(saved); queryClient.invalidateQueries({ queryKey: ['availability'] }); setMessage('Schedule saved.');
    } catch { setMessage('Could not save the schedule.'); } finally { setSaving(false); }
  };
  const addBlock = () => {
    if (!block.date || !block.startTime || !block.endTime) return;
    const next = { ...draft, blockedSlots: [...draft.blockedSlots, { ...block, id: `${Date.now()}` }] };
    setDraft(next); setBlock({ date: '', startTime: '10:00', endTime: '11:00', reason: '' }); void save(next);
  };
  return <section className="mt-10 space-y-10">
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${emailStatus?.mode === 'smtp' && emailStatus.configured ? 'bg-[hsl(147_35%_45%)]' : emailStatus?.mode === 'test' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted-foreground))]'}`} />
        <div>
          <h2 className="font-editorial text-3xl">Customer emails</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{emailStatusError ? 'Email delivery status could not be loaded.' : emailStatus?.label ?? 'Checking email delivery…'}</p>
          {emailStatus?.mode !== 'smtp' && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Appointments still save normally. Real emails remain off until the client adds their own SMTP settings.</p>}
        </div>
      </div>
    </div>
    <div>
      <h2 className="font-editorial text-4xl">Appointment lengths</h2>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Set how much calendar time each appointment type uses.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{services.map((service) => <label key={service} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm"><span className="font-semibold">{service}</span><span className="mt-3 flex items-center gap-2"><input type="number" min="15" step="15" value={draft.serviceDurations[service] ?? 60} onChange={(e) => setDraft({ ...draft, serviceDurations: { ...draft.serviceDurations, [service]: Number(e.target.value) } })} className="field-input !w-24" /> minutes</span></label>)}</div>
    </div>
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="font-editorial text-4xl">Service availability</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Add multiple appointment windows for each service and day.</p></div><label className="text-sm font-semibold">Appointment type<select value={selectedService} onChange={(e) => setSelectedService(e.target.value)} className="field-input mt-2 min-w-64">{services.map((service) => <option key={service}>{service}</option>)}</select></label></div>
      <div className="mt-5 space-y-3">{Object.entries(weekdayLabels).map(([day, label]) => {
        const windows = draft.weeklyHours[selectedService]?.[day] ?? [];
        const updateWindows = (next: TimeWindow[]) => setDraft({ ...draft, weeklyHours: { ...draft.weeklyHours, [selectedService]: { ...(draft.weeklyHours[selectedService] ?? {}), [day]: next } } });
        return <div key={day} className="grid gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:grid-cols-[130px_1fr]"><div><span className="font-semibold">{label}</span><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{windows.length ? `${windows.length} window${windows.length === 1 ? '' : 's'}` : 'Closed'}</p></div><div className="space-y-2">{windows.map((window) => <div key={window.id} className="flex flex-wrap items-center gap-2"><input type="time" value={window.start} onChange={(e) => updateWindows(windows.map((item) => item.id === window.id ? { ...item, start: e.target.value } : item))} className="field-input !w-auto" /><span className="text-sm">to</span><input type="time" value={window.end} onChange={(e) => updateWindows(windows.map((item) => item.id === window.id ? { ...item, end: e.target.value } : item))} className="field-input !w-auto" /><button onClick={() => updateWindows(windows.filter((item) => item.id !== window.id))} className="btn-quiet !px-3 !py-2 text-xs !text-[hsl(var(--destructive))]">Remove</button></div>)}<button onClick={() => updateWindows([...windows, { id: `${Date.now()}`, start: '10:00', end: '12:00' }])} className="btn-quiet !px-3 !py-2 text-xs">Add time window</button></div></div>;
      })}</div>
    </div>
    <div>
      <h2 className="font-editorial text-4xl">Blocked times</h2>
      <div className="mt-5 grid gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 md:grid-cols-4"><input type="date" value={block.date} onChange={(e) => setBlock({ ...block, date: e.target.value })} className="field-input" /><input type="time" value={block.startTime} onChange={(e) => setBlock({ ...block, startTime: e.target.value })} className="field-input" /><input type="time" value={block.endTime} onChange={(e) => setBlock({ ...block, endTime: e.target.value })} className="field-input" /><input placeholder="Reason (optional)" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} className="field-input" /><button onClick={addBlock} className="btn-primary md:col-span-4">Block this time</button></div>
      <div className="mt-3 space-y-2">{draft.blockedSlots.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-3 text-sm"><span>{item.date} · {item.startTime}–{item.endTime} {item.reason && `· ${item.reason}`}</span><button onClick={() => { const next = { ...draft, blockedSlots: draft.blockedSlots.filter((slot) => slot.id !== item.id) }; setDraft(next); void save(next); }} className="text-[hsl(var(--destructive))]">Remove</button></div>)}</div>
    </div>
    <div className="flex items-center gap-4"><button onClick={() => void save()} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save scheduling settings'}</button>{message && <span className="text-sm">{message}</span>}</div>
  </section>;
}

function Manage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [tab, setTab] = useState<'requests' | 'schedule' | 'calendar'>('requests');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date>();
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetAppointmentSummary();
  const { data: appointments, isLoading, isError } = useListAppointments();
  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() }); };
  const updateStatus = (appointment: Appointment, status: typeof statuses[number]) => updateAppointment.mutate({ id: appointment.id, data: { status } }, { onSuccess: invalidate });
  const reschedule = (appointment: Appointment, appointmentDate: string, appointmentTime: string) => updateAppointment.mutate({ id: appointment.id, data: { appointmentDate, appointmentTime } }, { onSuccess: invalidate });
  const remove = (appointment: Appointment) => { if (window.confirm(`Remove the appointment request from ${appointment.name}?`)) deleteAppointment.mutate({ id: appointment.id }, { onSuccess: invalidate }); };
  const todayKey = toDayKey(new Date());
  const filteredAppointments = useMemo(() => (appointments ?? []).filter((appointment) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return toDayKey(appointment.appointmentDate) >= todayKey && (appointment.status === 'pending' || appointment.status === 'confirmed');
    return appointment.status === filter;
  }), [appointments, filter, todayKey]);
  const confirmedAppointments = useMemo(() => (appointments ?? []).filter((appointment) => appointment.status === 'confirmed'), [appointments]);
  const confirmedDates = useMemo(() => confirmedAppointments.map((appointment) => new Date(`${toDayKey(appointment.appointmentDate)}T12:00:00`)), [confirmedAppointments]);
  const selectedDayAppointments = selectedCalendarDay
    ? confirmedAppointments.filter((appointment) => toDayKey(appointment.appointmentDate) === toDayKey(selectedCalendarDay))
    : [];
  const summaryCards = [
    ['all', 'total', 'All requests'],
    ['pending', 'pending', 'Needs reply'],
    ['confirmed', 'confirmed', 'Confirmed'],
    ['upcoming', 'upcoming', 'Upcoming'],
    ['completed', 'completed', 'Completed'],
    ['cancelled', 'cancelled', 'Cancelled'],
  ] as const;
  const tabs = [['requests', 'Requests'], ['calendar', 'Calendar'], ['schedule', 'Schedule settings']] as const;
  return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav manage /><main className="bg-[hsl(var(--background))]"><div className="container-rikki py-10 md:py-16"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="eyebrow text-[hsl(var(--primary))]">Rikki Wigs / owner view</p><h1 className="display-title mt-4 text-6xl md:text-7xl">Good morning,<br /><em>Rikki.</em></h1></div><div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><span className="status-dot bg-[hsl(147_35%_45%)]" /> Your appointment book</div></div>
       <div className="mt-10 flex overflow-x-auto border-b border-[hsl(var(--border))]" role="tablist" aria-label="Appointment management sections">{tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`shrink-0 px-4 py-3 text-sm font-semibold sm:px-5 ${tab === key ? 'border-b-2 border-[hsl(var(--primary))]' : 'opacity-50'}`} data-testid={`tab-${key}`}>{label}</button>)}</div>
       {tab === 'schedule' ? <ScheduleSettingsPanel /> : tab === 'requests' ? <>
       {summaryError ? <div className="mt-10 rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-4 text-sm text-[hsl(var(--destructive))]" role="alert">Summary is unavailable right now. The appointment list may still load below.</div> : <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{summaryCards.map(([filterKey, summaryKey, label]) => <button key={filterKey} type="button" onClick={() => setFilter(filterKey)} aria-pressed={filter === filterKey} className={`relative rounded-xl border bg-[hsl(var(--card))] p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] ${filter === filterKey ? 'border-[hsl(var(--primary))] shadow-[inset_0_0_0_1px_hsl(var(--primary))]' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/.55)]'}`} data-testid={`button-filter-${filterKey}`}><span className="flex items-center justify-between gap-2"><span className="eyebrow opacity-60">{label}</span>{filter === filterKey && <CheckCircle2 size={16} aria-hidden="true" />}</span>{summaryLoading ? <span className="skeleton mt-3 block h-8 w-14" /> : <span className="mt-2 block font-editorial text-3xl" data-testid={`text-summary-${summaryKey}`}>{summary?.[summaryKey] ?? 0}</span>}<span className="sr-only">{filter === filterKey ? 'Selected filter' : 'Filter requests'}</span></button>)}</div>}
       <div className="mt-12 border-b border-[hsl(var(--border))] pb-4"><p className="eyebrow opacity-55">appointment requests</p><h2 className="mt-2 font-editorial text-3xl">{summaryCards.find(([key]) => key === filter)?.[2]}</h2></div>
       {isError ? <div className="mt-8 rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" role="alert">We could not load appointments. Refresh the page and try again.</div> : isLoading ? <div className="mt-5 space-y-3">{[1, 2, 3].map((item) => <div className="skeleton h-24 w-full" key={item} />)}</div> : filteredAppointments.length ? <div className="mt-5 space-y-3">{filteredAppointments.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} onStatus={updateStatus} onDelete={remove} onReschedule={reschedule} busy={updateAppointment.isPending || deleteAppointment.isPending} />)}</div> : <div className="mt-8 rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center"><CalendarDays className="mx-auto text-[hsl(var(--primary))]" size={28} strokeWidth={1.3} /><h3 className="mt-4 font-editorial text-3xl">Nothing here yet.</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{filter === 'all' ? 'New appointment requests will appear here.' : `There are no ${summaryCards.find(([key]) => key === filter)?.[2].toLowerCase()} appointments.`}</p></div>}</> : <section className="mt-10">
         <div><p className="eyebrow opacity-55">confirmed appointments</p><h2 className="mt-2 font-editorial text-4xl">Calendar</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Choose a marked day to see its confirmed appointments.</p></div>
         {isError ? <div className="mt-8 rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" role="alert">We could not load the calendar. Refresh the page and try again.</div> : isLoading ? <div className="skeleton mt-8 h-96 w-full" /> : confirmedAppointments.length ? <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
           <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-6"><Calendar mode="single" month={calendarMonth} onMonthChange={setCalendarMonth} selected={selectedCalendarDay} onSelect={setSelectedCalendarDay} modifiers={{ confirmed: confirmedDates }} modifiersClassNames={{ confirmed: 'after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-[hsl(var(--primary))]' }} className="w-full !bg-transparent !p-0 [--cell-size:clamp(2.4rem,10vw,4.25rem)]" classNames={{ root: 'w-full', months: 'w-full', month: 'w-full gap-6', month_caption: 'flex h-12 w-full items-center justify-center px-12 font-editorial text-2xl', nav: 'absolute inset-x-0 top-1 flex w-full items-center justify-between', month_grid: 'w-full border-collapse', weekdays: 'flex border-b border-[hsl(var(--border))] pb-3', weekday: 'flex-1 text-center font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]', week: 'mt-2 flex w-full', day: 'relative aspect-square h-full flex-1 p-1 text-center', today: 'rounded-full border border-[hsl(var(--accent))]' }} /></div>
           <aside className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-live="polite"><p className="eyebrow opacity-55">{selectedCalendarDay ? formatDay(selectedCalendarDay, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Selected day'}</p>{!selectedCalendarDay ? <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">Select a day to view appointment details.</p> : selectedDayAppointments.length ? <div className="mt-5 space-y-3">{selectedDayAppointments.map((appointment) => <article key={appointment.id} className="rounded-lg border border-[hsl(var(--border))] p-4"><h3 className="font-semibold">{appointment.name}</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{appointment.service}</p><p className="mt-3 flex items-center gap-2 text-sm"><Clock3 size={15} />{appointment.appointmentTime}</p></article>)}</div> : <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">No confirmed appointments on this day.</p>}</aside>
         </div> : <div className="mt-8 rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center"><CalendarDays className="mx-auto text-[hsl(var(--primary))]" size={28} strokeWidth={1.3} /><h3 className="mt-4 font-editorial text-3xl">No confirmed appointments.</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Approved appointments will appear on this calendar.</p></div>}
       </section>}
    </div></main></div>;
}

function AppointmentRow({ appointment, onStatus, onDelete, onReschedule, busy }: { appointment: Appointment; onStatus: (appointment: Appointment, status: typeof statuses[number]) => void; onDelete: (appointment: Appointment) => void; onReschedule: (appointment: Appointment, date: string, time: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toDayKey(appointment.appointmentDate));
  const [time, setTime] = useState(appointment.appointmentTime);
  return <article className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-shadow hover:shadow-[0_12px_30px_hsl(345_32%_17%/.07)]" data-testid={`card-appointment-${appointment.id}`}><div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-center gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--secondary))] font-editorial text-xl">{appointment.name.charAt(0)}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{appointment.name}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-mono-ui uppercase tracking-wide status-${appointment.status}`}>{appointment.status}</span></div><p className="mt-1 truncate text-sm text-[hsl(var(--muted-foreground))]">{appointment.service} · {appointment.email}</p></div></div><div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2 text-sm"><CalendarDays size={15} />{formatDay(appointment.appointmentDate, { month: 'short', day: 'numeric', year: 'numeric' })} · <Clock3 size={15} />{appointment.appointmentTime}</div><button onClick={() => setOpen(!open)} className="btn-quiet !px-3 !py-2 text-xs">{open ? 'Hide' : 'Manage'} <ChevronDown size={13} /></button></div></div>{open && <div className="border-t border-[hsl(var(--border))] p-5"><div className="grid gap-5 md:grid-cols-3"><div><p className="eyebrow opacity-50">Contact</p><a href={`tel:${appointment.phone}`} className="mt-2 flex items-center gap-2"><Phone size={14} />{appointment.phone}</a><a href={`mailto:${appointment.email}`} className="mt-2 flex items-center gap-2"><Mail size={14} />{appointment.email}</a></div><div><p className="eyebrow opacity-50">Reschedule</p><div className="mt-2 flex flex-wrap gap-2"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input !w-auto" /><input value={time} onChange={(e) => setTime(e.target.value)} className="field-input !w-32" /><button onClick={() => onReschedule(appointment, date, time)} className="btn-quiet !px-3 !py-2 text-xs">Save time</button></div></div><div><p className="eyebrow opacity-50">Decision</p><div className="mt-2 flex flex-wrap gap-2">{appointment.status === 'pending' && <button onClick={() => onStatus(appointment, 'confirmed')} disabled={busy} className="btn-primary !px-3 !py-2 text-xs"><Check size={13} /> Approve</button>}{appointment.status === 'confirmed' && <button onClick={() => onStatus(appointment, 'completed')} disabled={busy} className="btn-primary !px-3 !py-2 text-xs"><CheckCircle2 size={13} /> Complete</button>}{appointment.status !== 'cancelled' && appointment.status !== 'completed' && <button onClick={() => onStatus(appointment, 'cancelled')} disabled={busy} className="btn-quiet !px-3 !py-2 text-xs"><X size={13} /> Decline</button>}<button onClick={() => onDelete(appointment)} disabled={busy} className="btn-quiet !px-3 !py-2 text-xs !text-[hsl(var(--destructive))]"><Trash2 size={13} /> Delete</button></div></div></div>{appointment.notes && <p className="mt-5 border-t border-[hsl(var(--border))] pt-4 text-sm"><strong>Notes:</strong> {appointment.notes}</p>}</div>}</article>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route path="/book" component={Book} /><Route path="/manage" component={Manage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;