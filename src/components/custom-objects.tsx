"use client";

import { useEffect, useState } from "react";

type Field = { key: string; label: string; type: "text" | "number" | "checkbox" };
type Values = Record<string, string | number | boolean>;
type CustomObject = { key: string; definition: { name: string; lookup: string | null; fields?: Field[] } };
type RecordRow = { id: string; record: {
  name: string;
  values?: Values;
  lookupId: string | null;
  createdBy: string | null;
  lastModifiedBy: string | null;
  owner: string | null;
} };

function useRecords(object: string, revision: number) {
  const [data, setData] = useState<{ objects: CustomObject[]; records: RecordRow[] }>({ objects: [], records: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(previous => ({ ...previous, records: [] }));
    setError("");
    fetch("/api/setup/custom-objects" + (object ? "?object=" + encodeURIComponent(object) : ""), {
      signal: controller.signal,
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (!controller.signal.aborted) setData(result);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [object, revision]);
  return { ...data, error };
}

const input = "block w-full rounded border p-2";
const button = "rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50";

export default function CustomObjects() {
  const [object, setObject] = useState("");
  const [revision, setRevision] = useState(0);
  const [definition, setDefinition] = useState({ key: "", name: "", lookup: "" });
  const [fields, setFields] = useState<Field[]>([]);
  const [draft, setDraft] = useState<{ id?: string; name: string; lookupId: string; values: Values }>({ name: "", lookupId: "", values: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = useRecords(object, revision);
  const current = data.objects.find(item => item.key === object);
  const related = useRecords(current?.definition.lookup ?? "", revision);
  const resetRecord = () => setDraft({ name: "", lookupId: "", values: {} });

  async function save(payload: object) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/setup/custom-objects", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (result.object) {
        setObject(result.object);
        setDefinition({ key: "", name: "", lookup: "" });
        setFields([]);
      }
      resetRecord();
      setRevision(value => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-white p-4">
    <h3 className="font-semibold">Custom objects</h3>
    {(error || data.error || related.error) && <p role="alert">{error || data.error || related.error}</p>}
    <details>
      <summary>New custom object</summary>
      <form className="mt-3 space-y-2" onSubmit={event => {
        event.preventDefault();
        void save({ action: "define", object: definition.key, name: definition.name, lookup: definition.lookup, fields });
      }}>
        <label>Object label <input className={input} required maxLength={100} value={definition.name}
          onChange={event => setDefinition({ ...definition, name: event.target.value })} /></label>
        <label>Object key <input className={input} required pattern="[a-z][a-z0-9_]{0,39}" value={definition.key}
          onChange={event => setDefinition({ ...definition, key: event.target.value })} /></label>
        <label>Lookup object <select className={input} value={definition.lookup}
          onChange={event => setDefinition({ ...definition, lookup: event.target.value })}>
          <option value="">None</option>
          {data.objects.map(item => <option key={item.key} value={item.key}>{item.definition.name}</option>)}
        </select></label>
        {fields.map((field, index) => <fieldset key={index} className="grid gap-2 rounded border p-2 sm:grid-cols-3">
          <label>Field label <input required className={input} maxLength={100} value={field.label}
            onChange={event => setFields(previous => previous.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /></label>
          <label>Field key <input required className={input} pattern="[a-z][a-z0-9_]{0,39}" value={field.key}
            onChange={event => setFields(previous => previous.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} /></label>
          <label>Type <select className={input} value={field.type}
            onChange={event => setFields(previous => previous.map((item, i) => i === index ? { ...item, type: event.target.value as Field["type"] } : item))}>
            <option value="text">Text</option><option value="number">Number</option><option value="checkbox">Checkbox</option>
          </select></label>
          <button type="button" onClick={() => setFields(previous => previous.filter((_, i) => i !== index))}>Remove field</button>
        </fieldset>)}
        <button type="button" className="mr-3" disabled={fields.length >= 30}
          onClick={() => setFields(previous => [...previous, { key: "", label: "", type: "text" }])}>Add field</button>
        <button className={button} disabled={busy}>Create object</button>
      </form>
    </details>
    <label>Object <select className={input} disabled={busy} value={object} onChange={event => {
      setObject(event.target.value);
      resetRecord();
    }}>
      <option value="">Select an object</option>
      {data.objects.map(item => <option key={item.key} value={item.key}>{item.definition.name}</option>)}
    </select></label>
    {current && <>
      <form className="space-y-2" onSubmit={event => {
        event.preventDefault();
        void save({ action: "save", object, ...draft });
      }}>
        <label>Name <input className={input} required maxLength={100} value={draft.name}
          onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        {current.definition.lookup && <label>Related record <select className={input} value={draft.lookupId}
          onChange={event => setDraft({ ...draft, lookupId: event.target.value })}>
          <option value="">None</option>
          {related.records.map(row => <option key={row.id} value={row.id}>{row.record.name}</option>)}
        </select></label>}
        {(current.definition.fields ?? []).map(field => <label className="block" key={field.key}>{field.label} {field.type === "checkbox"
          ? <input type="checkbox" checked={draft.values[field.key] === true}
            onChange={event => setDraft({ ...draft, values: { ...draft.values, [field.key]: event.target.checked } })} />
          : <input className={input} type={field.type} step={field.type === "number" ? "any" : undefined} maxLength={5000}
            value={String(draft.values[field.key] ?? "")} onChange={event => {
              const value = event.target.value;
              setDraft({ ...draft, values: { ...draft.values, [field.key]: field.type === "number" && value !== "" ? Number(value) : value } });
            }} />}</label>)}
        <button className={button} disabled={busy}>{draft.id ? "Save record" : "Create record"}</button>
        {draft.id && <button type="button" className="ml-2" onClick={resetRecord}>Cancel edit</button>}
      </form>
      <div className="divide-y">{data.records.map(({ id, record }) => <article className="py-2" key={id}>
        <button type="button" className="font-medium text-indigo-700" onClick={() => setDraft({
          id, name: record.name, lookupId: record.lookupId ?? "", values: record.values ?? {},
        })}>{record.name}</button>
        <dl className="grid gap-1 text-sm sm:grid-cols-3">
          <div><dt>Owner</dt><dd>{record.owner ?? "—"}</dd></div>
          <div><dt>Created By</dt><dd>{record.createdBy ?? "—"}</dd></div>
          <div><dt>Last Modified By</dt><dd>{record.lastModifiedBy ?? "—"}</dd></div>
        </dl>
      </article>)}</div>
    </>}
  </section>;
}
