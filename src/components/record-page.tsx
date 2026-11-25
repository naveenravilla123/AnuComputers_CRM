"use client";

import { useEffect, useState, type ReactNode } from "react";
import { layoutColumns } from "@/lib/record-layout";
import { fieldLabel } from "@/lib/setup-metadata";
import { recordFieldsObjects, recordPageObjects, type RecordPageData } from "@/lib/record-pages";
import CustomValues from "./custom-values";
import { useStaffAccess } from "./staff-access-context";

import { closeCrmRecord, navigateRecordTab, openCrmRecord, useCrmUrl, type RecordRef } from "@/lib/crm-navigation";
const display = (value: unknown) => value == null || value === "" ? "—"
  : typeof value === "boolean" ? value ? "Yes" : "No"
  : typeof value === "object" ? JSON.stringify(value) : String(value);

export default function RecordPage({ record, onClose, onEdit, actions, revision: externalRevision = 0, customEdit = true }: {
  record: RecordRef;
  onClose: () => void;
  onEdit?: () => void;
  actions?: ReactNode;
  revision?: number;
  customEdit?: boolean;
}) {
  const access = useStaffAccess();
  const [editingFields, setEditingFields] = useState(false);
  const [revision, setRevision] = useState(0);
  const requestedTab = useCrmUrl().get("tab") ?? "Details";
  const [paging, setPaging] = useState({ list: "", offset: 0 });
  const [data, setData] = useState<RecordPageData | null>(null);
  const [error, setError] = useState("");
  const current = record;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ...current, list: paging.list, offset: String(paging.offset) });
    setData(null);
    setError("");
    fetch("/api/record-page?" + params, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        if (!controller.signal.aborted) setData(body);
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [current.entity, current.id, paging, revision, externalRevision]);

  const editRecord = onEdit
    ? onEdit
    : customEdit && recordFieldsObjects.includes(current.entity) && access.can(current.entity, "EDIT")
      ? () => setEditingFields(true)
      : undefined;
  const selected = data?.tabs.find(item => item.label === requestedTab);
  const tab = selected?.label ?? "Details";
  return <section className="space-y-5 rounded-2xl border bg-white p-4 sm:p-6">
    <button type="button" className="text-sm font-semibold text-indigo-700" onClick={onClose}>← Back</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && !error && <p role="status">Loading record…</p>}
    {data && <>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
        <div>
          <p className="text-sm text-slate-500">{fieldLabel(current.entity)}</p>
          <h2 className="break-words text-xl font-semibold text-slate-950">{data.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}{editRecord && <button type="button" className="rounded-lg border bg-white px-4 py-2" onClick={editRecord}>{onEdit ? "Edit" : "Edit record fields"}</button>}</div>
      </header>
      {editingFields && <CustomValues entity={current.entity} id={current.id}
        onClose={() => setEditingFields(false)} onSaved={() => setRevision(value => value + 1)}/>}
      <nav aria-label="Record sections" className="flex flex-wrap gap-2 border-b">
        {["Details", ...data.tabs.map(item => item.label)].map(label => <button type="button" key={label}
          aria-current={tab === label ? "page" : undefined}
          className={tab === label ? "border-b-2 border-indigo-600 px-4 py-2 font-semibold text-indigo-700" : "px-4 py-2 text-slate-600"}
          onClick={() => { navigateRecordTab(label); if (paging.offset) setPaging({ list: "", offset: 0 }); }}>{label}</button>)}
      </nav>
      {!selected && (data.sections.length ? data.sections.map(section => <section key={section.name} className="rounded-xl border p-4">
        <h3 className="mb-3 font-semibold">{section.name}</h3>
        <dl className={layoutColumns(section.columns)}>{section.fields.map((field, index) => <div key={index} className="min-w-0">
          <dt className="text-sm text-slate-500">{field.label}</dt>
          <dd className="break-words text-sm font-medium">{field.lookup
            ? <button type="button" className="text-indigo-700 hover:underline" onClick={() => openCrmRecord(field.lookup!)}>{display(field.value)}</button>
            : display(field.value)}</dd>
        </div>)}</dl>
      </section>) : <p className="text-sm text-slate-500">No fields are available in this layout.</p>)}
      {selected?.lists.map(list => {
        const offset = paging.list === list.key ? paging.offset : 0;
        return <section key={list.key} className="overflow-hidden rounded-xl border">
          <h3 className="border-b bg-slate-50 px-4 py-3 font-semibold">{list.label}</h3>
          {list.rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr>{list.columns.map(column => <th key={column.key} scope="col" className="px-4 py-2">{column.label}</th>)}
              </tr></thead>
            <tbody>{list.rows.map(row => <tr key={row.id} className="border-t">
              {list.columns.map((column, index) => <td key={column.key} className="px-4 py-2">{index === 0 ? <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => openCrmRecord({ entity: list.target, id: row.id })}>{display(row[column.key]) === "—" ? "Open record" : display(row[column.key])}</button> : display(row[column.key])}</td>)}
            </tr>)}</tbody>
          </table></div> : <p className="p-4 text-sm text-slate-500">No related records.</p>}
          {(offset > 0 || list.hasMore) && <div className="flex gap-4 px-4 py-3 text-sm">
            <button type="button" disabled={!offset} onClick={() => setPaging({ list: list.key, offset: offset - 50 })}>Previous</button>
            <button type="button" disabled={!list.hasMore} onClick={() => setPaging({ list: list.key, offset: offset + 50 })}>Next</button>
          </div>}
        </section>;
      })}
    </>}
  </section>;
}


export function OpenRecordPage({ entity, id, children }: RecordRef & { children?: ReactNode }) {
  return <button type="button" className="block break-all text-left font-medium text-indigo-700 hover:underline"
    onClick={() => openCrmRecord({ entity, id })}>{children || "Open record"}</button>;
}

export function useRoutedRecord(inlineEntity?: string) {
  const route = useCrmUrl();
  const entity = route.get("object");
  const id = route.get("record");
  if (!entity || !id || !recordPageObjects.includes(entity) || entity === inlineEntity) return null;
  return { entity, id };
}

export function RoutedRecordPage({ record }: { record: RecordRef }) {
  return <RecordPage key={record.entity + ":" + record.id} record={record} onClose={closeCrmRecord}/>;
}
