import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter';
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Instagram, LockKeyhole, Mail, Menu, Phone, Trash2, UserRound, X, XCircle } from 'lucide-react';
import {
  getGetAppointmentSummaryQueryKey,
  getListAppointmentsQueryKey,
  useListServices,
  useCreateAppointment,
  useDeleteAppointment,
  useGetAppointmentSummary,
  useListAppointments,
  useUpdateAppointment,
} from '@workspace/api-client-react';
import type { Appointment } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Calendar } from '@/components/ui/calendar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GalleryAdmin, GallerySection, TestimonialsAdmin, TestimonialsSection } from '@/components/site-content';
import { ServicesAdmin } from '@/components/services-admin';
import { OrdersAdmin } from '@/components/orders-admin';
import { findNextConfirmedAppointment } from '@/lib/schedule-time';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const statuses = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
const instagramUrl = 'https://www.instagram.com/rikki_wigs/';
const phoneDisplay = '732-742-4559';
const phoneUrl = 'tel:+17327424559';
const whatsappUrl = 'https://wa.me/17327424559';

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.075-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.437-9.884 9.892-9.884a9.82 9.82 0 0 1 7.021 2.91 9.83 9.83 0 0 1 2.898 7.026c-.003 5.45-4.438 9.881-9.927 9.881m8.413-18.297A11.82 11.82 0 0 0 12.055 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.689 1.448h.005C18.614 23.794 23.95 18.459 23.953 11.9a11.82 11.82 0 0 0-3.489-8.412Z" />
  </svg>;
}
type BlockedSlot = { id: string; date: string; startTime: string; endTime: string; reason: string };
type SchedulingSettings = { blockedSlots: BlockedSlot[] };
type EmailDeliveryStatus = { mode: 'disabled' | 'test' | 'smtp'; configured: boolean; label: string };

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
             <a href="/#services" className="editorial-link text-base" data-testid="link-services">Services</a>
             <a href="/#testimonials" className="editorial-link text-base" data-testid="link-testimonials">Testimonials</a>
             <a href="/#gallery" className="editorial-link text-base" data-testid="link-gallery">Gallery</a>
             <Link href="/book" className="whitespace-nowrap rounded-full bg-[hsl(var(--accent))] px-5 py-2.5 text-sm font-semibold !text-[hsl(var(--foreground))] transition-colors hover:bg-white" data-testid="link-nav-book">Book appointment</Link>
          </>}
        </nav>
        <div className="flex items-center gap-3 md:w-1/3 md:justify-end">
          {!manage && <Link href="/login" className="hidden rounded-full border border-white bg-white px-5 py-2.5 text-sm font-semibold !text-black transition-colors hover:bg-black hover:!text-white sm:inline-flex" data-testid="link-login">Log in</Link>}
          {manage && <LogoutButton />}
          <button className="rounded-full border border-current/20 p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu" data-testid="button-mobile-menu"><Menu size={19} /></button>
        </div>
      </div>
      {menuOpen && <div className="container-rikki pb-5 md:hidden">
        <div className="flex flex-col gap-4 border-t border-current/15 pt-4 text-sm">
          {!manage && <><a href="/#services" onClick={() => setMenuOpen(false)} data-testid="link-mobile-services">Services</a><a href="/#testimonials" onClick={() => setMenuOpen(false)} data-testid="link-mobile-testimonials">Testimonials</a><a href="/#gallery" onClick={() => setMenuOpen(false)} data-testid="link-mobile-gallery">Gallery</a><Link href="/book" onClick={() => setMenuOpen(false)} className="w-fit rounded-full bg-[hsl(var(--accent))] px-4 py-2 font-semibold text-[hsl(var(--foreground))]">Book appointment</Link><Link href="/login" onClick={() => setMenuOpen(false)}>Log in</Link></>}
          {manage && <Link href="/" onClick={() => setMenuOpen(false)} data-testid="link-mobile-action">View public site</Link>}
        </div>
      </div>}
    </header>
  );
}

