import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ImagePlus, Quote, Trash2 } from 'lucide-react';

type Testimonial = {
  id: number;
  author: string;
  quote: string;
  isPublished: boolean;
};

type GalleryPhoto = {
  id: number;
  imageUrl: string;
  altText: string;
  caption: string;
  isPublished: boolean;
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => null))?.error || 'Request failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function TestimonialsSection() {
  const { data = [] } = useQuery({
    queryKey: ['testimonials'],
    queryFn: () => request<Testimonial[]>('/api/testimonials'),
  });
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (data.length < 2) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % data.length), 6500);
    return () => window.clearInterval(timer);
  }, [data.length]);
  useEffect(() => setActive((current) => Math.min(current, Math.max(0, data.length - 1))), [data.length]);

  if (!data.length) return null;
  const testimonial = data[active];
  return <section id="testimonials" className="scroll-mt-24 bg-[hsl(var(--secondary))] py-24 md:py-32">
    <div className="container-rikki">
      <div className="mx-auto max-w-4xl text-center">
        <Quote className="mx-auto text-[hsl(var(--primary))]" size={34} strokeWidth={1.25} />
        <p className="eyebrow mt-7 text-[hsl(var(--primary))]">Client words</p>
        <blockquote className="mt-8 font-editorial text-4xl leading-tight md:text-6xl">“{testimonial.quote}”</blockquote>
        <p className="mt-7 text-sm font-semibold uppercase tracking-[.16em]">{testimonial.author}</p>
        {data.length > 1 && <div className="mt-10 flex items-center justify-center gap-5">
          <button type="button" onClick={() => setActive((active - 1 + data.length) % data.length)} className="rounded-full border border-[hsl(var(--border))] p-3" aria-label="Previous testimonial"><ChevronLeft size={18} /></button>
          <div className="flex gap-2">{data.map((item, index) => <button key={item.id} type="button" onClick={() => setActive(index)} className={`h-2 rounded-full transition-all ${index === active ? 'w-7 bg-[hsl(var(--primary))]' : 'w-2 bg-[hsl(var(--primary)/.25)]'}`} aria-label={`Show testimonial ${index + 1}`} />)}</div>
          <button type="button" onClick={() => setActive((active + 1) % data.length)} className="rounded-full border border-[hsl(var(--border))] p-3" aria-label="Next testimonial"><ChevronRight size={18} /></button>
        </div>}
      </div>
    </div>
  </section>;
}

