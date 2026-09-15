import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ArrowDownRight, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Instagram, Mail, Menu, Phone, Trash2, X, XCircle } from 'lucide-react';
import {
  getGetAppointmentSummaryQueryKey,
  getListAppointmentsQueryKey,
  useCreateAppointment,
  useDeleteAppointment,
  useGetAppointmentSummary,
  useGetAvailability,
  useListAppointments,
  useUpdateAppointment,
} from '@workspace/api-client-react';
import type { Appointment } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const services = ['Consultation', 'Wig install', 'Wig styling', 'Other'];
const statuses = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
const instagramUrl = 'https://www.instagram.com/rikki_wigs/';

function toDayKey(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function formatDay(value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${toDayKey(value)}T12:00:00`).toLocaleDateString(undefined, options);
}

function SiteNav({ manage = false }: { manage?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className={`relative z-20 ${manage ? 'bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]' : ''}`}>
      <div className="container-rikki flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-3" data-testid="link-home-logo">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]">R</span>
          <span className="leading-none"><span className="block font-editorial text-xl">rikki</span><span className="eyebrow opacity-60">wigs & hair</span></span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">
          {manage ? <Link href="/" className="editorial-link text-sm opacity-80 hover:opacity-100" data-testid="link-public-site">View public site</Link> : <>
            <a href="#services" className="editorial-link text-sm" data-testid="link-services">Services</a>
            <a href="#story" className="editorial-link text-sm" data-testid="link-story">Our story</a>
            <Link href="/book" className="editorial-link text-sm" data-testid="link-nav-book">Book a fitting</Link>
          </>}
        </nav>
        <div className="flex items-center gap-3">
          {!manage && <Link href="/manage" className="hidden text-xs opacity-55 transition-opacity hover:opacity-100 md:block" data-testid="link-manage">Owner sign in</Link>}
          {!manage && <Link href="/book" className="btn-primary hidden !px-5 !py-3 sm:inline-flex" data-testid="button-nav-book">Request appointment <ArrowRight size={15} /></Link>}
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
      <section className="container-rikki relative grid min-h-[640px] items-center gap-10 pb-16 pt-10 md:grid-cols-[.9fr_1.1fr] md:pb-24 md:pt-16">
        <div className="relative z-10 reveal">
          <p className="eyebrow mb-6 text-[hsl(var(--primary))]">Wigs & hair / Rikki Wigs</p>
          <h1 className="display-title max-w-[620px] text-[clamp(3.7rem,8vw,7.7rem)]">Wigs and hair<br /><em className="text-[hsl(var(--primary))]">by Rikki.</em></h1>
          <p className="mt-7 max-w-[390px] text-base leading-7 text-[hsl(var(--muted-foreground))]">See the latest work on Instagram or request an appointment. Details and availability are confirmed directly with Rikki.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/book" className="btn-primary" data-testid="button-hero-book">Request an appointment <ArrowDownRight size={16} /></Link>
            <a href={instagramUrl} target="_blank" rel="noreferrer" className="editorial-link text-sm font-semibold" data-testid="link-hero-instagram">View Instagram</a>
          </div>
        </div>
        <div className="relative reveal reveal-delay-1">
          <div className="relative flex aspect-[4/5] items-end overflow-hidden rounded-[170px_170px_18px_18px] bg-[hsl(var(--sidebar))] p-8 text-[hsl(var(--sidebar-foreground))] md:p-12">
            <div>
              <p className="eyebrow mb-5 text-[hsl(var(--accent))]">@rikki_wigs</p>
              <p className="font-editorial text-6xl leading-[.9] md:text-8xl">Rikki<br /><em>Wigs</em></p>
              <p className="mt-8 max-w-xs text-sm leading-6 opacity-70">Current work, updates, and visual references live on Instagram.</p>
              <a href={instagramUrl} target="_blank" rel="noreferrer" className="btn-primary mt-8 !bg-[hsl(var(--accent))] !text-[hsl(var(--foreground))]" data-testid="button-hero-instagram"><Instagram size={16} /> Open Instagram</a>
            </div>
          </div>
        </div>
      </section>

      <div className="overflow-hidden border-y border-[hsl(var(--border))] bg-[hsl(var(--primary))] py-3 text-[hsl(var(--primary-foreground))]">
        <div className="marquee-track flex items-center gap-8 whitespace-nowrap font-editorial text-2xl italic"><span>Rikki Wigs</span><span>/</span><span>wigs & hair</span><span>/</span><span>@rikki_wigs</span><span>/</span><span>Rikki Wigs</span><span>/</span><span>wigs & hair</span><span>/</span><span>@rikki_wigs</span></div>
      </div>

      <section id="story" className="container-rikki grid gap-12 py-24 md:grid-cols-[.8fr_1.2fr] md:py-32">
        <div><p className="eyebrow text-[hsl(var(--primary))]">01 / follow the work</p><div className="mt-16 hidden h-36 w-36 items-center justify-center rounded-full border border-[hsl(var(--primary))] md:flex"><Instagram className="text-[hsl(var(--primary))]" size={30} strokeWidth={1.2} /></div></div>
        <div>
          <h2 className="display-title max-w-3xl text-5xl md:text-7xl">See the latest <em>on Instagram.</em></h2>
          <div className="mt-9 grid gap-8 text-[hsl(var(--muted-foreground))] md:grid-cols-2">
            <p className="leading-7">The Instagram profile is the best place to see current looks, videos, updates, and the visual identity of Rikki Wigs.</p>
            <p className="leading-7">When you are ready, use the appointment form to share what you are looking for. Rikki can confirm the details with you.</p>
          </div>
          <div className="mt-9"><a href={instagramUrl} target="_blank" rel="noreferrer" className="editorial-link text-sm font-semibold" data-testid="link-story-instagram">Open @rikki_wigs <ArrowRight className="ml-2 inline" size={15} /></a></div>
        </div>
      </section>

      <section id="services" className="bg-[hsl(var(--sidebar))] py-24 text-[hsl(var(--sidebar-foreground))] md:py-32">
        <div className="container-rikki">
          <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow text-[hsl(var(--accent))]">02 / appointments</p><h2 className="display-title mt-5 text-5xl md:text-7xl">Start with a<br /><em>conversation.</em></h2></div><p className="max-w-[260px] text-sm leading-6 opacity-65">Choose the closest option in the request form. Rikki can confirm the exact service and timing with you.</p></div>
          <div className="mt-16 divide-y divide-[hsl(var(--sidebar-border))] border-y border-[hsl(var(--sidebar-border))]">
            {[
              ['01', 'Consultation', 'Tell us what you are looking for.'],
              ['02', 'Wig install', 'Request an install appointment.'],
              ['03', 'Wig styling', 'Request styling or a refresh.'],
              ['04', 'Other', 'Ask about something not listed.'],
            ].map(([number, title, copy]) => <div key={number} className="group grid gap-4 py-7 transition-colors hover:bg-[hsl(var(--sidebar-accent))] md:grid-cols-[80px_1fr_1fr] md:items-center md:px-5">
              <span className="font-mono-ui text-xs text-[hsl(var(--accent))]">{number}</span><h3 className="font-editorial text-3xl">{title}</h3><p className="max-w-sm text-sm leading-6 opacity-60 md:justify-self-end">{copy}</p>
            </div>)}
          </div>
          <Link href="/book" className="btn-primary mt-10 !bg-[hsl(var(--accent))] !text-[hsl(var(--foreground))]" data-testid="button-services-book">See availability <ArrowRight size={15} /></Link>
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
    <footer className="border-t border-[hsl(var(--border))] py-10"><div className="container-rikki flex flex-col justify-between gap-8 md:flex-row md:items-end"><div><p className="font-editorial text-3xl">Rikki Wigs</p><p className="mt-2 max-w-[220px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">Wigs & hair by Rikki.</p></div><div className="flex items-center gap-6 text-sm"><a href={instagramUrl} target="_blank" rel="noreferrer" className="editorial-link" data-testid="link-footer-instagram">Follow @rikki_wigs</a><a href={instagramUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[hsl(var(--border))] p-2" aria-label="Instagram" data-testid="link-instagram"><Instagram size={16} /></a></div></div></footer>
  </div>;
}

function Book() {
  const { data: availability, isLoading: availabilityLoading, isError: availabilityError } = useGetAvailability();
  const createAppointment = useCreateAppointment();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', service: '', appointmentDate: '', appointmentTime: '', notes: '' });
  const selectedDay = availability?.find((day) => toDayKey(day.date) === form.appointmentDate);
  const availableDays = availability ?? [];
  const canContinue = step === 1 ? Boolean(form.service) : step === 2 ? Boolean(form.appointmentDate && form.appointmentTime) : Boolean(form.name && form.phone && form.email);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = () => {
    setError('');
    createAppointment.mutate({ data: { ...form, notes: form.notes || undefined } }, { onSuccess: () => setSubmitted(true), onError: () => setError('We could not send that just now. Please try again or contact Rikki on Instagram.') });
  };
  if (submitted) return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav /><main className="container-rikki flex min-h-[75vh] items-center justify-center py-16"><div className="max-w-lg text-center reveal"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--accent))]"><Check size={28} /></div><p className="eyebrow mt-8 text-[hsl(var(--primary))]">request received</p><h1 className="display-title mt-4 text-6xl">You are on the list.</h1><p className="mx-auto mt-6 max-w-md leading-7 text-[hsl(var(--muted-foreground))]">Thank you, {form.name.split(' ')[0] || 'lovely'}. Rikki will be in touch shortly to confirm your time and answer any questions.</p><Link href="/" className="btn-primary mt-9" data-testid="button-back-home">Back to Rikki Wigs <ArrowRight size={15} /></Link></div></main></div>;
  return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav /><main className="container-rikki grid gap-12 pb-20 pt-8 md:grid-cols-[.65fr_1.35fr] md:gap-20 md:pt-16">
    <aside><p className="eyebrow text-[hsl(var(--primary))]">your appointment</p><h1 className="display-title mt-5 text-6xl md:text-7xl">Let's find<br /><em>your moment.</em></h1><p className="mt-7 max-w-xs leading-7 text-[hsl(var(--muted-foreground))]">A few thoughtful details and we will take it from here. No commitment until we confirm together.</p><div className="mt-12 hidden space-y-5 md:block">{[['01', 'Choose a service'], ['02', 'Find a time'], ['03', 'Tell us about you']].map(([n, label], index) => <div key={n} className={`flex items-center gap-3 text-sm ${step === index + 1 ? 'font-semibold' : 'opacity-45'}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full font-mono-ui text-[10px] ${step === index + 1 ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-current'}`}>{n}</span>{label}</div>)}</div></aside>
    <section className="max-w-2xl md:pt-4"><div className="mb-8 flex items-center justify-between border-b border-[hsl(var(--border))] pb-4 md:hidden"><span className="eyebrow">step 0{step} of 03</span><span className="text-sm font-semibold">{step === 1 ? 'Service' : step === 2 ? 'Time' : 'Details'}</span></div>
      {step === 1 && <div className="reveal"><p className="eyebrow opacity-55">Step 01</p><h2 className="font-editorial mt-3 text-4xl">What are you dreaming about?</h2><div className="mt-8 grid gap-3">{services.map((service) => <button key={service} onClick={() => update('service', service)} className={`flex items-center justify-between rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary))] ${form.service === service ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`} data-testid={`button-service-${service.toLowerCase().replaceAll(' ', '-')}`}><span><span className="block font-semibold">{service}</span><span className="mt-1 block text-sm text-[hsl(var(--muted-foreground))]">{service === services[0] ? 'Fitting, cut, finish' : service === services[1] ? 'Refresh, re-melt, restyle' : service === services[2] ? 'Secure, natural, styled' : 'Talk it through'}</span></span>{form.service === service && <CheckCircle2 className="text-[hsl(var(--primary))]" size={20} />}</button>)}</div></div>}
      {step === 2 && <div className="reveal"><p className="eyebrow opacity-55">Step 02</p><h2 className="font-editorial mt-3 text-4xl">When would you like to come in?</h2><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Choose a date, then pick an available time.</p>{availabilityLoading ? <div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="skeleton h-20" /><div className="skeleton h-20" /><div className="skeleton h-20" /></div> : availabilityError ? <div className="mt-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-sm text-[hsl(var(--muted-foreground))]">Availability is taking a moment. You can still request a date below, and we will confirm a time with you.</div> : availableDays.length ? <div className="mt-8 grid gap-3 sm:grid-cols-2">{availableDays.map((day) => { const key = toDayKey(day.date); return <button key={key} onClick={() => update('appointmentDate', key)} className={`rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5 ${form.appointmentDate === key ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`} data-testid={`button-date-${key}`}><span className="font-semibold">{formatDay(day.date, { weekday: 'long', month: 'short', day: 'numeric' })}</span><span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">{day.times.length} times available</span></button>; })}</div> : <input type="date" min={new Date().toISOString().split('T')[0]} value={form.appointmentDate} onChange={(event) => update('appointmentDate', event.target.value)} className="field-input mt-8" data-testid="input-appointment-date" />}{form.appointmentDate && <div className="mt-7"><label className="field-label">Available times</label>{selectedDay?.times?.length ? <div className="flex flex-wrap gap-2">{selectedDay.times.map((time) => <button key={time} onClick={() => update('appointmentTime', time)} className={`rounded-full border px-4 py-2 text-sm transition-colors ${form.appointmentTime === time ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary))]'}`} data-testid={`button-time-${time.replaceAll(':', '-')}`}>{time}</button>)}</div> : <input type="time" value={form.appointmentTime} onChange={(event) => update('appointmentTime', event.target.value)} className="field-input" data-testid="input-appointment-time" />}</div>}</div>}
      {step === 3 && <div className="reveal"><p className="eyebrow opacity-55">Step 03</p><h2 className="font-editorial mt-3 text-4xl">A little about you.</h2><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">So we can make your first hello feel personal.</p><div className="mt-8 grid gap-5 sm:grid-cols-2"><div><label className="field-label" htmlFor="name">Your name</label><input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} className="field-input" placeholder="First and last" data-testid="input-name" /></div><div><label className="field-label" htmlFor="phone">Phone</label><input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="field-input" placeholder="(555) 000-0000" data-testid="input-phone" /></div><div className="sm:col-span-2"><label className="field-label" htmlFor="email">Email address</label><input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="field-input" placeholder="you@example.com" data-testid="input-email" /></div><div className="sm:col-span-2"><label className="field-label" htmlFor="notes">Anything you want us to know <span className="font-normal opacity-50">(optional)</span></label><textarea id="notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} className="field-input min-h-28 resize-y" placeholder="Tell us about your hair goals, timeline, or questions." data-testid="input-notes" /></div></div></div>}
      {error && <div className="mt-6 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]" role="alert"><XCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
      <div className="mt-10 flex items-center justify-between border-t border-[hsl(var(--border))] pt-6"><button className="editorial-link text-sm font-semibold disabled:opacity-30" onClick={() => setStep((current) => current - 1)} disabled={step === 1} data-testid="button-book-back">Back</button>{step < 3 ? <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setStep((current) => current + 1)} disabled={!canContinue} data-testid="button-book-next">Continue <ArrowRight size={15} /></button> : <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={submit} disabled={!canContinue || createAppointment.isPending} data-testid="button-submit-appointment">{createAppointment.isPending ? 'Sending request…' : 'Send request'} <ArrowRight size={15} /></button>}</div>
    </section>
  </main></div>;
}

function Manage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetAppointmentSummary();
  const { data: appointments, isLoading, isError } = useListAppointments(filter ? { status: filter as typeof statuses[number] } : undefined);
  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() }); };
  const updateStatus = (appointment: Appointment, status: typeof statuses[number]) => updateAppointment.mutate({ id: appointment.id, data: { status } }, { onSuccess: invalidate });
  const remove = (appointment: Appointment) => { if (window.confirm(`Remove the appointment request from ${appointment.name}?`)) deleteAppointment.mutate({ id: appointment.id }, { onSuccess: invalidate }); };
  return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav manage /><main className="bg-[hsl(var(--background))]"><div className="container-rikki py-10 md:py-16"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="eyebrow text-[hsl(var(--primary))]">Rikki Wigs / owner view</p><h1 className="display-title mt-4 text-6xl md:text-7xl">Good morning,<br /><em>Rikki.</em></h1></div><div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><span className="status-dot bg-[hsl(147_35%_45%)]" /> Your appointment book</div></div>
      {summaryError ? <div className="mt-10 rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-4 text-sm text-[hsl(var(--destructive))]" role="alert">Summary is unavailable right now. The appointment list may still load below.</div> : <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-6">{[['total', 'All requests'], ['pending', 'Needs reply'], ['confirmed', 'Confirmed'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([key, label]) => <div key={key} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"><p className="eyebrow opacity-55">{label}</p>{summaryLoading ? <div className="skeleton mt-3 h-8 w-14" /> : <p className="mt-2 font-editorial text-3xl" data-testid={`text-summary-${key}`}>{summary?.[key as keyof typeof summary] ?? 0}</p>}</div>)}</div>}
      <div className="mt-14 flex flex-col justify-between gap-4 border-b border-[hsl(var(--border))] pb-4 sm:flex-row sm:items-center"><div><p className="eyebrow opacity-55">appointment requests</p><h2 className="mt-2 font-editorial text-3xl">Your calendar, at a glance</h2></div><div className="relative"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="field-input min-w-44 appearance-none !py-2.5 pr-9 text-sm" aria-label="Filter appointments" data-testid="select-status-filter"><option value="">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3" size={15} /></div></div>
      {isError ? <div className="mt-8 rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" role="alert">We could not load appointments. Refresh the page and try again.</div> : isLoading ? <div className="mt-5 space-y-3">{[1, 2, 3].map((item) => <div className="skeleton h-24 w-full" key={item} />)}</div> : appointments?.length ? <div className="mt-5 space-y-3">{appointments.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} onStatus={updateStatus} onDelete={remove} busy={updateAppointment.isPending || deleteAppointment.isPending} />)}</div> : <div className="mt-8 rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center"><CalendarDays className="mx-auto text-[hsl(var(--primary))]" size={28} strokeWidth={1.3} /><h3 className="mt-4 font-editorial text-3xl">Nothing here yet.</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{filter ? 'Try viewing all statuses.' : 'New appointment requests will appear here.'}</p></div>}
    </div></main></div>;
}

