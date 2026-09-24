import { useState, ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListAdminServices, 
  getListAdminServicesQueryKey,
  useCreateService, 
  useUpdateService, 
  useArchiveService,
  useRequestServiceUploadUrl, 
  getListServicesQueryKey
} from '@workspace/api-client-react';
import type { Service, ServiceInput, ServiceWeeklyHours } from '@workspace/api-client-react';
import { Plus, Trash2, ChevronUp, ChevronDown, X, Save, Eye, CalendarCheck, Archive, Image as ImageIcon, AlertCircle } from 'lucide-react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

const defaultHours: ServiceWeeklyHours = {
  sunday: [], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: []
};

function emptyServiceInput(sortOrder: number): ServiceInput {
  return {
    name: '',
    imagePath: '',
    altText: '',
    sortOrder,
    isVisible: false,
    isBookable: false,
    durationMinutes: 60,
    weeklyHours: defaultHours
  };
}

function toInput(service: Service): ServiceInput {
  return {
    name: service.name,
    imagePath: service.imagePath,
    altText: service.altText || '',
    sortOrder: service.sortOrder,
    isVisible: service.isVisible,
    isBookable: service.isBookable,
    durationMinutes: service.durationMinutes,
    weeklyHours: service.weeklyHours || defaultHours
  };
}

