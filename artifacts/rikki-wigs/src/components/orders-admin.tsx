import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListWigOrders,
  getListWigOrdersQueryKey,
  useCreateWigOrder,
  useUpdateWigOrder,
  useListWigReceipts,
  useIssueWigReceipt,
  WigOrder,
  WigOrderInput,
} from '@workspace/api-client-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Search, Download, Eye, ChevronDown, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function formatDay(value: string | Date | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return 'Date needed';
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { timeZone: 'UTC', ...(options || { month: 'short', day: 'numeric', year: 'numeric' }) });
}

function formatMoney(cents: number | null) {
  return cents === null ? 'Needs review' : `$${(cents / 100).toFixed(2)}`;
}

const MoneyInput = ({ valueCents, onChange, label, id }: { valueCents: number | null, onChange: (cents: number | null) => void, label: string, id: string }) => {
  const [val, setVal] = useState(valueCents === null ? '' : (valueCents / 100).toFixed(2));
  React.useEffect(() => { setVal(valueCents === null ? '' : (valueCents / 100).toFixed(2)); }, [valueCents]);
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
              onChange(null);
              setVal('');
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
  kind: 'custom',
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

type OrderFormValues = Omit<WigOrderInput, 'priceCents' | 'amountPaidCents'> & {
  priceCents: number | null;
  amountPaidCents: number | null;
};

function WigOrderForm({ initial, onSave, onCancel, busy }: { initial?: WigOrder; onSave: (data: WigOrderInput) => void; onCancel: () => void; busy: boolean }) {
  const [form, setForm] = useState<OrderFormValues>(initial ? {
    kind: initial.kind,
    itemCode: initial.itemCode ?? '',
    orderDate: initial.orderDate?.split('T')[0] ?? '',
    customerName: initial.customerName ?? '',
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

  const update = (field: keyof OrderFormValues, value: string | number | null) => setForm(f => ({ ...f, [field]: value }));
  const taxCents = form.priceCents === null ? null : Math.round(form.priceCents * form.taxRateMilliPercent / 100000);
  const totalCents = form.priceCents === null || taxCents === null ? null : form.priceCents + taxCents;
  const amountDueCents = totalCents === null || form.amountPaidCents === null ? null : totalCents - form.amountPaidCents;
  const invalidPayment = amountDueCents !== null && amountDueCents < 0;
  const ready = form.priceCents !== null && form.amountPaidCents !== null && !invalidPayment;

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (form.priceCents !== null && form.amountPaidCents !== null && !invalidPayment) {
        onSave({ ...form, priceCents: form.priceCents, amountPaidCents: form.amountPaidCents });
      }
    }} className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
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
        
        <div className="col-span-full mt-4 border-b border-[hsl(var(--border))] pb-2"><h3 className="font-editorial text-xl">Custom wig details</h3></div>
        
        <label className="field-label">Style
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
        </label>

        <div className="col-span-full mt-4 border-b border-[hsl(var(--border))] pb-2"><h3 className="font-editorial text-xl">Financials</h3></div>
        
        <MoneyInput id="price" label="Price" valueCents={form.priceCents} onChange={(c) => update('priceCents', c)} />
        <PercentInput id="tax" label="Tax Rate" valueMilli={form.taxRateMilliPercent} onChange={(m) => update('taxRateMilliPercent', m)} />
        <MoneyInput id="paid" label="Amount Paid" valueCents={form.amountPaidCents} onChange={(c) => update('amountPaidCents', c)} />
        <div className="md:col-span-2 rounded-xl bg-[hsl(var(--secondary))] p-4 text-sm" data-testid="summary-order-amounts">
          <span>Tax {formatMoney(taxCents)}</span>
          <span className="mx-3">·</span>
          <strong>Total {formatMoney(totalCents)}</strong>
          <span className="mx-3">·</span>
          <span>Due {formatMoney(amountDueCents)}</span>
          {invalidPayment && <p role="alert" className="mt-2 text-[hsl(var(--destructive))]">Amount paid cannot exceed the total.</p>}
          {!ready && !invalidPayment && <p className="mt-2 text-[hsl(var(--destructive))]">Enter the missing price and amount paid before saving.</p>}
        </div>
        
        <label className="field-label md:col-span-2">Notes
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className="field-input mt-1 min-h-24 resize-y" />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-[hsl(var(--border))]">
        <button type="button" onClick={onCancel} className="btn-quiet flex-1" data-testid="button-cancel-order">Cancel</button>
        <button type="submit" disabled={busy || !ready} className="btn-primary flex-1" data-testid="button-save-order">{busy ? 'Saving...' : initial ? 'Save Order' : 'Save & Issue Receipt'}</button>
      </div>
    </form>
  )
}

