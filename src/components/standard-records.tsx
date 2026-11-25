"use client";

import RecordPage from "./record-page";
import { recordPageObjects } from "@/lib/record-pages";
import { useEffect, useState } from "react";
import { customObjectStandardFields } from "@/lib/custom-object-fields";
import { fieldLabel } from "@/lib/setup-metadata";

type RecordData = Record<string, unknown>;
type ResponseData = {
  rows: RecordData[];
  hasMore: boolean;
  tracking: boolean;
  audit: RecordData | null;
  customValues: RecordData;
};

export function RecordDetails({ fields }: { fields: { label: string; value: unknown }[] }) {
  return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {fields.map(({ label, value }, index) => <div key={index} className="min-w-0 rounded border p-3">
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 break-words whitespace-pre-wrap">{value === null || value === undefined || value === ""
        ? "—" : typeof value === "boolean" ? (value ? "Yes" : "No")
        : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}</dd>
    </div>)}
  </dl>;
}

export default function StandardRecords({ entity, customFields }: {
  entity: string;
  customFields: { key: string; label: string }[];
}) {
  const [showPage, setShowPage] = useState(false);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ResponseData | null>(null);
  const [error, setError] = useState("");
  const [enabling, setEnabling] = useState(false);
  const [scriptError, setScriptError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    const params = new URLSearchParams({ entity, q: query, offset: String(offset) });
    if (selected) params.set("id", selected);
    fetch("/api/setup/standard-records?" + params, { signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      if (!controller.signal.aborted) setData(value);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [entity, selected, query, offset, revision]);

  async function enableAudit() {
    setEnabling(true);
    setScriptError("");
    try {
      const response = await fetch("/api/setup/standard-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enableAudit" }),
      });
      if (!response.ok) throw Error((await response.json()).error);
      setRevision(value => value + 1);
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : "Unable to enable tracking");
    } finally {
      setEnabling(false);
    }
  }

  const record = selected ? data?.rows[0] : undefined;
  const recordLabel = (row: RecordData) => String(row.name ?? row.number ?? row.sku ?? row.issue ?? row.id);

  if (showPage && selected) return <RecordPage record={{ entity, id: selected }} onClose={() => setShowPage(false)} />;

  return <section className="space-y-4 border-t pt-4">
    <h4 className="font-semibold">{selected ? "Record Details" : "Records"}</h4>
    {error && <p role="alert">{error}</p>}
    {scriptError && <p role="alert">{scriptError}</p>}
    {!data && !error && <p role="status">Loading records…</p>}
    {data && !data.tracking && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
      <p>Enable or upgrade audit tracking for future standard-record changes. Existing audit history is preserved.</p>
      <button type="button" className="mt-2 rounded border bg-white px-3 py-2" disabled={enabling}
        onClick={enableAudit}>{enabling ? "Enabling…" : "Enable audit tracking"}</button>
    </div>}
    {selected ? <>
      <button type="button" className="text-indigo-700" onClick={() => setSelected("")}>← Back to Records</button>
      {record && <>
        <h5 className="text-lg font-semibold">{recordLabel(record)}</h5>
        {recordPageObjects.includes(entity) && <button type="button" className="rounded border px-3 py-2"
          onClick={() => setShowPage(true)}>Open record page</button>}
        <RecordDetails fields={[
          ...customObjectStandardFields.filter(field => field.key !== "Name").map(field => ({
            label: field.label, value: field.storage === "id" ? record.id
              : data?.audit?.[field.storage] ?? record[field.storage],
          })),
          ...Object.entries(record).filter(([key]) => key !== "id" && key !== "createdAt" && key !== "updatedAt")
            .map(([key, value]) => ({ label: fieldLabel(key), value })),
          ...customFields.map(field => ({ label: field.label, value: data?.customValues[field.key] })),
        ]} />
      </>}
    </> : <>
      <label className="block text-sm">Find records <input className="ml-2 rounded border p-2" value={query}
        onChange={event => { setOffset(0); setQuery(event.target.value); }} /></label>
      {data && !data.rows.length && <p>No records found.</p>}
      {data && !!data.rows.length && <ul className="divide-y rounded border">
        {data.rows.map(row => <li key={String(row.id)}>
          <button type="button" className="w-full break-words p-3 text-left text-indigo-700 hover:bg-slate-50"
            onClick={() => setSelected(String(row.id))}>{recordLabel(row)}</button>
        </li>)}
      </ul>}
      {(offset > 0 || data?.hasMore) && <div className="flex gap-3">
        <button type="button" disabled={offset === 0} onClick={() => setOffset(value => value - 50)}>Previous</button>
        <button type="button" disabled={!data?.hasMore} onClick={() => setOffset(value => value + 50)}>Next</button>
      </div>}
    </>}
  </section>;
}
