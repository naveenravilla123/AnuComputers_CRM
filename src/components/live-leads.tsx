"use client";

import RecordDialog from "./record-dialog";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import MetadataFields, { type Field, type Values } from "./metadata-fields";
import RecordPage from "./record-page";
import { closeCrmRecord, openCrmRecord, useCrmUrl } from "@/lib/crm-navigation";
import { recordSections } from "@/lib/metadata-runtime";
import { SalesTable, SalesFilters, SalesStatus, statusLabel } from "./sales-table";
import { canEditStaffField, canReadStaffField, type StaffAccess } from "@/lib/staff-field-access";
import { hasStaffPermission } from "@/lib/staff-permission-check";

const stages = ["NEW", "CONTACTED", "QUALIFIED", "NEGOTIATION", "WON", "LOST"];
const sources = ["WALK_IN", "PHONE", "WHATSAPP", "WEBSITE", "INSTAGRAM", "FACEBOOK", "REFERRAL", "OTHER"];
type Lead = { id: string; name: string; phone: string | null; interest: string | null; source: string; stage: string; customerId: string | null };
const blank = { id: "", name: "", phone: "", interest: "", source: "WALK_IN", stage: "NEW" };
type Form = typeof blank;
const standardFields: Field[] = [
  { key: "name", label: "Name", type: "TEXT", required: true },
  { key: "phone", label: "Phone", type: "PHONE", required: false },
  { key: "interest", label: "Interest", type: "TEXT", required: false },
  { key: "source", label: "Source", type: "PICKLIST", required: true, options: sources },
  { key: "stage", label: "Stage", type: "PICKLIST", required: true, options: stages },
];