function LogoutButton() {
  const [, setLocation] = useLocation();
  const logout = async () => {
    await fetch('/api/admin-logout', { method: 'POST' });
    queryClient.clear();
    setLocation('/');
  };
  return <button type="button" onClick={() => void logout()} className="rounded-full border border-white/35 px-4 py-2 text-sm font-semibold text-white hover:bg-white hover:text-black">Log out</button>;
}

function LoginLanding() {
  return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav /><main className="container-rikki py-16 md:py-24"><div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2"><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 md:p-9"><UserRound size={28} strokeWidth={1.5} /><p className="eyebrow mt-7 opacity-55">Client</p><h2 className="mt-3 font-editorial text-4xl">Client account</h2><p className="mt-4 min-h-12 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Client appointments and account access will be available in the next phase.</p><button type="button" disabled className="mt-8 w-full rounded-full border border-[hsl(var(--border))] px-5 py-3 text-sm font-semibold opacity-45">Coming soon</button></section><section className="rounded-2xl bg-black p-7 text-white md:p-9"><LockKeyhole size={28} strokeWidth={1.5} /><p className="eyebrow mt-7 text-white/55">Admin</p><h2 className="mt-3 font-editorial text-4xl">Rikki’s dashboard</h2><p className="mt-4 min-h-12 text-sm leading-6 text-white/65">Private access for the approved Rikki Wigs administrator only.</p><Link href="/sign-in" className="mt-8 flex w-full items-center justify-center rounded-full border border-white bg-white px-5 py-3 text-sm font-semibold !text-black transition-colors hover:bg-black hover:!text-white">Admin log in</Link></section></div></main></div>;
}

function SignInPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiJson<{ role: 'admin' }>('/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      queryClient.clear();
      setLocation('/manage');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav /><main className="container-rikki flex justify-center py-12 md:py-20"><form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 shadow-sm md:p-10"><img src="/brand/rikki-logo-official.svg" alt="Rikki Wigs" className="mx-auto h-20 w-20" /><p className="eyebrow mt-7 text-center opacity-55">Admin access</p><h1 className="mt-3 text-center font-editorial text-4xl">Welcome back</h1><p className="mt-3 text-center text-sm text-[hsl(var(--muted-foreground))]">Enter the admin email and password.</p><label className="field-label mt-8">Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="field-input" /></label><label className="field-label mt-5">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="field-input" /></label>{error && <p role="alert" className="mt-5 rounded-lg bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error}</p>}<button type="submit" disabled={submitting} className="btn-primary mt-7 w-full">{submitting ? 'Logging in…' : 'Log in'}</button></form></main></div>;
}

function AdminManageRoute() {
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin-session', { signal: controller.signal })
      .then((response) => {
        setAccessState(response.ok ? 'allowed' : 'denied');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setAccessState('denied');
        }
      });

    return () => controller.abort();
  }, []);

  if (accessState === 'checking') {
    return <div className="site-shell flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))]"><div className="text-center"><div className="skeleton mx-auto h-12 w-12 rounded-full" /><p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Checking access…</p></div></div>;
  }
  if (accessState === 'denied') return <Redirect to="/sign-in" />;
  return <Manage />;
}

