import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListWigOrders,
  getListWigOrdersQueryKey,
  useCreateWigOrder,
  useUpdateWigOrder,
  useListWigReceipts,
  useIssueWigReceipt,
  useConfirmWigOrderImport,
  WigOrder,
  WigOrderInput,
  WigImportPreview
} from '@workspace/api-client-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Search, Download, ChevronDown, FileUp, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function formatDay(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { timeZone: 'UTC', ...(options || { month: 'short', day: 'numeric', year: 'numeric' }) });
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const MoneyInput = ({ valueCents, onChange, label, id }: { valueCents: number, onChange: (cents: number) => void, label: string, id: string }) => {
  const [val, setVal] = useState((valueCents / 100).toFixed(2));
  React.useEffect(() => { setVal((valueCents / 100).toFixed(2)); }, [valueCents]);
  return (
    <label className="field-label" htmlFor={id}>
      {label}
      <div className="relative mt-1">
        <span className="absolute left-3 top-[13px] text-[hsl(var(--muted-foreground))]">$</span>
        <input 
          id={id}
          type="number"
          step="0.01"
          min="0"
          className="field-input !pl-7"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
              const cents = Math.round(parsed * 100);
              onChange(cents);
              setVal((cents / 100).toFixed(2));
            } else {
              onChange(0);
              setVal('0.00');
            }
          }}
        />
      </div>
    </label>
  );
};

const PercentInput = ({ valueMilli, onChange, label, id }: { valueMilli: number, onChange: (val: number) => void, label: string, id: string }) => {
  const [val, setVal] = useState((valueMilli / 1000).toFixed(3));
  React.useEffect(() => { setVal((valueMilli / 1000).toFixed(3)); }, [valueMilli]);
  return (
    <label className="field-label" htmlFor={id}>
      {label}
      <div className="relative mt-1">
        <input 
          id={id}
          type="number"
          step="0.001"
          min="0"
          className="field-input !pr-7"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
              const milli = Math.round(parsed * 1000);
              onChange(milli);
              setVal((milli / 1000).toFixed(3));
            } else {
              onChange(0);
              setVal('0.000');
            }
          }}
        />
        <span className="absolute right-3 top-[13px] text-[hsl(var(--muted-foreground))]">%</span>
      </div>
    </label>
  );
};

const defaultOrder: WigOrderInput = {
  kind: 'stock',
  itemCode: '',
  orderDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0],
  customerName: '',
  phone: '',
  email: '',
  notes: '',
  style: '',
  capSize: '',
  lengthInch: '',
  hairType: '',
  part: '',
  layers: '',
  density: '',
  color: '',
  highlights: '',
  priceCents: 0,
  taxRateMilliPercent: 6625,
  amountPaidCents: 0
};