function AppointmentRow({ appointment, onStatus, onDelete, busy }: { appointment: Appointment; onStatus: (appointment: Appointment, status: typeof statuses[number]) => void; onDelete: (appointment: Appointment) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return <article className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-shadow hover:shadow-[0_12px_30px_hsl(345_32%_17%/.07)]" data-testid={`card-appointment-${appointment.id}`}><div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-center gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--secondary))] font-editorial text-xl">{appointment.name.charAt(0)}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold" data-testid={`text-appointment-name-${appointment.id}`}>{appointment.name}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-mono-ui uppercase tracking-wide status-${appointment.status}`} data-testid={`status-appointment-${appointment.id}`}>{appointment.status}</span></div><p className="mt-1 truncate text-sm text-[hsl(var(--muted-foreground))]">{appointment.service} <span className="mx-1 opacity-40">/</span> {appointment.email}</p></div></div><div className="flex flex-wrap items-center gap-3 md:justify-end"><div className="mr-2 flex items-center gap-2 text-sm"><CalendarDays size={15} className="text-[hsl(var(--primary))]" />{formatDay(appointment.appointmentDate, { month: 'short', day: 'numeric', year: 'numeric' })}<span className="opacity-40">·</span><Clock3 size={15} className="text-[hsl(var(--primary))]" />{appointment.appointmentTime}</div><button onClick={() => setOpen(!open)} className="btn-quiet !px-3 !py-2 text-xs" data-testid={`button-details-${appointment.id}`}>{open ? 'Hide' : 'Details'} <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} /></button></div></div>{open && <div className="border-t border-[hsl(var(--border))] px-5 pb-5 pt-4"><div className="grid gap-4 text-sm md:grid-cols-3"><div><p className="eyebrow opacity-50">Contact</p><a href={`tel:${appointment.phone}`} className="mt-2 flex items-center gap-2 editorial-link" data-testid={`link-phone-${appointment.id}`}><Phone size={14} />{appointment.phone}</a><a href={`mailto:${appointment.email}`} className="mt-2 flex items-center gap-2 editorial-link" data-testid={`link-email-${appointment.id}`}><Mail size={14} />{appointment.email}</a></div><div><p className="eyebrow opacity-50">Notes</p><p className="mt-2 leading-6 text-[hsl(var(--muted-foreground))]">{appointment.notes || 'No notes left by client.'}</p></div><div><p className="eyebrow opacity-50">Update status</p><div className="mt-2 flex flex-wrap gap-2">{appointment.status === 'pending' && <button onClick={() => onStatus(appointment, 'confirmed')} disabled={busy} className="btn-primary !px-3 !py-2 text-xs" data-testid={`button-confirm-${appointment.id}`}><Check size={13} /> Confirm</button>}{appointment.status === 'confirmed' && <button onClick={() => onStatus(appointment, 'completed')} disabled={busy} className="btn-primary !px-3 !py-2 text-xs" data-testid={`button-complete-${appointment.id}`}><CheckCircle2 size={13} /> Complete</button>}{appointment.status !== 'cancelled' && appointment.status !== 'completed' && <button onClick={() => onStatus(appointment, 'cancelled')} disabled={busy} className="btn-quiet !px-3 !py-2 text-xs" data-testid={`button-cancel-${appointment.id}`}><X size={13} /> Cancel</button>}<button onClick={() => onDelete(appointment)} disabled={busy} className="btn-quiet !px-3 !py-2 text-xs !text-[hsl(var(--destructive))]" data-testid={`button-delete-${appointment.id}`}><Trash2 size={13} /> Delete</button></div></div></div></div>}</article>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route path="/book" component={Book} /><Route path="/manage" component={Manage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;