function Home() {
  const { data: allServices = [], isLoading: servicesLoading, isError: servicesError } = useListServices();
  const serviceCards = allServices.filter((service) => service.isVisible && !service.isArchived);
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
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {servicesLoading ? [1, 2, 3, 4, 5].map((item) => <div key={item} className="skeleton aspect-[3/4] rounded-2xl opacity-20" />) : servicesError ? <div className="col-span-full rounded-xl border border-[hsl(var(--sidebar-border))] p-6 text-sm opacity-75">Services could not be loaded right now.</div> : serviceCards.map((service) => <article key={service.id} className="group flex overflow-hidden rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.45)] transition-all hover:-translate-y-1 hover:border-[hsl(var(--accent)/.65)] hover:bg-[hsl(var(--sidebar-accent))]">
              <div className="flex w-full flex-col">
                <div className="aspect-[4/3] overflow-hidden">
                  {service.imageUrl ? <img src={service.imageUrl} alt={service.altText} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center bg-[hsl(var(--sidebar-accent))] text-xs uppercase tracking-[.18em] opacity-50">Rikki Wigs</div>}
                </div>
                <div className="flex min-h-48 flex-1 flex-col p-6 text-center">
                  <div className="flex flex-1 items-center justify-center">
                    <h3 className="font-editorial text-3xl">{service.name}</h3>
                  </div>
                  {service.isBookable ? <Link href={`/book?service=${encodeURIComponent(service.name)}`} className="mx-auto flex items-center gap-2 pt-5 text-xs font-semibold text-[hsl(var(--accent))]">Request this service <ArrowRight size={14} /></Link> : <a href={phoneUrl} className="mx-auto flex items-center gap-2 pt-5 text-xs font-semibold text-[hsl(var(--accent))]">Call about this service <ArrowRight size={14} /></a>}
                </div>
              </div>
            </article>)}
          </div>
        </div>
      </section>

      <GallerySection />
      <TestimonialsSection />
    </main>
    <footer id="contact" className="scroll-mt-24 border-t border-[hsl(var(--border))] py-10"><div className="container-rikki flex flex-col justify-between gap-8 md:flex-row md:items-end"><div className="flex items-center gap-4"><img src="/brand/rikki-logo-official.svg" alt="" className="h-16 w-16 rounded-full object-contain" /><div><p className="font-editorial text-2xl tracking-[.12em]">RIKKI WIGS</p><p className="mt-2 max-w-[220px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">Luxury wig salon in New Jersey. By appointment.</p></div></div><div className="flex flex-wrap items-center gap-6 text-sm"><a href={phoneUrl} className="editorial-link" data-testid="link-footer-phone">{phoneDisplay}</a><a href={instagramUrl} target="_blank" rel="noreferrer" className="editorial-link" data-testid="link-footer-instagram">Follow @rikki_wigs</a><a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[hsl(var(--border))] p-2 transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]" aria-label="Contact Rikki Wigs on WhatsApp" data-testid="link-whatsapp"><WhatsAppIcon /></a><a href={instagramUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[hsl(var(--border))] p-2" aria-label="Instagram" data-testid="link-instagram"><Instagram size={16} /></a></div></div></footer>
  </div>;
}