function WigOrderForm({ initial, onSave, onCancel, busy }: { initial?: WigOrder; onSave: (data: WigOrderInput) => void; onCancel: () => void; busy: boolean }) {
  const [form, setForm] = useState<WigOrderInput>(initial ? {
    kind: initial.kind,
    itemCode: initial.itemCode,
    orderDate: initial.orderDate.split('T')[0],
    customerName: initial.customerName,
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    notes: initial.notes ?? '',
    style: initial.style ?? '',
    capSize: initial.capSize ?? '',
    lengthInch: initial.lengthInch ?? '',
    hairType: initial.hairType ?? '',
    part: initial.part ?? '',
    layers: initial.layers ?? '',
    density: initial.density ?? '',
    color: initial.color ?? '',
    highlights: initial.highlights ?? '',
    priceCents: initial.priceCents,
    taxRateMilliPercent: initial.taxRateMilliPercent,
    amountPaidCents: initial.amountPaidCents
  } : defaultOrder);

  const update = (field: keyof WigOrderInput, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="field-label">Kind
          <select value={form.kind} onChange={(e) => update('kind', e.target.value)} className="field-input mt-1" data-testid="select-order-kind">
            <option value="stock">Stock</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="field-label">Item Code
          <input required value={form.itemCode} onChange={(e) => update('itemCode', e.target.value)} className="field-input mt-1" data-testid="input-item-code" />
        </label>
        <label className="field-label">Order Date
          <input type="date" required value={form.orderDate} onChange={(e) => update('orderDate', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Customer Name
          <input required value={form.customerName} onChange={(e) => update('customerName', e.target.value)} className="field-input mt-1" data-testid="input-customer-name" />
        </label>
        <label className="field-label">Phone
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Email
          <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="field-input mt-1" />
        </label>
        
        {form.kind === 'custom' && <div className="col-span-full mt-4 border-b border-[hsl(var(--border))] pb-2"><h3 className="font-editorial text-xl">Custom wig details</h3></div>}
        
        {form.kind === 'custom' && <><label className="field-label">Style
          <input value={form.style} onChange={(e) => update('style', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Cap Size
          <input value={form.capSize} onChange={(e) => update('capSize', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Length
          <input value={form.lengthInch} onChange={(e) => update('lengthInch', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Hair Type
          <input value={form.hairType} onChange={(e) => update('hairType', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Part
          <input value={form.part} onChange={(e) => update('part', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Layers
          <input value={form.layers} onChange={(e) => update('layers', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Density
          <input value={form.density} onChange={(e) => update('density', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label">Color
          <input value={form.color} onChange={(e) => update('color', e.target.value)} className="field-input mt-1" />
        </label>
        <label className="field-label md:col-span-2">Highlights
          <input value={form.highlights} onChange={(e) => update('highlights', e.target.value)} className="field-input mt-1" />
        </label></>}

        <div className="col-span-full mt-4 border-b border-[hsl(var(--border))] pb-2"><h3 className="font-editorial text-xl">Financials</h3></div>
        
        <MoneyInput id="price" label="Price" valueCents={form.priceCents} onChange={(c) => update('priceCents', c)} />
        <PercentInput id="tax" label="Tax Rate" valueMilli={form.taxRateMilliPercent} onChange={(m) => update('taxRateMilliPercent', m)} />
        <MoneyInput id="paid" label="Amount Paid" valueCents={form.amountPaidCents} onChange={(c) => update('amountPaidCents', c)} />
        <div className="md:col-span-2 rounded-xl bg-[hsl(var(--secondary))] p-4 text-sm" data-testid="summary-order-amounts">
          <span>Tax ${(Math.round(form.priceCents * form.taxRateMilliPercent / 100000) / 100).toFixed(2)}</span>
          <span className="mx-3">·</span>
          <strong>Total ${((form.priceCents + Math.round(form.priceCents * form.taxRateMilliPercent / 100000)) / 100).toFixed(2)}</strong>
          <span className="mx-3">·</span>
          <span>Due ${((form.priceCents + Math.round(form.priceCents * form.taxRateMilliPercent / 100000) - form.amountPaidCents) / 100).toFixed(2)}</span>
          {form.amountPaidCents > form.priceCents + Math.round(form.priceCents * form.taxRateMilliPercent / 100000) && <p role="alert" className="mt-2 text-[hsl(var(--destructive))]">Amount paid cannot exceed the total.</p>}
        </div>
        
        <label className="field-label md:col-span-2">Notes
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className="field-input mt-1 min-h-24 resize-y" />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-[hsl(var(--border))]">
        <button type="button" onClick={onCancel} className="btn-quiet flex-1" data-testid="button-cancel-order">Cancel</button>
        <button type="submit" disabled={busy || form.amountPaidCents > form.priceCents + Math.round(form.priceCents * form.taxRateMilliPercent / 100000)} className="btn-primary flex-1" data-testid="button-save-order">{busy ? 'Saving...' : 'Save Order'}</button>
      </div>
    </form>
  )
}

function OrderDetails({ order, onEdit }: { order: WigOrder; onEdit: () => void }) {
  const { data: receipts, isLoading, refetch } = useListWigReceipts(order.id);
  const issueReceipt = useIssueWigReceipt();
  const { toast } = useToast();

  const handleIssue = () => {
    issueReceipt.mutate({ id: order.id }, {
      onSuccess: () => {
        refetch();
        toast({ title: "Receipt issued successfully." });
      },
      onError: () => {
        toast({ title: "Failed to issue receipt.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-mono-ui uppercase tracking-wide opacity-50 mb-2">Customer</h4>
          <p className="text-sm">{order.customerName}</p>
          {(order.phone || order.email) && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {order.phone} {order.phone && order.email && '·'} {order.email}
            </p>
          )}
        </div>
        <div>
          <h4 className="text-xs font-mono-ui uppercase tracking-wide opacity-50 mb-2">Wig Specs</h4>
          <ul className="text-sm space-y-1 text-[hsl(var(--muted-foreground))]">
            {order.style && <li><strong className="text-[hsl(var(--foreground))] font-normal">Style:</strong> {order.style}</li>}
            {order.capSize && <li><strong className="text-[hsl(var(--foreground))] font-normal">Cap Size:</strong> {order.capSize}</li>}
            {order.lengthInch && <li><strong className="text-[hsl(var(--foreground))] font-normal">Length:</strong> {order.lengthInch}</li>}
            {order.color && <li><strong className="text-[hsl(var(--foreground))] font-normal">Color:</strong> {order.color}</li>}
            {order.hairType && <li><strong className="text-[hsl(var(--foreground))] font-normal">Hair Type:</strong> {order.hairType}</li>}
            {order.part && <li><strong className="text-[hsl(var(--foreground))] font-normal">Part:</strong> {order.part}</li>}
            {order.layers && <li><strong className="text-[hsl(var(--foreground))] font-normal">Layers:</strong> {order.layers}</li>}
            {order.density && <li><strong className="text-[hsl(var(--foreground))] font-normal">Density:</strong> {order.density}</li>}
            {order.highlights && <li><strong className="text-[hsl(var(--foreground))] font-normal">Highlights:</strong> {order.highlights}</li>}
          </ul>
        </div>
        {order.notes && (
          <div>
            <h4 className="text-xs font-mono-ui uppercase tracking-wide opacity-50 mb-2">Notes</h4>
            <p className="text-sm">{order.notes}</p>
          </div>
        )}
        <button onClick={onEdit} className="btn-quiet !px-3 !py-2 text-xs">Edit Order</button>
      </div>

      <div className="space-y-4 border-t md:border-t-0 md:border-l border-[hsl(var(--border))] md:pl-6 pt-4 md:pt-0">
         <div>
            <h4 className="text-xs font-mono-ui uppercase tracking-wide opacity-50 mb-2">Financials</h4>
            <div className="grid grid-cols-2 gap-2 text-sm max-w-[200px]">
              <span className="text-[hsl(var(--muted-foreground))]">Price</span>
              <span className="text-right">{formatMoney(order.priceCents)}</span>
              <span className="text-[hsl(var(--muted-foreground))]">Tax ({(order.taxRateMilliPercent / 1000).toFixed(3)}%)</span>
              <span className="text-right">{formatMoney(order.taxCents)}</span>
              <span className="text-[hsl(var(--muted-foreground))] font-semibold mt-1">Total</span>
              <span className="text-right font-semibold mt-1">{formatMoney(order.totalCents)}</span>
              <span className="text-[hsl(var(--muted-foreground))] mt-2 border-t border-[hsl(var(--border))] pt-2">Paid</span>
              <span className="text-right mt-2 border-t border-[hsl(var(--border))] pt-2">{formatMoney(order.amountPaidCents)}</span>
              <span className={`font-semibold ${order.amountDueCents > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(150_35%_40%)]'}`}>Due</span>
              <span className={`text-right font-semibold ${order.amountDueCents > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(150_35%_40%)]'}`}>{formatMoney(order.amountDueCents)}</span>
            </div>
         </div>
         
         <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-mono-ui uppercase tracking-wide opacity-50">Receipts</h4>
              <button onClick={handleIssue} disabled={issueReceipt.isPending} className="text-xs text-[hsl(var(--primary))] hover:underline flex items-center gap-1">
                 <Plus size={12} /> {issueReceipt.isPending ? 'Issuing...' : 'Issue New'}
              </button>
            </div>
            {isLoading ? <div className="skeleton h-10 w-full" /> : receipts && receipts.length > 0 ? (
              <ul className="space-y-2">
                {receipts.map(receipt => (
                  <li key={receipt.id} className="flex items-center justify-between bg-[hsl(var(--background))] border border-[hsl(var(--border))] p-2 rounded-lg text-sm">
                    <span className="font-mono-ui text-xs">{receipt.receiptNumber}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{formatDay(receipt.issuedAt)}</span>
                       <a href={`/api/admin/orders/${order.id}/receipts/${receipt.id}/pdf`} download className="p-1.5 rounded bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))] transition-colors" title={`Download ${receipt.receiptNumber} PDF`} aria-label={`Download ${receipt.receiptNumber} PDF`} data-testid={`link-receipt-${receipt.id}`}>
                        <Download size={14} />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">No receipts issued yet.</p>
            )}
         </div>
      </div>
    </div>
  );
}

function ImportOrders({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WigImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirmWigOrderImport();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError('');
    try {
      const res = await fetch('/api/admin/orders/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body: file
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to preview import');
      const data = await res.json();
      setPreview(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    confirm.mutate({ data: { rows: preview.rows } }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListWigOrdersQueryKey() });
        toast({ title: `${result.imported} orders imported${result.skipped.length ? `; ${result.skipped.length} skipped` : ''}.` });
        if (result.skipped.length) {
          setPreview({ rows: [], issues: result.skipped });
        } else {
          onDone();
        }
      },
      onError: (e) => {
        setError(e.message || 'Import failed');
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
       {!preview ? (
         <div className="flex flex-col gap-4">
           <p className="text-sm text-[hsl(var(--muted-foreground))]">Upload an Excel spreadsheet containing wig orders.</p>
           <label className="field-label">Spreadsheet File (.xlsx)
              <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="field-input mt-1" data-testid="input-order-workbook" />
           </label>
           {error && <div className="text-sm text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.1)] p-3 rounded">{error}</div>}
            <button onClick={handlePreview} disabled={!file || previewing} className="btn-primary mt-2" data-testid="button-preview-import">{previewing ? 'Reading...' : 'Preview Import'}</button>
         </div>
       ) : (
         <div className="flex flex-col gap-4">
           <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
               <h3 className="font-semibold text-lg">{preview.rows.length} valid orders ready.</h3>
               <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Review these rows before confirming. Nothing has been saved yet; old receipt links and spreadsheet formulas are not imported.</p>
               {preview.rows.length > 0 && <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-[hsl(var(--border))]">
                 <table className="w-full text-left text-xs">
                   <thead className="sticky top-0 bg-[hsl(var(--secondary))]"><tr><th className="p-2">Source</th><th className="p-2">Item code</th><th className="p-2">Customer</th><th className="p-2 text-right">Price</th></tr></thead>
                   <tbody>{preview.rows.map((row, i) => <tr key={`${row.sheet}-${row.rowNumber}-${i}`} className="border-t border-[hsl(var(--border))]"><td className="p-2">{row.sheet} · {row.rowNumber}</td><td className="p-2">{row.order.itemCode}</td><td className="p-2">{row.order.customerName}</td><td className="p-2 text-right">{formatMoney(row.order.priceCents)}</td></tr>)}</tbody>
                 </table>
               </div>}
              {preview.issues.length > 0 && (
                <div className="mt-4 border-t border-[hsl(var(--border))] pt-4">
                  <h4 className="text-sm font-semibold text-[hsl(var(--destructive))]">{preview.issues.length} issues skipped:</h4>
                  <ul className="mt-2 text-xs list-disc pl-4 space-y-1 text-[hsl(var(--destructive))]">
                    {preview.issues.map((issue, i) => (
                      <li key={i}>{issue.sheet} Row {issue.rowNumber}: {issue.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
           </div>
           {error && <div className="text-sm text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.1)] p-3 rounded">{error}</div>}
           <div className="flex items-center gap-3">
             <button type="button" onClick={() => { setPreview(null); setFile(null); }} className="btn-quiet flex-1">Cancel</button>
              <button type="button" onClick={handleConfirm} disabled={confirm.isPending || preview.rows.length === 0} className="btn-primary flex-1" data-testid="button-confirm-import">{confirm.isPending ? 'Importing...' : 'Confirm Import'}</button>
           </div>
         </div>
       )}
    </div>
  );
}

export function OrdersAdmin() {
  const { data: orders, isLoading, isError } = useListWigOrders();
  const queryClient = useQueryClient();
  const createOrder = useCreateWigOrder();
  const updateOrder = useUpdateWigOrder();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'stock' | 'custom'>('all');
  
  const [editingOrder, setEditingOrder] = useState<WigOrder | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => {
      const matchKind = kindFilter === 'all' || o.kind === kindFilter;
      const matchSearch = search.trim() === '' || 
        o.customerName.toLowerCase().includes(search.toLowerCase()) || 
        o.itemCode.toLowerCase().includes(search.toLowerCase()) ||
        o.orderDate.includes(search.trim());
      return matchKind && matchSearch;
    });
  }, [orders, kindFilter, search]);

  const handleSaveOrder = (data: WigOrderInput) => {
    const savedData = data.kind === 'stock' ? {
      ...data, style: '', capSize: '', lengthInch: '', hairType: '', part: '',
      layers: '', density: '', color: '', highlights: '',
    } : data;
    if (editingOrder) {
      updateOrder.mutate({ id: editingOrder.id, data: savedData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWigOrdersQueryKey() });
          setIsFormOpen(false);
          setEditingOrder(null);
          toast({ title: "Order updated successfully." });
        },
        onError: () => toast({ title: "Failed to update order.", variant: "destructive" })
      });
    } else {
      createOrder.mutate({ data: savedData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWigOrdersQueryKey() });
          setIsFormOpen(false);
          toast({ title: "Order created successfully." });
        },
        onError: () => toast({ title: "Failed to create order.", variant: "destructive" })
      });
    }
  };

  const openAdd = () => {
    setEditingOrder(null);
    setIsFormOpen(true);
  };

  return (
    <div className="mt-8 space-y-8">
      {isError && <div className="rounded-xl border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/.08)] p-5 text-sm text-[hsl(var(--destructive))]" role="alert">We could not load orders. Refresh the page and try again.</div>}
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
           <button onClick={openAdd} className="btn-primary" data-testid="button-add-order">
            <Plus size={16} /> Add Order
          </button>
           <button onClick={() => setIsImportOpen(true)} className="btn-quiet !px-4" data-testid="button-import-orders">
            <FileUp size={16} /> Import
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" size={16} />
            <input 
              type="text" 
              placeholder="Search orders..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="field-input !pl-9 sm:w-64"
               data-testid="input-search-orders"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><X size={14} /></button>}
          </div>
          <div className="flex bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-1">
            {(['all', 'stock', 'custom'] as const).map(k => (
              <button 
                key={k} 
                onClick={() => setKindFilter(k)}
                className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${kindFilter === k ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full" />)
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map(order => (
            <div key={order.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden transition-shadow hover:shadow-sm">
              <button type="button"
                className="flex w-full flex-wrap items-center justify-between gap-4 p-5 text-left hover:bg-[hsl(var(--secondary)/.3)]" 
                onClick={() => setExpandedId(e => e === order.id ? null : order.id)}
                aria-expanded={expandedId === order.id}
                data-testid={`button-order-${order.id}`}
              >
                 <div className="min-w-0 flex-1">
                   <h3 className="font-semibold text-lg truncate">{order.customerName}</h3>
                   <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1 flex flex-wrap items-center gap-2">
                     <span className="font-mono-ui uppercase text-[10px] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] px-2 py-0.5 rounded">{order.kind}</span>
                     <span className="font-medium">{order.itemCode}</span>
                     <span>·</span>
                     <span>{formatDay(order.orderDate)}</span>
                   </div>
                 </div>
                 <div className="flex items-center gap-6 shrink-0">
                   <div className="text-right">
                     <div className="font-semibold">{formatMoney(order.totalCents)}</div>
                     <div className={`text-xs mt-0.5 ${order.amountDueCents > 0 ? 'text-[hsl(var(--destructive))] font-medium' : 'text-[hsl(150_35%_40%)]'}`}>
                       {order.amountDueCents > 0 ? `Due: ${formatMoney(order.amountDueCents)}` : 'Paid'}
                     </div>
                   </div>
                   <ChevronDown className={`transition-transform text-[hsl(var(--muted-foreground))] ${expandedId === order.id ? 'rotate-180' : ''}`} size={20} />
                 </div>
              </button>
              {expandedId === order.id && (
                <div className="border-t border-[hsl(var(--border))] p-5 bg-[hsl(var(--secondary)/.2)]">
                   <OrderDetails order={order} onEdit={() => { setEditingOrder(order); setIsFormOpen(true); }} />
                </div>
              )}
            </div>
          ))
        ) : (
           <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center shadow-sm">
             <div className="mx-auto w-12 h-12 bg-[hsl(var(--secondary))] rounded-full flex items-center justify-center mb-4">
               <Search className="text-[hsl(var(--muted-foreground))]" size={20} />
             </div>
             <h3 className="font-editorial text-2xl">No orders found</h3>
             <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                No orders match your current filters.
             </p>
           </div>
        )}
      </div>

      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent side="right" className="flex h-[100dvh] !w-full !max-w-none flex-col bg-[hsl(var(--background))] p-0 sm:!max-w-md md:!max-w-lg">
          <SheetHeader className="border-b border-[hsl(var(--border))] p-6 pr-14 text-left">
            <SheetTitle className="font-editorial text-2xl">{editingOrder ? 'Edit Order' : 'New Order'}</SheetTitle>
            <SheetDescription>{editingOrder ? 'Update the wig order details.' : 'Record a new stock or custom wig order.'}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {isFormOpen && (
              <WigOrderForm 
                initial={editingOrder || undefined} 
                onSave={handleSaveOrder} 
                onCancel={() => { setIsFormOpen(false); setEditingOrder(null); }} 
                busy={createOrder.isPending || updateOrder.isPending} 
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isImportOpen} onOpenChange={setIsImportOpen}>
        <SheetContent side="right" className="flex h-[100dvh] !w-full !max-w-none flex-col bg-[hsl(var(--background))] p-0 sm:!max-w-md">
          <SheetHeader className="border-b border-[hsl(var(--border))] p-6 pr-14 text-left">
            <SheetTitle className="font-editorial text-2xl">Import Orders</SheetTitle>
            <SheetDescription>Upload an Excel spreadsheet (.xlsx) to import multiple orders at once.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {isImportOpen && (
              <ImportOrders onDone={() => setIsImportOpen(false)} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