export function GallerySection() {
  const { data = [] } = useQuery({
    queryKey: ['gallery'],
    queryFn: () => request<GalleryPhoto[]>('/api/gallery'),
  });
  if (!data.length) return null;
  return <section id="gallery" className="container-rikki scroll-mt-24 py-24 md:py-32">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><p className="eyebrow text-[hsl(var(--primary))]">The gallery</p><h2 className="display-title mt-4 text-5xl md:text-7xl">Recent <em>work.</em></h2></div>
      <p className="max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">A closer look at custom color, natural finishes, styling, and care from Rikki Wigs.</p>
    </div>
    <div className="mt-12 grid auto-rows-[220px] grid-cols-2 gap-3 md:auto-rows-[300px] md:grid-cols-3">
      {data.map((photo, index) => <figure key={photo.id} className={`group relative overflow-hidden rounded-2xl bg-[hsl(var(--secondary))] ${index % 5 === 0 ? 'row-span-2' : ''}`}>
        <img src={photo.imageUrl} alt={photo.altText || photo.caption || 'Rikki Wigs gallery'} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        {photo.caption && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-4 pt-12 text-sm text-white">{photo.caption}</figcaption>}
      </figure>)}
    </div>
  </section>;
}

export function TestimonialsAdmin() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['admin-testimonials'], queryFn: () => request<Testimonial[]>('/api/admin/testimonials') });
  const [author, setAuthor] = useState('');
  const [quote, setQuote] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await request('/api/admin/testimonials', { method: 'POST', body: JSON.stringify({ author, quote }) });
      setAuthor(''); setQuote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] }),
        queryClient.invalidateQueries({ queryKey: ['testimonials'] }),
      ]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not add testimonial'); }
  };
  const remove = async (id: number) => {
    if (!window.confirm('Remove this testimonial?')) return;
    await request(`/api/admin/testimonials/${id}`, { method: 'DELETE' });
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin-testimonials'] }), queryClient.invalidateQueries({ queryKey: ['testimonials'] })]);
  };
  return <section className="mt-10 grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
    <form onSubmit={(event) => void submit(event)} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <p className="eyebrow opacity-55">Add testimonial</p><h2 className="mt-2 font-editorial text-4xl">Client words</h2>
      <label className="field-label mt-7">Client name<input className="field-input" value={author} onChange={(event) => setAuthor(event.target.value)} required /></label>
      <label className="field-label mt-5">Testimonial<textarea className="field-input min-h-36 resize-y" value={quote} onChange={(event) => setQuote(event.target.value)} required /></label>
      {error && <p className="mt-4 text-sm text-[hsl(var(--destructive))]">{error}</p>}
      <button className="btn-primary mt-6" type="submit">Add testimonial</button>
    </form>
    <div><p className="eyebrow opacity-55">Published testimonials</p>{isLoading ? <div className="skeleton mt-5 h-40" /> : data.length ? <div className="mt-5 space-y-3">{data.map((item) => <article key={item.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"><p className="font-editorial text-2xl">“{item.quote}”</p><div className="mt-4 flex items-center justify-between"><span className="text-sm font-semibold">{item.author}</span><button type="button" onClick={() => void remove(item.id)} className="btn-quiet !px-3 !py-2 !text-[hsl(var(--destructive))]"><Trash2 size={14} /> Remove</button></div></article>)}</div> : <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">No testimonials added yet.</p>}</div>
  </section>;
}

export function GalleryAdmin() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['admin-gallery'], queryFn: () => request<GalleryPhoto[]>('/api/admin/gallery') });
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError('');
    try {
      const upload = await request<{ uploadUrl: string; objectPath: string }>('/api/admin/gallery/upload-url', { method: 'POST', body: JSON.stringify({ contentType: file.type }) });
      const uploaded = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploaded.ok) throw new Error('Image upload failed');
      await request('/api/admin/gallery', { method: 'POST', body: JSON.stringify({ objectPath: upload.objectPath, altText, caption }) });
      setFile(null); setAltText(''); setCaption('');
      const input = document.getElementById('gallery-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin-gallery'] }), queryClient.invalidateQueries({ queryKey: ['gallery'] })]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not upload photo'); }
    finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    if (!window.confirm('Remove this photo from the gallery?')) return;
    await request(`/api/admin/gallery/${id}`, { method: 'DELETE' });
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin-gallery'] }), queryClient.invalidateQueries({ queryKey: ['gallery'] })]);
  };
  return <section className="mt-10">
    <form onSubmit={(event) => void submit(event)} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <div className="flex items-center gap-3"><ImagePlus size={25} /><div><p className="eyebrow opacity-55">Add gallery photo</p><h2 className="mt-1 font-editorial text-3xl">Upload new work</h2></div></div>
      <div className="mt-7 grid gap-5 md:grid-cols-3"><label className="field-label">Image<input id="gallery-file" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="field-input file:mr-3 file:border-0 file:bg-transparent file:font-semibold" /></label><label className="field-label">Alt text<input className="field-input" value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Natural lace wig finish" /></label><label className="field-label">Caption<input className="field-input" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Optional caption" /></label></div>
      {error && <p className="mt-4 text-sm text-[hsl(var(--destructive))]">{error}</p>}
      <button type="submit" disabled={!file || busy} className="btn-primary mt-6 disabled:opacity-45">{busy ? 'Uploading…' : 'Upload photo'}</button>
    </form>
    {isLoading ? <div className="skeleton mt-8 h-56" /> : data.length ? <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">{data.map((photo) => <article key={photo.id} className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><img src={photo.imageUrl} alt={photo.altText} className="aspect-square w-full object-cover" /><div className="p-4"><p className="truncate text-sm">{photo.caption || photo.altText || 'Gallery photo'}</p><button type="button" onClick={() => void remove(photo.id)} className="btn-quiet mt-3 !px-3 !py-2 !text-[hsl(var(--destructive))]"><Trash2 size={14} /> Remove</button></div></article>)}</div> : <div className="mt-8 rounded-xl border border-dashed border-[hsl(var(--border))] p-12 text-center text-sm text-[hsl(var(--muted-foreground))]">No gallery photos uploaded yet.</div>}
  </section>;
}