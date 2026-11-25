"use client";

import { useEffect, useId, useRef, useState } from "react";
import MetadataFields, { type Field, type Values } from "./metadata-fields";
import { useStaffAccess } from "./staff-access-context";
import { useNewRecordFields } from "./new-asset-fields";

type Option = { id: string; name: string; phone?: string };
const standardFields: Field[] = [
  { key: "name", label: "Name", type: "TEXT", required: true },
  { key: "phone", label: "Phone", type: "PHONE", required: true },
  { key: "email", label: "Email", type: "EMAIL", required: false },
  { key: "address", label: "Address", type: "TEXTAREA", required: false },
  { key: "source", label: "Source", type: "TEXT", required: false },
];

export default function CustomerLookup({ value, onChange, required, disabled, label = "Customer" }: {
  value: string; onChange: (id: string) => void; required?: boolean; disabled?: boolean; label?: string;
}) {
  const access = useStaffAccess();
  const canLookup = access.canRead("Customer", "name");
  const canCreate = canLookup && access.can("Customer", "CREATE") &&
    access.canEdit("Customer", "name") && access.canEdit("Customer", "phone");
  const canReadPhone = access.canRead("Customer", "phone");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);
  const [items, setItems] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const metadata = useNewRecordFields("Customer", creating);

  useEffect(() => {
    input.current?.setCustomValidity(required && !value ? "Select a customer from the results." : "");
  }, [required, value, creating]);

  useEffect(() => {
    if (!value || value === selected?.id || !canLookup) return;
    const controller = new AbortController();
    fetch("/api/customers/lookup?id=" + encodeURIComponent(value), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Unable to load selected customer");
        return response.json();
      }).then(data => {
        if (!controller.signal.aborted) setSelected(data.items[0] ?? null);
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [value, selected?.id, canLookup]);

  useEffect(() => {
    if (!open || disabled || !canLookup || creating) return;
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    setError("");
    const timer = window.setTimeout(() => {
      fetch("/api/customers/lookup?q=" + encodeURIComponent(query), { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw Error("Unable to search customers");
          return response.json();
        }).then(data => { if (!controller.signal.aborted) setItems(data.items); })
        .catch(error => { if (!controller.signal.aborted) setError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, open, disabled, canLookup, creating]);

  function choose(customer: Option) {
    setSelected(customer);
    setQuery("");
    setOpen(false);
    setCreating(false);
    setError("");
    onChange(customer.id);
  }

  async function createCustomer() {
    if (!canCreate || !metadata.fields || saving) return;
    const name = String(draft.name ?? "").trim();
    const phone = String(draft.phone ?? "").trim();
    if (!name || !phone) { setError("Enter a customer name and phone."); return; }
    setSaving(true);
    setError("");
    try {
      const standard = Object.fromEntries(standardFields.filter(field => access.canEdit("Customer", field.key) &&
        Object.hasOwn(draft, field.key)).map(field => [field.key, String(draft[field.key])]));
      const customValues = Object.fromEntries(metadata.fields.filter(field => field.editable !== false)
        .map(field => [field.key, draft[field.key]]));
      const response = await fetch("/api/customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...standard, name, phone, customValues }),
      });
      const customer = await response.json();
      if (!response.ok || !customer.id) throw Error(customer.error ?? "Unable to create customer");
      choose({ id: customer.id, name: customer.name ?? name, phone: customer.phone });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create customer");
    } finally { setSaving(false); }
  }

  const createFields = [
    ...standardFields.filter(field => access.canEdit("Customer", field.key)).map(field => ({
      ...field, ...metadata.standardOverrides[field.key], required: field.required || !!metadata.standardOverrides[field.key]?.required,
    })),
    ...(metadata.fields ?? []),
  ];

  return <div className="space-y-2">
    <label htmlFor={inputId} className="text-sm font-medium">{label}{required ? " *" : ""}</label>
    <input ref={input} id={inputId} type="search" autoComplete="off"
      className="w-full rounded-xl border bg-white p-3 text-sm"
      placeholder={canReadPhone ? "Search by customer name or phone" : "Search by customer name"}
      value={value && selected?.id === value ? selected.name : query}
      disabled={disabled || !canLookup} onFocus={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setOpen(true); if (value) onChange(""); }}
      onKeyDown={event => {
        if (event.key === "Enter" && open) event.preventDefault();
        if (event.key === "Escape") setOpen(false);
      }}/>
    {!canLookup && <p className="text-sm text-slate-500">Customer lookup requires access to the Customer name field.</p>}
    {open && !creating && !disabled && canLookup && <div className="space-y-2 rounded-lg border p-2">
      {loading ? <p role="status" className="text-sm">Searching customers…</p>
        : !items.length && !error && <p className="text-sm">No matching customers.</p>}
      {items.length > 0 && <ul className="max-h-40 overflow-auto divide-y">
        {items.map(customer => <li key={customer.id}><button type="button"
          className="w-full p-2 text-left text-sm hover:bg-slate-50" onClick={() => choose(customer)}>
          {customer.name}{customer.phone && <span className="text-slate-500"> · {customer.phone}</span>}
        </button></li>)}
      </ul>}
      {canCreate && <button type="button" className="px-2 text-sm font-medium text-indigo-700"
        onClick={() => {
          setError("");
          setDraft(/^[-+()\d\s]+$/.test(query) ? { phone: query.trim() } : { name: query.trim() });
          setCreating(true);
        }}>New customer</button>}
      <button type="button" className="px-2 text-sm text-slate-600" onClick={() => setOpen(false)}>Close results</button>
    </div>}
    {creating && <fieldset disabled={saving} className="space-y-3 rounded-lg border p-3"
      onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
      <legend className="px-2 text-sm font-semibold">New customer</legend>
      {metadata.error && <p role="alert" className="text-red-700">{metadata.error}</p>}
      {metadata.fields && <MetadataFields fields={createFields} sections={metadata.sections} values={draft}
        onChange={(key, next) => setDraft(previous => ({ ...previous, [key]: next }))}/>}
      <div className="flex gap-3">
        <button type="button" className="rounded-lg border px-3 py-2" onClick={() => { setCreating(false); setError(""); }}>Cancel</button>
        <button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
          disabled={!metadata.fields || saving} onClick={() => void createCustomer()}>{saving ? "Creating…" : "Create and select"}</button>
      </div>
    </fieldset>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
