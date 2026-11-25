"use client";

import { useEffect, useState } from "react";
import { layoutColumns } from "@/lib/record-layout";
import { fieldLabel } from "@/lib/setup-metadata";
import { recordFieldsObjects, type RecordPageData } from "@/lib/record-pages";
import CustomValues from "./custom-values";
import { useStaffAccess } from "./staff-access-context";

type RecordRef = { entity: string; id: string };
const display = (value: unknown) => value == null || value === "" ? "—"
  : typeof value === "boolean" ? value ? "Yes" : "No"
  : typeof value === "object" ? JSON.stringify(value) : String(value);

export default function RecordPage({ record, onClose, onEdit }: {
  record: RecordRef;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const access = useStaffAccess();
  const [editingFields, setEditingFields] = useState(false);
  const [revision, setRevision] = useState(0);
  const [trail, setTrail] = useState<RecordRef[]>([]);
  const [tab, setTab] = useState("Details");
  const [paging, setPaging] = useState({ list: "", offset: 0 });
  const [data, setData] = useState<RecordPageData | null>(null);
  const [error, setError] = useState("");
  const current = trail.at(-1) ?? record;

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
  }, [current.entity, current.id, paging, revision]);

  function resetView() {
    setTab("Details");
    setPaging({ list: "", offset: 0 });
    setData(null);
  }

  function resetViewAndOpen(next: RecordRef) {
    resetView();
    setTrail(previous => [...previous, next]);
  }

  const editRecord = !trail.length && onEdit
    ? onEdit
    : recordFieldsObjects.includes(current.entity) && access.can(current.entity, "EDIT")
      ? () => setEditingFields(true)
      : undefined;
  const selected = data?.tabs.find(item => item.label === tab);
  return <section className="space-y-5 rounded-2xl border bg-white p-4 sm:p-6">
    <button type="button" className="text-sm font-semibold text-indigo-700" onClick={() => {
      if (!trail.length) onClose();
      else { resetView(); setTrail(trail.slice(0, -1)); }
    }}>← Back</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && !error && <p role="status">Loading record…</p>}
    {data && <>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
        <div>
          <p className="text-sm text-slate-500">{fieldLabel(current.entity)}</p>
          <h2 className="break-words text-xl font-semibold text-slate-950">{data.title}</h2>
        </div>
        {editRecord && <button type="button" className="rounded-lg border bg-white px-4 py-2" onClick={editRecord}>{!trail.length && onEdit ? "Edit" : "Edit record fields"}</button>}
      </header>
      {editingFields && <CustomValues entity={current.entity} id={current.id}
        onClose={() => setEditingFields(false)} onSaved={() => setRevision(value => value + 1)}/>}
      <nav aria-label="Record sections" className="flex flex-wrap gap-2 border-b">
        {["Details", ...data.tabs.map(item => item.label)].map(label => <button type="button" key={label}
          aria-current={tab === label ? "page" : undefined}
          className={tab === label ? "border-b-2 border-indigo-600 px-4 py-2 font-semibold text-indigo-700" : "px-4 py-2 text-slate-600"}
          onClick={() => { setTab(label); if (paging.offset) setPaging({ list: "", offset: 0 }); }}>{label}</button>)}
      </nav>
      {!selected && (data.sections.length ? data.sections.map(section => <section key={section.name} className="rounded-xl border p-4">
        <h3 className="mb-3 font-semibold">{section.name}</h3>
        <dl className={layoutColumns(section.columns)}>{section.fields.map((field, index) => <div key={index} className="min-w-0">
          <dt className="text-sm text-slate-500">{field.label}</dt>
          <dd className="break-words text-sm font-medium">{field.lookup
            ? <button type="button" className="text-indigo-700 hover:underline" onClick={() => resetViewAndOpen(field.lookup!)}>{display(field.value)}</button>
            : display(field.value)}</dd>
        </div>)}</dl>
      </section>) : <p className="text-sm text-slate-500">No fields are available in this layout.</p>)}
      {selected?.lists.map(list => {
        const offset = paging.list === list.key ? paging.offset : 0;
        return <section key={list.key} className="overflow-hidden rounded-xl border">
          <h3 className="border-b bg-slate-50 px-4 py-3 font-semibold">{list.label}</h3>
          {list.rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr>{list.columns.map(column => <th key={column.key} scope="col" className="px-4 py-2">{column.label}</th>)}
              <th scope="col" className="px-4 py-2">Record</th></tr></thead>
            <tbody>{list.rows.map(row => <tr key={row.id} className="border-t">
              {list.columns.map(column => <td key={column.key} className="px-4 py-2">{display(row[column.key])}</td>)}
              <td className="px-4 py-2"><button type="button" className="text-indigo-700"
                onClick={() => { resetView(); setTrail([...trail, { entity: list.target, id: row.id }]); }}>Open</button></td>
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


export function OpenRecordPage({ entity, id }: RecordRef) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="block text-xs font-medium text-indigo-700 hover:underline" onClick={() => setOpen(true)}>
      Open record
    </button>
    {open && <div className="fixed inset-0 z-[65] overflow-y-auto bg-slate-900/60 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl" role="dialog" aria-modal="true" aria-label={fieldLabel(entity) + " record"}>
        <RecordPage record={{ entity, id }} onClose={() => setOpen(false)}/>
      </div>
    </div>}
  </>;
}