function Book() {
  const createAppointment = useCreateAppointment();
  const { data: allServices = [], isLoading: servicesLoading, isError: servicesError } = useListServices();
  const services = allServices.filter((service) => service.isBookable && !service.isArchived);
  const timeSelectorRef = useRef<HTMLDivElement>(null);
  const directLinkHandled = useRef(false);
  const requestedService = new URLSearchParams(window.location.search).get('service') ?? '';
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
    if (directLinkHandled.current || servicesLoading) return;
    directLinkHandled.current = true;
    const matched = services.find((service) => service.name === requestedService && service.isVisible);
    if (matched) {
      setForm((current) => ({ ...current, service: matched.name }));
      setStep(2);
    }
  }, [requestedService, services, servicesLoading]);
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
      {step === 1 && <div className="reveal"><p className="eyebrow opacity-55">Step 01</p><h2 className="font-editorial mt-3 text-4xl">What would you like to request?</h2>{servicesLoading ? <div className="skeleton mt-8 h-64 w-full" /> : servicesError ? <div className="mt-8 rounded-xl border border-[hsl(var(--destructive))] p-5 text-sm text-[hsl(var(--destructive))]">Services could not be loaded. Please refresh and try again.</div> : services.length ? <div className="mt-8 grid gap-3">{services.map((service) => <button key={service.id} onClick={() => { directLinkHandled.current = true; update('service', service.name); }} className={`flex items-center justify-between rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary))] ${form.service === service.name ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`} data-testid={`button-service-${service.name.toLowerCase().replaceAll(' ', '-')}`}><span className="font-semibold">{service.name}</span>{form.service === service.name && <CheckCircle2 className="text-[hsl(var(--primary))]" size={20} />}</button>)}</div> : <div className="mt-8 rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-sm text-[hsl(var(--muted-foreground))]">No services are currently accepting online appointment requests. Please contact Rikki directly.</div>}</div>}
      {step === 2 && <div className="reveal"><p className="eyebrow opacity-55">Step 02</p><h2 className="font-editorial mt-3 text-4xl">When would you like to come in?</h2><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Choose an available date, then select a time.</p>{availabilityLoading ? <div className="skeleton mt-8 h-80 w-full" /> : availabilityError ? <div className="mt-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-sm text-[hsl(var(--muted-foreground))]">Availability could not be loaded. Please go back and try again.</div> : availableDays.length ? <div className="mt-10 w-full"><Calendar mode="single" month={calendarMonth} onMonthChange={setCalendarMonth} selected={selectedDate} onSelect={(date) => { if (!date) return; const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; setCalendarMonth(date); setForm((current) => ({ ...current, appointmentDate: key, appointmentTime: '' })); }} disabled={(date) => { const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; return !availableDateKeys.has(key); }} startMonth={new Date()} endMonth={bookingHorizon} className="w-full !bg-transparent !p-0 [--cell-size:clamp(2.7rem,11vw,4.5rem)]" classNames={{ root: 'w-full', months: 'w-full', month: 'w-full gap-6', month_caption: 'flex h-12 w-full items-center justify-center px-12 font-editorial text-2xl', nav: 'absolute inset-x-0 top-1 flex w-full items-center justify-between', month_grid: 'w-full border-collapse', weekdays: 'flex border-b border-[hsl(var(--border))] pb-3', weekday: 'flex-1 text-center font-mono-ui text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]', week: 'mt-3 flex w-full', day: 'relative aspect-square h-full flex-1 p-1 text-center', today: 'rounded-full border border-[hsl(var(--accent))]', disabled: 'text-[hsl(var(--muted-foreground))] opacity-25' }} /></div> : <div className="mt-8 rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No available dates are currently configured for this service.</div>}{form.appointmentDate && <div ref={timeSelectorRef} className="mt-9 scroll-mt-6 border-t border-[hsl(var(--border))] pt-7"><label className="field-label">{formatDay(form.appointmentDate, { weekday: 'long', month: 'long', day: 'numeric' })} · Available times</label>{selectedDay?.times?.length ? <div className="flex flex-wrap gap-2">{selectedDay.times.map((time) => <button key={time} onClick={() => update('appointmentTime', time)} className={`rounded-full border px-4 py-2 text-sm transition-colors ${form.appointmentTime === time ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-transparent hover:border-[hsl(var(--primary))]'}`} data-testid={`button-time-${time.replaceAll(':', '-')}`}>{time}</button>)}</div> : null}</div>}</div>}
      {step === 3 && <div className="reveal"><p className="eyebrow opacity-55">Step 03</p><h2 className="font-editorial mt-3 text-4xl">Submit appointment request.</h2><div className="mt-8 grid gap-5 sm:grid-cols-2"><div><label className="field-label" htmlFor="name">Your name</label><input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} className="field-input" placeholder="First and last" data-testid="input-name" /></div><div><label className="field-label" htmlFor="phone">Phone</label><input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} className="field-input" placeholder="(555) 000-0000" data-testid="input-phone" /></div><div className="sm:col-span-2"><label className="field-label" htmlFor="email">Email address</label><input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="field-input" placeholder="you@example.com" data-testid="input-email" /></div><div className="sm:col-span-2"><label className="field-label" htmlFor="notes">Anything you want us to know <span className="font-normal opacity-50">(optional)</span></label><textarea id="notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} className="field-input min-h-28 resize-y" placeholder="Tell us about your hair goals, timeline, or questions." data-testid="input-notes" /></div></div></div>}
      {error && <div className="mt-6 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]" role="alert"><XCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
      <div className="mt-10 flex items-center justify-between border-t border-[hsl(var(--border))] pt-6"><button className="editorial-link text-sm font-semibold disabled:opacity-30" onClick={() => setStep((current) => current - 1)} disabled={step === 1} data-testid="button-book-back">Back</button>{step < 3 ? <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setStep((current) => current + 1)} disabled={!canContinue} data-testid="button-book-next">Continue <ArrowRight size={15} /></button> : <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={submit} disabled={!canContinue || createAppointment.isPending} data-testid="button-submit-appointment">{createAppointment.isPending ? 'Sending request…' : 'Send request'} <ArrowRight size={15} /></button>}</div>
    </section>
  </main></div>;
}