export default function LiveLeads({ staffAccess }: { staffAccess?: StaffAccess }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [conversion, setConversion] = useState<Lead | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [metadata, setMetadata] = useState<{ fields: Field[]; sections: unknown; standardOverrides?: Record<string, {
    label: string; required: boolean;
  }> } | null>(null);
  const [custom, setCustom] = useState<Values>({});
  const [metaError, setMetaError] = useState("");
  const allowed = (action: "CREATE" | "EDIT") => !staffAccess || hasStaffPermission(staffAccess, "Lead", action);
  const canRead = (key: string) => !staffAccess || canReadStaffField(staffAccess, "Lead", key);
  const canEdit = (key: string) => !staffAccess || canEditStaffField(staffAccess, "Lead", key);
  const canCreateLead = allowed("CREATE") && canEdit("name");
  const canEditLead = allowed("EDIT") && (standardFields.some(field => canEdit(field.key)) ||
    !!staffAccess?.fieldPermissions.some(grant => grant.startsWith("Lead:custom_") && grant.endsWith(":EDIT")));
  const canConvert = !staffAccess || (allowed("EDIT") && canEdit("customerId") &&
    hasStaffPermission(staffAccess, "Customer", "CREATE") &&
    ["name", "phone", "source"].every(key => canEditStaffField(staffAccess, "Customer", key)) &&
    canReadStaffField(staffAccess, "Customer", "phone"));
  const canOpenCustomer = !staffAccess || hasStaffPermission(staffAccess, "Customer", "READ");
  const formId = form?.id;
  const route = useCrmUrl();
  const recordId = route.get("object") === "Lead" ? route.get("record") : null;
  const current = rows.find(row => row.id === recordId);
  const [view, setView] = useState<"list" | "board">(() => route.get("module") === "Opportunities" ? "board" : "list");
  const isBoard = view === "board";

  useEffect(() => {
    if (formId === undefined) return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      fetch("/api/record-metadata?entity=Lead", { signal }),
      formId ? fetch("/api/custom-values?entity=Lead&id=" + encodeURIComponent(formId), { signal }) : null,
    ]).then(async ([layout, record]) => {
      if (!layout.ok || record && !record.ok) throw Error("Unable to load the enquiry layout");
      const next = await layout.json();
      const values = record ? (await record.json()).values : {};
      if (!signal.aborted) { setMetadata(next); setCustom(values ?? {}); }
    }).catch(error => { if (!signal.aborted) setMetaError(error.message); });
    return () => controller.abort();
  }, [formId]);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    fetch("/api/leads", { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (!controller.signal.aborted) setRows(result);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [revision]);

  function openForm(lead?: Lead) {
    setMetadata(null);
    setCustom({});
    setMetaError("");
    setError("");
    setForm(lead ? { ...blank, id: lead.id, name: lead.name ?? "", phone: lead.phone ?? "", interest: lead.interest ?? "",
      source: lead.source ?? blank.source, stage: lead.stage ?? blank.stage } : { ...blank });
  }

  const fields = [
    ...standardFields.filter(field => canRead(field.key)).map(field => ({
      ...field, ...metadata?.standardOverrides?.[field.key], editable: canEdit(field.key),
    })),
    ...metadata?.fields ?? [],
  ];

  async function save(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (body.action === "convert") {
        setRows(previous => previous.map(row => row.id === result.id ? { ...row, ...result } : row));
        setConversion(null);
        setNotice("Customer linked to this enquiry.");
      }
      if (form && !form.id && result.id) openCrmRecord({ entity: "Lead", id: result.id });
      setForm(null);
      setRevision(value => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save enquiry");
    } finally {
      setBusy(false);
    }
  }

  function saveForm() {
    if (!form || !metadata || (form.id ? !canEditLead : !canCreateLead)) return;
    const keys = new Set(recordSections(metadata.sections, fields.map(field => field.key),
      fields.filter(field => field.required).map(field => field.key)).flatMap(section => section.fields));
    const editable = (field: Field) => field.editable !== false && keys.has(field.key);
    const values = { ...form, ...custom };
    const standard = Object.fromEntries(fields.filter(field => editable(field) && standardFields.some(item => item.key === field.key))
      .map(field => [field.key, values[field.key as keyof Form]]));
    const customValues = Object.fromEntries(metadata.fields.filter(editable).map(field => [field.key, custom[field.key]]));
    return save({ ...(form.id ? { id: form.id } : {}), ...standard, customValues });
  }

  const searchKeys = (["name", "phone", "interest", "source"] as const).filter(canRead);
  const visible = rows.filter(row => (!canRead("stage") || !filter || row.stage === filter) &&
    searchKeys.map(key => String(row[key] ?? "")).join(" ").toLowerCase().includes(query.toLowerCase()));
  const columns = ([
    ["phone", "Phone"], ["interest", "Interest"], ["source", "Source"], ["stage", "Stage"],
  ] as const).filter(([key]) => canRead(key));
  const showActions = canEditLead || canConvert || canRead("customerId");

  function recordName(row: Lead) {
    return <button type="button" className="text-left font-semibold text-indigo-700 hover:underline"
      onClick={() => openCrmRecord({ entity: "Lead", id: row.id })}>
      {canRead("name") && row.name ? row.name : "Open enquiry"}
    </button>;
  }

  function actions(row: Lead, onRecord = false) {
    return <div className="flex flex-wrap gap-3 text-sm">
      {!onRecord && canEditLead && <button type="button" className="text-indigo-700" onClick={() => openForm(row)}>Edit</button>}
      {canRead("customerId") && row.customerId
        ? canOpenCustomer
          ? <button type="button" className="font-medium text-indigo-700 hover:underline"
            onClick={() => openCrmRecord({ entity: "Customer", id: row.customerId! })}>Open linked customer</button>
          : <span className="text-emerald-700">Customer linked</span>
        : canConvert && ["QUALIFIED", "NEGOTIATION", "WON"].includes(row.stage) && <>
          <button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy || !row.phone?.trim()}
            onClick={() => { setError(""); setNotice(""); setConversion(row); }}>
            Convert to Customer
          </button>
          {!row.phone?.trim() && canRead("phone") && <span className="self-center text-slate-600">Add a phone number to convert.</span>}
        </>}
    </div>;
  }

  return <>
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
    {conversion && <RecordDialog label="Convert to Customer" width="max-w-md"
      onSubmit={event => { event.preventDefault(); if (canConvert) void save({ action: "convert", id: conversion.id }); }} actions={<>
          <button type="button" disabled={busy} onClick={() => { setConversion(null); setError(""); }}>Cancel</button>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy || !canConvert}>{busy ? "Converting…" : "Convert"}</button>
      </>}>
        <h2 className="text-lg font-semibold">Convert to Customer</h2>
        <p className="text-sm text-slate-600">An existing customer with the same phone number will be linked. If there is no match, a customer will be created from the enquiry.</p>
        <p className="text-sm font-medium">{[conversion.name, conversion.phone].filter(Boolean).join(" · ")}</p>
        {error && <p role="alert" className="text-red-700">{error}</p>}
    </RecordDialog>}
    {recordId && <RecordPage key={recordId} record={{ entity: "Lead", id: recordId }} onClose={closeCrmRecord}
      customEdit={false} revision={revision} onEdit={current && canEditLead ? () => openForm(current) : undefined}
      actions={current ? actions(current, true) : undefined}/>}
    {recordId && !form && !conversion && error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <section hidden={!!recordId} className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Enquiries</h2>
      {canRead("stage") && <div role="group" aria-label="Enquiry view" className="flex gap-2">
        {(["list", "board"] as const).map(option => <button key={option} type="button" aria-pressed={view === option}
          className="rounded-lg border px-3 py-2 capitalize" onClick={() => setView(option)}>{option}</button>)}
      </div>}
      {canCreateLead && <button type="button" className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
        onClick={() => openForm()}><Plus size={16}/> New enquiry</button>}
    </div>
    {!form && !conversion && error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <SalesFilters query={query} onQuery={setQuery} status={filter} onStatus={setFilter} statuses={stages} showStatus={canRead("stage")}/>
    {isBoard && canRead("stage") ? <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.filter(stage => !filter || stage === filter).map(stage => <section key={stage} className="min-w-56 flex-1 space-y-3 rounded-xl bg-slate-50 p-3">
        <h3 className="font-semibold">{statusLabel(stage)}</h3>
        {visible.filter(row => row.stage === stage).map(row => <article key={row.id} className="space-y-2 rounded-lg border bg-white p-3">
          {recordName(row)}{canRead("interest") && row.interest && <p className="text-sm">{row.interest}</p>}{actions(row)}
        </article>)}
      </section>)}
    </div> : <SalesTable headers={["Enquiry", ...columns.map(([, label]) => label), ...(showActions ? ["Actions"] : [])]}
      empty={!visible.length} busy={busy} emptyMessage="No matching enquiries.">
      {visible.map(row => <tr key={row.id}>
        <td>{recordName(row)}</td>
        {columns.map(([key]) => <td key={key}>{key === "stage" && row.stage ? <SalesStatus value={row.stage}/>
          : key === "source" && row.source ? statusLabel(row.source) : row[key] || "—"}</td>)}
        {showActions && <td>{actions(row)}</td>}
      </tr>)}
    </SalesTable>}
    </section>
    {form && <RecordDialog label={form.id ? "Edit enquiry" : "New enquiry"}
      onSubmit={event => { event.preventDefault(); void saveForm(); }} actions={<>
          <button type="button" disabled={busy} className="rounded-lg border px-4 py-2"
            onClick={() => { setForm(null); setError(""); }}>Cancel</button>
          <button disabled={busy || !metadata} className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save enquiry"}
          </button>
      </>}>
        <h2 className="text-lg font-semibold">{form.id ? "Edit enquiry" : "New enquiry"}</h2>
        {!metadata && !metaError && <p role="status">Loading enquiry layout…</p>}
        {metaError && <p role="alert" className="text-red-700">{metaError}</p>}
        {metadata && <MetadataFields fields={fields} sections={metadata.sections} values={{ ...form, ...custom }}
          onChange={(key, value) => {
            if (metadata.fields.some(field => field.key === key)) setCustom(previous => ({ ...previous, [key]: value }));
            else setForm(previous => previous && ({ ...previous, [key]: String(value) }));
          }}/>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
    </RecordDialog>}
  </>;
}