function OrderDetails({ order, onEdit }: { order: WigOrder; onEdit: () => void }) {
  const { data: receipts, isLoading, refetch } = useListWigReceipts(order.id);
  const issueReceipt = useIssueWigReceipt();
  const { toast } = useToast();
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const missingReceiptFields = [
    { label: 'Customer name', missing: !order.customerName?.trim() },
    { label: 'Item code', missing: !order.itemCode?.trim() },
    { label: 'Order date', missing: !order.orderDate },
    { label: 'Price', missing: order.priceCents === null },
    { label: 'Tax', missing: order.taxCents === null },
    { label: 'Total', missing: order.totalCents === null },
    { label: 'Amount paid', missing: order.amountPaidCents === null },
    { label: 'Amount due', missing: order.amountDueCents === null },
  ].filter(field => field.missing).map(field => field.label);
  const receiptConcerns = [
    ...order.reviewIssues,
    ...missingReceiptFields.map(label => `${label}: Not recorded`),
    ...(order.needsReview && order.reviewIssues.length === 0 ? ['This order is marked Needs review.'] : []),
  ];
  const needsConfirmation = order.needsReview || receiptConcerns.length > 0;
  const wigSpecs = [
    ['Style', order.style],
    ['Cap size', order.capSize],
    ['Length', order.lengthInch],
    ['Color', order.color],
    ['Hair type', order.hairType],
    ['Part', order.part],
    ['Layers', order.layers],
    ['Density', order.density],
    ['Highlights', order.highlights],
  ].filter(([, value]) => Boolean(value?.trim()));

  const issueNow = () => {
    if (issueReceipt.isPending) return;
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
  const handleIssue = () => {
    if (needsConfirmation) setConfirmIssueOpen(true);
    else issueNow();
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        {order.needsReview && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <strong>This order needs review.</strong>
          <ul className="mt-2 list-disc pl-5">{order.reviewIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
          <p className="mt-2">You can edit the order first, or approve a receipt with the details currently recorded.</p>
        </div>}
        <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-5" aria-labelledby={`order-customer-${order.id}`}>
          <h4 id={`order-customer-${order.id}`} className="mb-4 border-b border-[hsl(var(--border))] pb-3 font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Customer information</h4>
          <p className="font-editorial text-xl leading-tight text-[hsl(var(--foreground))] break-words">{order.customerName || <span className="text-[hsl(var(--muted-foreground))]">Name needed</span>}</p>
          {(order.phone || order.email) ? (
            <dl className="mt-5 grid gap-4 border-t border-[hsl(var(--border))] pt-4 sm:grid-cols-2">
              {order.phone && <div className="min-w-0">
                <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Phone</dt>
                <dd className="break-words text-sm text-[hsl(var(--foreground))]">{order.phone}</dd>
              </div>}
              {order.email && <div className="min-w-0">
                <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Email</dt>
                <dd className="break-all text-sm text-[hsl(var(--foreground))]">{order.email}</dd>
              </div>}
            </dl>
          ) : <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No contact details recorded.</p>}
        </section>
        <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-5" aria-labelledby={`order-specs-${order.id}`}>
          <h4 id={`order-specs-${order.id}`} className="mb-4 border-b border-[hsl(var(--border))] pb-3 font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Wig specifications</h4>
          {wigSpecs.length > 0 ? (
            <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              {wigSpecs.map(([label, value]) => <div key={label} className="min-w-0">
                <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</dt>
                <dd className="break-words text-sm font-medium leading-relaxed text-[hsl(var(--foreground))]">{value}</dd>
              </div>)}
            </dl>
          ) : <p className="text-sm text-[hsl(var(--muted-foreground))]">No wig specifications recorded.</p>}
        </section>
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
               <span className={`font-semibold ${(order.amountDueCents ?? 0) > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(150_35%_40%)]'}`}>Due</span>
               <span className={`text-right font-semibold ${(order.amountDueCents ?? 0) > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(150_35%_40%)]'}`}>{formatMoney(order.amountDueCents)}</span>
            </div>
         </div>
         
         <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-mono-ui uppercase tracking-wide opacity-50">Receipts</h4>
                <button onClick={handleIssue} disabled={issueReceipt.isPending} className="text-xs text-[hsl(var(--primary))] hover:underline flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40">
                 <Plus size={12} /> {issueReceipt.isPending ? 'Issuing...' : 'Issue New'}
              </button>
            </div>
            {isLoading ? <div className="skeleton h-10 w-full" /> : receipts && receipts.length > 0 ? (
              <ul className="space-y-2">
                {receipts.map(receipt => (
                   <li key={receipt.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm">
                     <div className="min-w-0">
                       <p className="break-words font-medium text-[hsl(var(--foreground))]">{receipt.customerName || 'Name unavailable'} · {receipt.itemCode || 'Code unavailable'}</p>
                       <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]"><span className="font-mono-ui">{receipt.receiptNumber}</span> · {formatDay(receipt.issuedAt)}</p>
                     </div>
                     <div className="mt-3 flex flex-wrap gap-2">
                       <a href={`/api/admin/orders/${order.id}/receipts/${receipt.id}/view`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[hsl(var(--secondary))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--primary))]" aria-label={`View receipt for ${receipt.customerName || 'customer'}, ${receipt.itemCode || 'unknown code'}`} data-testid={`link-view-receipt-${receipt.id}`}>
                         <Eye size={14} aria-hidden="true" /> View
                       </a>
                       <a href={`/api/admin/orders/${order.id}/receipts/${receipt.id}/pdf`} className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[hsl(var(--secondary))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--primary))]" aria-label={`Download receipt for ${receipt.customerName || 'customer'}, ${receipt.itemCode || 'unknown code'}`} data-testid={`link-receipt-${receipt.id}`}>
                         <Download size={14} aria-hidden="true" /> Download
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
      <AlertDialog open={confirmIssueOpen} onOpenChange={setConfirmIssueOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue this receipt with details needing review?</AlertDialogTitle>
            <AlertDialogDescription>
              The receipt will save the details currently on this order. Missing values will say “Not recorded,” not $0.00. It will not change the order or clear its review status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-[hsl(var(--foreground))]">
            {receiptConcerns.map((concern, index) => <li key={`${index}-${concern}`}>{concern}</li>)}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={issueNow}>Issue receipt anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => {
      const matchKind = kindFilter === 'all' || o.kind === kindFilter;
      const matchSearch = search.trim() === '' || 
        (o.customerName ?? '').toLowerCase().includes(search.toLowerCase()) || 
        (o.itemCode ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (o.orderDate ?? '').includes(search.trim());
      return matchKind && matchSearch;
    });
  }, [orders, kindFilter, search]);

  const handleSaveOrder = (data: WigOrderInput) => {
    if (editingOrder) {
      updateOrder.mutate({ id: editingOrder.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWigOrdersQueryKey() });
          setIsFormOpen(false);
          setEditingOrder(null);
          toast({ title: "Order updated successfully." });
        },
        onError: () => toast({ title: "Failed to update order.", variant: "destructive" })
      });
    } else {
       createOrder.mutate({ data: { ...data, kind: 'custom' } }, {
         onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListWigOrdersQueryKey() });
          setIsFormOpen(false);
           setSearch('');
           setKindFilter('all');
           setExpandedId(created.id);
           toast({ title: "Order saved and receipt issued." });
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
                    <h3 className="font-semibold text-lg truncate">{order.customerName || 'Name needed'}</h3>
                   <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1 flex flex-wrap items-center gap-2">
                     <span className="font-mono-ui uppercase text-[10px] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] px-2 py-0.5 rounded">{order.kind}</span>
                      <span className="font-medium">{order.itemCode || 'Code needed'}</span>
                     <span>·</span>
                     <span>{formatDay(order.orderDate)}</span>
                      {order.needsReview && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Needs review</span>}
                   </div>
                 </div>
                 <div className="flex items-center gap-6 shrink-0">
                   <div className="text-right">
                     <div className="font-semibold">{formatMoney(order.totalCents)}</div>
                      <div className={`text-xs mt-0.5 ${(order.amountDueCents ?? 0) > 0 ? 'text-[hsl(var(--destructive))] font-medium' : 'text-[hsl(150_35%_40%)]'}`}>
                        {order.amountDueCents === null ? 'Needs review' : order.amountDueCents > 0 ? `Due: ${formatMoney(order.amountDueCents)}` : 'Paid'}
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
            <SheetDescription>{editingOrder ? 'Update the wig order details.' : 'Saving a new custom wig order also issues its first receipt.'}</SheetDescription>
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

    </div>
  );
}