function ScheduleSettingsForm() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['scheduling-settings'], queryFn: () => apiJson<SchedulingSettings>('/api/scheduling-settings') });
  const { data: emailStatus, isError: emailStatusError } = useQuery({ queryKey: ['email-status'], queryFn: () => apiJson<EmailDeliveryStatus>('/api/email-status') });
  const [draft, setDraft] = useState<SchedulingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [block, setBlock] = useState({ date: '', startTime: '10:00', endTime: '11:00', reason: '' });
  useEffect(() => { if (data) setDraft(data); }, [data]);

  if (isError) return <div className="mt-4 rounded-xl border border-[hsl(var(--destructive))] p-4 text-[hsl(var(--destructive))]">Settings could not be loaded.</div>;
  if (isLoading || !draft) return <div className="skeleton mt-4 h-64" />;

  const save = async (next = draft) => {
    setSaving(true); setMessage('');
    try {
      const saved = await apiJson<SchedulingSettings>('/api/scheduling-settings', { method: 'PUT', body: JSON.stringify(next) });
      setDraft(saved); queryClient.invalidateQueries({ queryKey: ['availability'] }); setMessage('Schedule saved.');
      return true;
    } catch { setMessage('Could not save the schedule. Please try again.'); return false; } finally { setSaving(false); }
  };
  const addBlock = async () => {
    if (!block.date || !block.startTime || !block.endTime || saving) return;
    const next = { ...draft, blockedSlots: [...draft.blockedSlots, { ...block, id: `${Date.now()}` }] };
    if (await save(next)) setBlock({ date: '', startTime: '10:00', endTime: '11:00', reason: '' });
  };

  return <div className="space-y-10">
    <section>
      <h3 className="font-editorial text-2xl">Customer emails</h3>
      <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${emailStatus?.mode === 'smtp' && emailStatus.configured ? 'bg-[hsl(147_35%_45%)]' : emailStatus?.mode === 'test' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--muted-foreground))]'}`} />
          <div>
            <p className="text-sm font-semibold">{emailStatusError ? 'Email status error' : emailStatus?.label ?? 'Checking delivery…'}</p>
            {!emailStatusError && emailStatus?.mode !== 'smtp' && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Appointments save normally. Real emails remain off until SMTP is configured.</p>}
          </div>
        </div>
      </div>
    </section>
    <section>
      <h3 className="font-editorial text-2xl">Blocked times</h3>
      <div className="mt-3 grid gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 md:grid-cols-2">
        <label className="field-label">Date<input type="date" value={block.date} onChange={(e) => setBlock({ ...block, date: e.target.value })} className="field-input" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="field-label">Start<input type="time" value={block.startTime} onChange={(e) => setBlock({ ...block, startTime: e.target.value })} className="field-input" /></label>
          <label className="field-label">End<input type="time" value={block.endTime} onChange={(e) => setBlock({ ...block, endTime: e.target.value })} className="field-input" /></label>
        </div>
        <label className="field-label md:col-span-2">Reason (optional)<input placeholder="Reason (optional)" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} className="field-input" /></label>
        <button type="button" onClick={() => void addBlock()} disabled={saving} className="btn-primary md:col-span-2">Block this time</button>
      </div>
      <div className="mt-3 space-y-2">{draft.blockedSlots.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-3 text-sm"><div><span className="font-semibold">{formatDay(item.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="ml-2 text-[hsl(var(--muted-foreground))]">{item.startTime}–{item.endTime}</span>{item.reason && <div className="text-[hsl(var(--muted-foreground))]">{item.reason}</div>}</div><button type="button" disabled={saving} onClick={() => void save({ ...draft, blockedSlots: draft.blockedSlots.filter((slot) => slot.id !== item.id) })} className="text-xs text-[hsl(var(--destructive))]">Remove</button></div>)}</div>
    </section>
    <div className="flex items-center gap-4 border-t border-[hsl(var(--border))] pt-6"><button onClick={() => void save()} disabled={saving} className="btn-primary w-full">{saving ? 'Saving…' : 'Save changes'}</button></div>
    {message && <p role="status" className="text-center text-sm font-medium">{message}</p>}
  </div>;
}