function WeeklyHoursEditor({ value, onChange }: { value: ServiceWeeklyHours, onChange: (h: ServiceWeeklyHours) => void }) {
  const addWindow = (day: keyof ServiceWeeklyHours) => {
    const windows = [...(value[day] || [])];
    windows.push({ id: generateId(), start: '09:00', end: '17:00' });
    onChange({ ...value, [day]: windows });
  };

  const removeWindow = (day: keyof ServiceWeeklyHours, id: string) => {
    onChange({ ...value, [day]: (value[day] || []).filter(w => w.id !== id) });
  };

  const updateWindow = (day: keyof ServiceWeeklyHours, id: string, field: 'start'|'end', val: string) => {
    onChange({
      ...value,
      [day]: (value[day] || []).map(w => w.id === id ? { ...w, [field]: val } : w)
    });
  };

  return (
    <div className="space-y-0 text-sm">
      {DAYS.map((day, idx) => (
        <div key={day} className={`flex items-start gap-4 p-4 ${idx !== DAYS.length - 1 ? 'border-b border-[hsl(var(--border))]' : ''}`}>
          <div className="w-24 pt-2 font-medium capitalize text-[hsl(var(--foreground))]">
            {day}
          </div>
          <div className="flex-1 space-y-2">
            {(value[day] || []).map(w => (
               <div key={w.id} className="flex flex-wrap items-center gap-2">
                 <input type="time" value={w.start} onChange={e => updateWindow(day, w.id, 'start', e.target.value)} className="field-input !py-1.5 !px-3 text-sm w-[110px]" />
                 <span className="text-[hsl(var(--muted-foreground))] px-1">to</span>
                 <input type="time" value={w.end} onChange={e => updateWindow(day, w.id, 'end', e.target.value)} className="field-input !py-1.5 !px-3 text-sm w-[110px]" />
                 <button type="button" onClick={() => removeWindow(day, w.id)} className="ml-2 p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] transition-colors" title="Remove window"><Trash2 size={15}/></button>
               </div>
            ))}
            {(!value[day] || value[day].length === 0) && (
              <div className="pt-2 text-[hsl(var(--muted-foreground))] opacity-60">Off</div>
            )}
          </div>
          <div className="pt-1">
            <button type="button" onClick={() => addWindow(day)} className="flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label, desc }: { checked: boolean, onChange: (c: boolean) => void, label: string, desc: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] p-4 bg-[hsl(var(--background))]">
       <div>
         <p className="font-semibold text-sm">{label}</p>
         <p className="text-xs text-[hsl(var(--muted-foreground))]">{desc}</p>
       </div>
       <SwitchPrimitive.Root checked={checked} onCheckedChange={onChange} className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[hsl(var(--primary))] data-[state=unchecked]:bg-[hsl(var(--input))]">
         <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
       </SwitchPrimitive.Root>
    </div>
  );
}

function ServiceEditor({ serviceId, initial, imageUrl, isArchived, onCancel, onSaved }: { serviceId?: number, initial: ServiceInput, imageUrl?: string, isArchived?: boolean, onCancel: () => void, onSaved: () => void }) {
  const queryClient = useQueryClient();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const archiveService = useArchiveService();
  const requestUploadUrl = useRequestServiceUploadUrl();

  const [draft, setDraft] = useState<ServiceInput>(initial);
  const [previewUrl, setPreviewUrl] = useState(imageUrl || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  const isNew = serviceId === undefined;
  
  const update = (field: keyof ServiceInput, value: any) => {
    setError('');
    setDraft(curr => ({ ...curr, [field]: value }));
  };

  const handleSave = async () => {
    setError('');
    if (!draft.name.trim()) {
      setError('Enter a service name before saving.');
      return;
    }
    try {
      if (isNew) {
        await createService.mutateAsync({ data: draft });
      } else {
        await updateService.mutateAsync({ id: serviceId, data: draft });
      }
      queryClient.invalidateQueries({ queryKey: getListAdminServicesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save service.');
    }
  };

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this service? It will no longer be visible or bookable.')) return;
    setError('');
    try {
      if (serviceId !== undefined) {
        await archiveService.mutateAsync({ id: serviceId });
        queryClient.invalidateQueries({ queryKey: getListAdminServicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
        onSaved();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to archive service.');
    }
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { uploadUrl, objectPath } = await requestUploadUrl.mutateAsync({ data: { contentType: file.type } });
      const response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error('The image upload did not complete.');
      update('imagePath', objectPath);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (err: any) {
      setError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    if (draft.name !== initial.name || draft.imagePath !== initial.imagePath) {
      if (!confirm('Discard unsaved changes?')) return;
    }
    onCancel();
  };

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm mb-6 reveal">
       <div className="flex items-center justify-between mb-6">
         <h3 className="font-editorial text-3xl">{isNew ? 'New Service' : 'Edit Service'}</h3>
         <button onClick={handleCancel} className="rounded-full p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] transition-colors"><X size={18} /></button>
       </div>

       {error && (
          <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-3 text-sm text-[hsl(var(--destructive))]">
           <AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}
         </div>
       )}

       <div className="grid gap-8 md:grid-cols-[280px_1fr]">
         <div className="space-y-6">
            <div>
               <label className="field-label">Service Image <span className="font-normal text-[hsl(var(--muted-foreground))]">(optional)</span></label>
              <div className="mt-2 flex flex-col gap-3">
                 <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] relative">
                   {previewUrl ? (
                     <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                   ) : (
                     <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]"><ImageIcon size={32} className="opacity-20"/></div>
                   )}
                   {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm font-semibold backdrop-blur-sm">Uploading...</div>}
                 </div>
                 <label className="btn-quiet w-full cursor-pointer relative text-center">
                    {previewUrl ? 'Change image' : 'Upload image'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void handleFile(e)} disabled={uploading} />
                 </label>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Switch checked={draft.isVisible} onChange={(c) => update('isVisible', c)} label="Show on website" desc="Display this service in the public list" />
              <Switch checked={draft.isBookable} onChange={(c) => update('isBookable', c)} label="Accept bookings" desc="Allow clients to book this online" />
            </div>
         </div>

         <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label">Service Name</label>
                <input value={draft.name} onChange={e => update('name', e.target.value)} className="field-input text-lg font-medium" placeholder="e.g. Lace wig consultation" />
              </div>
              <div>
                <label className="field-label">Duration (minutes)</label>
                <input type="number" min={15} step={15} value={draft.durationMinutes} onChange={e => update('durationMinutes', Number(e.target.value))} className="field-input" />
              </div>
              <div>
                <label className="field-label">Alt Text (Accessibility)</label>
                <input value={draft.altText} onChange={e => update('altText', e.target.value)} className="field-input" placeholder="Description of the image" />
              </div>
            </div>

            <div className="border-t border-[hsl(var(--border))] pt-6">
               <h4 className="font-semibold text-sm mb-4">Weekly Schedule</h4>
               <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] overflow-hidden">
                 <WeeklyHoursEditor value={draft.weeklyHours} onChange={h => update('weeklyHours', h)} />
               </div>
            </div>
         </div>
       </div>

       <div className="mt-10 flex items-center justify-between border-t border-[hsl(var(--border))] pt-6">
         {!isNew ? (
           <button type="button" onClick={() => void handleArchive()} disabled={archiveService.isPending || isArchived} className={`flex items-center gap-2 text-sm font-semibold transition-colors ${isArchived ? 'text-[hsl(var(--muted-foreground))] cursor-not-allowed' : 'text-[hsl(var(--destructive))] hover:opacity-80'}`}>
             <Archive size={15} /> {isArchived ? 'Archived' : archiveService.isPending ? 'Archiving...' : 'Archive service'}
           </button>
         ) : <div/>}

         <div className="flex items-center gap-4">
           <button type="button" onClick={handleCancel} className="text-sm font-semibold hover:opacity-80">Cancel</button>
            <button type="button" onClick={() => void handleSave()} disabled={createService.isPending || updateService.isPending || uploading} className="btn-primary">
             <Save size={15} /> {(createService.isPending || updateService.isPending) ? 'Saving...' : 'Save service'}
           </button>
         </div>
       </div>
    </div>
  );
}

function ServiceCard({ service, onEdit, onMoveUp, onMoveDown, isArchived, disabled }: { service: Service, onEdit: () => void, onMoveUp?: () => void, onMoveDown?: () => void, isArchived: boolean, disabled: boolean }) {
  return (
    <div className={`relative flex items-center gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all hover:border-[hsl(var(--primary)/.4)] ${isArchived ? 'opacity-60 bg-[hsl(var(--muted)/.3)] grayscale-[0.3]' : ''}`}>
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--muted))] border border-[hsl(var(--border))]">
        {service.imageUrl ? (
           <img src={service.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
           <div className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))]"><ImageIcon size={20} /></div>
        )}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-[hsl(var(--foreground))]">{service.name}</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{service.durationMinutes} minutes</p>
      </div>
      
      <div className="hidden md:flex items-center gap-4">
        {isArchived ? (
           <span className="rounded-full bg-[hsl(var(--destructive)/.1)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--destructive))]">Archived</span>
        ) : (
           <>
             {service.isVisible ? <span className="flex items-center gap-1.5 text-xs text-[hsl(150_35%_28%)]"><Eye size={14}/> Visible</span> : <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"><Eye size={14} className="opacity-50"/> Hidden</span>}
             {service.isBookable ? <span className="flex items-center gap-1.5 text-xs text-[hsl(150_35%_28%)]"><CalendarCheck size={14}/> Bookable</span> : <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"><CalendarCheck size={14} className="opacity-50"/> Not Bookable</span>}
           </>
        )}
      </div>

      <div className="ml-4 flex items-center gap-2 border-l border-[hsl(var(--border))] pl-4">
        <div className="flex flex-col">
          <button type="button" onClick={onMoveUp} disabled={!onMoveUp || disabled} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-20 transition-colors"><ChevronUp size={16} /></button>
          <button type="button" onClick={onMoveDown} disabled={!onMoveDown || disabled} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-20 transition-colors"><ChevronDown size={16} /></button>
        </div>
        <button type="button" onClick={onEdit} disabled={disabled} className="btn-quiet ml-2 px-4 py-2 text-xs">
          Edit
        </button>
      </div>
    </div>
  );
}

export function ServicesAdmin() {
  const { data: services, isLoading, isError } = useListAdminServices();
  const queryClient = useQueryClient();
  const updateService = useUpdateService();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [reordering, setReordering] = useState(false);

  if (isLoading) return <div className="skeleton h-64 w-full" />;
  if (isError) return <div className="rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.05)] p-5 text-sm text-[hsl(var(--destructive))]">Could not load services. Please try again.</div>;

  const sorted = [...(services || [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const reindex = async (newOrdered: Service[]) => {
    setReordering(true);
    try {
      const promises = newOrdered.map((s, i) => {
        if (s.sortOrder !== i) {
          return updateService.mutateAsync({ id: s.id, data: { ...toInput(s), sortOrder: i } });
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
      queryClient.invalidateQueries({ queryKey: getListAdminServicesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    } finally {
      setReordering(false);
    }
  };

  const moveUp = async (index: number) => {
    if (index === 0) return;
    const newArr = [...sorted];
    [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
    await reindex(newArr);
  };

  const moveDown = async (index: number) => {
    if (index === sorted.length - 1) return;
    const newArr = [...sorted];
    [newArr[index + 1], newArr[index]] = [newArr[index], newArr[index + 1]];
    await reindex(newArr);
  };

  return (
    <section className="mt-10 space-y-8">
       <div className="flex items-end justify-between">
         <div>
           <h2 className="font-editorial text-4xl">Services</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Manage the public service menu and booking availability.</p>
         </div>
         <button className="btn-primary" onClick={() => setEditingId('new')} disabled={editingId === 'new'}>
           <Plus size={16} /> Add service
         </button>
       </div>

       {editingId === 'new' && (
         <ServiceEditor 
           initial={emptyServiceInput(sorted.length > 0 ? sorted[sorted.length - 1].sortOrder + 1 : 0)} 
           onCancel={() => setEditingId(null)}
           onSaved={() => setEditingId(null)}
         />
       )}

       <div className="grid gap-4">
         {sorted.length === 0 && editingId !== 'new' && (
            <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))] mb-5">
                 <CalendarCheck size={22} className="text-[hsl(var(--muted-foreground))]" />
              </div>
              <h3 className="font-editorial text-2xl">No services yet</h3>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Add your first service to start taking bookings.</p>
            </div>
         )}
         {sorted.map((service, index) => (
           <div key={service.id}>
             {editingId === service.id ? (
               <ServiceEditor 
                 serviceId={service.id}
                 initial={toInput(service)} 
                 imageUrl={service.imageUrl}
                 isArchived={service.isArchived}
                 onCancel={() => setEditingId(null)}
                 onSaved={() => setEditingId(null)}
               />
             ) : (
               <ServiceCard 
                 service={service} 
                 onEdit={() => setEditingId(service.id)} 
                 onMoveUp={index > 0 ? () => void moveUp(index) : undefined}
                 onMoveDown={index < sorted.length - 1 ? () => void moveDown(index) : undefined}
                 isArchived={service.isArchived}
                 disabled={reordering || editingId !== null}
               />
             )}
           </div>
         ))}
       </div>
    </section>
  );
}