function SidePanel({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-[100dvh] !w-full !max-w-none flex-col bg-[hsl(var(--background))] p-0 sm:!max-w-md">
        <SheetHeader className="border-b border-[hsl(var(--border))] p-6 pr-14 text-left">
          <SheetTitle className="font-editorial text-2xl">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function ScheduleDashboard() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | undefined>();
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [chosenDateKey, setChosenDateKey] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const { data: appointments, isLoading, isError } = useListAppointments();

  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() });
  };
  const updateStatus = (appointment: Appointment, status: typeof statuses[number]) => updateAppointment.mutate({ id: appointment.id, data: { status } }, { onSuccess: invalidate });
  const reschedule = (appointment: Appointment, appointmentDate: string, appointmentTime: string) => updateAppointment.mutate({ id: appointment.id, data: { appointmentDate, appointmentTime } }, { onSuccess: invalidate });
  const remove = (appointment: Appointment) => { if (window.confirm(`Remove the appointment request from ${appointment.name}?`)) deleteAppointment.mutate({ id: appointment.id }, { onSuccess: invalidate }); };

  const todayKey = toDayKey(new Date());

  const pendingCount = appointments?.filter(a => a.status === 'pending').length ?? 0;
  const todaysConfirmed = appointments?.filter(a => a.status === 'confirmed' && toDayKey(a.appointmentDate) === todayKey) ?? [];
  const { appointment: nextAppointment, hasInvalidTimes } = findNextConfirmedAppointment(appointments ?? [], new Date());

  const pendingDates = useMemo(() => appointments?.filter(a => a.status === 'pending').map(a => new Date(`${toDayKey(a.appointmentDate)}T12:00:00`)) ?? [], [appointments]);
  const confirmedDates = useMemo(() => appointments?.filter(a => a.status === 'confirmed').map(a => new Date(`${toDayKey(a.appointmentDate)}T12:00:00`)) ?? [], [appointments]);

  const filteredAppointments = useMemo(() => (appointments ?? []).filter((appointment) => {
    const dayKey = toDayKey(appointment.appointmentDate);
    const matchesStatus = filter === 'all' || (filter === 'upcoming'
      ? dayKey >= todayKey && (appointment.status === 'pending' || appointment.status === 'confirmed')
      : appointment.status === filter);
    return matchesStatus && (!selectedCalendarDay || dayKey === toDayKey(selectedCalendarDay));
  }), [appointments, filter, selectedCalendarDay, todayKey]);

  const modifiers = {
    pending: pendingDates,
    confirmed: confirmedDates,
    highlighted: hoveredDateKey || chosenDateKey ? [new Date(`${hoveredDateKey ?? chosenDateKey}T12:00:00`)] : [],
  };

  const modifiersClassNames = {
    pending: 'after:absolute after:bottom-1 after:left-[calc(50%-9px)] after:h-1.5 after:w-1.5 after:rounded-full after:bg-[hsl(29_70%_50%)]',
    confirmed: 'before:absolute before:bottom-1 before:right-[calc(50%-9px)] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[hsl(150_35%_40%)]',
    highlighted: '!bg-[hsl(var(--primary)/.08)] !ring-1 !ring-inset !ring-[hsl(var(--primary))]',
  };

  const clearDayFilter = () => setSelectedCalendarDay(undefined);

  return (
    <div className="mt-8 space-y-10">
      {isError && <div className="rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" role="alert">We could not load appointments. Refresh the page and try again. Availability settings are still accessible below.</div>}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
          <p className="eyebrow opacity-60">Pending Requests</p>
           {isLoading ? <div className="skeleton mt-3 h-8 w-16" /> : <div className="mt-2 text-4xl font-editorial">{isError ? '—' : pendingCount}</div>}
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
          <p className="eyebrow opacity-60">Today's Appointments</p>
           {isLoading ? <div className="skeleton mt-3 h-8 w-16" /> : <div className="mt-2 text-4xl font-editorial">{isError ? '—' : todaysConfirmed.length}</div>}
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
          <p className="eyebrow opacity-60">Next Appointment</p>
           {isLoading ? <div className="skeleton mt-3 h-8 w-full" /> : isError ? <p className="mt-2 text-sm">Unavailable</p> :
           nextAppointment ? (
              <div className="mt-2 text-sm">
               <span className="block font-semibold">{nextAppointment.name}</span>
               <span className="text-[hsl(var(--muted-foreground))]">{formatDay(nextAppointment.appointmentDate, { month: 'short', day: 'numeric' })} at {nextAppointment.appointmentTime}</span>
             </div>
           ) : (
             <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No upcoming appointments</div>
           )
          }
           {!isLoading && !isError && hasInvalidTimes && <p className="mt-2 text-xs text-[hsl(var(--destructive))]" role="alert">Some appointment times could not be read.</p>}
        </div>
      </section>

      <section className="grid items-start gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <h2 className="font-editorial text-3xl">Calendar</h2>
             <button type="button" onClick={() => setIsSettingsOpen(true)} className="text-sm font-medium text-[hsl(var(--primary))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]">Edit availability</button>
          </div>

          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
            <Calendar
              mode="single"
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              selected={selectedCalendarDay}
              onSelect={setSelectedCalendarDay}
              modifiers={modifiers}
              modifiersClassNames={modifiersClassNames}
              className="w-full !bg-transparent !p-0 [--cell-size:clamp(2rem,11vw,3rem)] lg:[--cell-size:2.8rem]"
              classNames={{
                root: 'w-full', months: 'w-full', month: 'w-full gap-4',
                month_caption: 'flex h-10 w-full items-center justify-center px-10 font-editorial text-xl',
                nav: 'absolute inset-x-0 top-1 flex w-full items-center justify-between',
                month_grid: 'w-full border-collapse', weekdays: 'flex border-b border-[hsl(var(--border))] pb-2',
                weekday: 'flex-1 text-center font-mono-ui text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]',
                week: 'mt-2 flex w-full',
                day: 'relative aspect-square h-full flex-1 p-1 text-center text-sm transition-colors hover:bg-[hsl(var(--secondary))] rounded-lg focus:outline-none aria-selected:bg-[hsl(var(--primary))] aria-selected:text-[hsl(var(--primary-foreground))]',
                today: 'font-bold text-[hsl(var(--primary))]'
              }}
            />
            <div className="mt-4 flex items-center justify-center gap-4 border-t border-[hsl(var(--border))] pt-3 text-xs text-[hsl(var(--muted-foreground))]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(29_70%_50%)]" /> Pending</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(150_35%_40%)]" /> Confirmed</span>
            </div>
          </div>
        </aside>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-editorial text-3xl">Appointments</h2>
              <div className="mt-2 flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
                {selectedCalendarDay ? (
                  <span className="flex items-center gap-2">
                    Filtering by {formatDay(selectedCalendarDay, { month: 'long', day: 'numeric' })}
                     <button type="button" onClick={clearDayFilter} aria-label="Clear selected day" className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--destructive))] hover:text-white"><X size={12} /></button>
                  </span>
                ) : (
                  <span>Showing all dates</span>
                )}
              </div>
            </div>

            <div className="flex max-w-full overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 text-sm shadow-sm" aria-label="Filter appointments">
              {(['all', 'pending', 'confirmed', 'upcoming', 'completed', 'cancelled'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`capitalize whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${filter === f ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              [1, 2, 3].map((item) => <div className="skeleton h-32 w-full" key={item} />)
             ) : isError ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Appointments are unavailable right now.</p> : filteredAppointments.length ? (
              filteredAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                   onMouseEnter={() => setHoveredDateKey(toDayKey(appointment.appointmentDate))}
                   onMouseLeave={() => setHoveredDateKey(null)}
                   onFocus={() => setHoveredDateKey(toDayKey(appointment.appointmentDate))}
                   onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHoveredDateKey(null); }}
                   onClick={() => { setChosenDateKey(toDayKey(appointment.appointmentDate)); setCalendarMonth(new Date(`${toDayKey(appointment.appointmentDate)}T12:00:00`)); }}
                   className={chosenDateKey === toDayKey(appointment.appointmentDate) ? 'rounded-xl ring-2 ring-[hsl(var(--primary)/.45)]' : ''}
                >
                  <AppointmentRow
                    appointment={appointment}
                    onStatus={updateStatus}
                    onDelete={remove}
                    onReschedule={reschedule}
                    busy={updateAppointment.isPending || deleteAppointment.isPending}
                  />
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center shadow-sm">
                <CalendarDays className="mx-auto text-[hsl(var(--primary))]" size={28} strokeWidth={1.3} />
                <h3 className="mt-4 font-editorial text-2xl">Nothing found</h3>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                   No {filter !== 'all' ? filter : ''} appointments match the current view.
                </p>
                {selectedCalendarDay && (
                  <button onClick={clearDayFilter} className="btn-quiet mt-6">View all dates</button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <SidePanel
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        title="Schedule settings"
        description="Review email delivery and block out calendar time."
      >
        <ScheduleSettingsForm />
      </SidePanel>
    </div>
  );
}

type SiteTab = 'services' | 'testimonials' | 'gallery';
type AdminGroup = 'schedule' | 'orders' | 'site';

const siteTabs = [['services', 'Services'], ['testimonials', 'Testimonials'], ['gallery', 'Gallery']] as const;
const adminGroups = [['schedule', 'Schedule'], ['orders', 'Orders'], ['site', 'Manage Site']] as const;

function AdminTabs<T extends string>({ items, selected, onSelect, label, idPrefix, panelId, primary = false }: {
  items: readonly (readonly [T, string])[];
  selected: T;
  onSelect: (value: T) => void;
  label: string;
  idPrefix: string;
  panelId: string;
  primary?: boolean;
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex(([key]) => key === selected);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    onSelect(items[next][0]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return <div className={`${primary ? 'mt-10' : 'mt-3'} flex overflow-x-auto border-b border-[hsl(var(--border))]`} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
    {items.map(([key, text]) => <button key={key} type="button" role="tab" id={`${idPrefix}-${key}`} aria-selected={selected === key} aria-controls={panelId} tabIndex={selected === key ? 0 : -1} onClick={() => onSelect(key)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] sm:px-5 ${selected === key ? 'border-[hsl(var(--primary))] text-[hsl(var(--foreground))]' : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`} data-testid={primary ? `tab-group-${key}` : `tab-${key}`}>{text}</button>)}
  </div>;
}

function Manage() {
  const [group, setGroup] = useState<AdminGroup>('schedule');
  const [siteTab, setSiteTab] = useState<SiteTab>('services');

  return <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]"><SiteNav manage /><main className="bg-[hsl(var(--background))]"><div className="container-rikki py-10 md:py-16"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="eyebrow text-[hsl(var(--primary))]">Rikki Wigs / owner view</p><h1 className="display-title mt-4 text-6xl md:text-7xl">Good morning,<br /><em>Rikki.</em></h1></div><div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><span className="status-dot bg-[hsl(147_35%_45%)]" /> Your appointment book</div></div>
        <AdminTabs items={adminGroups} selected={group} onSelect={(value: AdminGroup) => setGroup(value)} label="Owner dashboard sections" idPrefix="admin-group" panelId="admin-group-panel" primary />
        <div id="admin-group-panel" role="tabpanel" aria-labelledby={`admin-group-${group}`}>
          {group === 'schedule' ? (
            <ScheduleDashboard />
          ) : group === 'orders' ? (
            <OrdersAdmin />
          ) : (
            <>
              <AdminTabs items={siteTabs} selected={siteTab} onSelect={(value: SiteTab) => setSiteTab(value)} label="Manage Site sections" idPrefix="admin-section" panelId="admin-section-panel" />
              <div id="admin-section-panel" role="tabpanel" aria-labelledby={`admin-section-${siteTab}`}>
                {siteTab === 'services' ? <ServicesAdmin /> : siteTab === 'testimonials' ? <TestimonialsAdmin /> : <GalleryAdmin />}
              </div>
            </>
          )}
        </div>
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
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route path="/book" component={Book} /><Route path="/login" component={LoginLanding} /><Route path="/sign-in/*?" component={SignInPage} /><Route path="/manage" component={AdminManageRoute} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;