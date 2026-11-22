"use client";

import { useEffect, useState } from "react";
import { objectManagerCatalog } from "@/lib/object-manager-catalog";
import { fieldLabel } from "@/lib/setup-metadata";

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

type StandardField = { id: string; entity: string; key: string; label: string; type: string; required: boolean; options: string[] };
type Props = {
  standardFields: StandardField[];
  editableObjects: string[];
  fieldTypes: string[];
  onFieldSave: (payload: Record<string, unknown>) => Promise<boolean | undefined>;
  busy: boolean;
};
const emptyField = { key: "custom_", label: "", type: "TEXT", required: false, options: "" };

export default function CustomObjects({ standardFields, editableObjects, fieldTypes, onFieldSave, busy: setupBusy }: Props) {
  const [standard, setStandard] = useState("");
  const [query, setQuery] = useState("");
  const [fieldQuery, setFieldQuery] = useState("");
  const [newObject, setNewObject] = useState(false);
  const [editingField,setEditingField]=useState(false);
  const [fieldDraft, setFieldDraft] = useState<typeof emptyField | null>(null);
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
        setNewObject(false);
        setDefinition({ key: "", name: "", lookup: "" });
        setFields([]);
      }
      resetRecord();
      setFieldDraft(null);
      setRevision(value => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  const directory = [
    ...Object.keys(objectManagerCatalog).map(key => ({ key, label: fieldLabel(key), custom: false })),
    ...data.objects.map(item => ({ key: item.key, label: item.definition.name, custom: true })),
  ].sort((a,b) => a.label.localeCompare(b.label));
  const objectFields = standard
    ? [...objectManagerCatalog[standard].map(item => ({ ...item, label: fieldLabel(item.key), custom: false })),
      ...standardFields.filter(item => item.entity === standard).map(item => ({ ...item, custom: true }))]
    : current ? [
      { key: "name", label: "Name", type: "Text", required: true, custom: false },
      ...(current.definition.lookup ? [{ key: "lookupId", label: "Related record",
        type: "Lookup → " + current.definition.lookup, required: false, custom: true }] : []),
      ...(current.definition.fields ?? []).map(item => ({ ...item, required: false, custom: true })),
      ...["owner", "createdBy", "lastModifiedBy", "createdAt", "updatedAt"].map(key => ({
        key, label: fieldLabel(key), type: key.endsWith("At") ? "Date/Time" : "User", required: false, custom: false,
      })),
    ] : [];

  return <section className="space-y-4 rounded-xl border bg-white p-4">
    {(error || data.error || related.error) && <p role="alert">{error || data.error || related.error}</p>}
    {!standard && !object && !newObject && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label>Find an object <input className={input} value={query} onChange={event => setQuery(event.target.value)} /></label>
        <button className={button} type="button" onClick={() => setNewObject(true)}>New Object</button>
      </div>
      <table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Label</th><th>API Name</th><th>Type</th></tr></thead>
        <tbody>{directory.filter(item => (item.key + " " + item.label).toLowerCase().includes(query.trim().toLowerCase())).map(item =>
          <tr className="border-t" key={String(item.custom) + item.key}>
            <td className="p-2"><button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => {
              setFieldQuery("");setFieldDraft(null);
              if (item.custom) setObject(item.key); else setStandard(item.key);
            }}>{item.label}</button></td>
            <td>{item.key}</td><td>{item.custom ? "Custom" : "Standard"}</td>
          </tr>)}</tbody>
      </table>
    </>}
    {(standard || current || newObject) && <button type="button" className="text-indigo-700 hover:underline" disabled={busy || setupBusy}
      onClick={() => { setStandard("");setObject("");setNewObject(false);setFieldDraft(null);resetRecord(); }}>← All Objects</button>}
    {(standard || current) && <>
      <h3 className="text-xl font-semibold">{standard ? fieldLabel(standard) : current?.definition.name}</h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold">Fields &amp; Relationships</h4>
        {(current || editableObjects.includes(standard)) && <button type="button" className={button}
          onClick={() => {setEditingField(false);setFieldDraft(current ? { ...emptyField, key: "", type: "text" } : { ...emptyField });}}>New Field</button>}
      </div>
      {fieldDraft && <form className="space-y-2 rounded border p-3" onSubmit={async event => {
        event.preventDefault();
        if (current) {
          await save({ action: "addField", object, name: current.definition.name,
            field: { key: fieldDraft.key, label: fieldDraft.label, type: fieldDraft.type } });
        } else if (await onFieldSave({ action: "field", entity: standard, ...fieldDraft })) setFieldDraft(null);
      }}>
        <label>Field label <input required className={input} value={fieldDraft.label} onChange={event => setFieldDraft({ ...fieldDraft, label: event.target.value })} /></label>
        <label>API name <input readOnly={editingField} required pattern={current ? "[a-z][a-z0-9_]{0,39}" : "custom_[a-z][a-z0-9_]{0,59}"} className={input} value={fieldDraft.key}
          onChange={event => setFieldDraft({ ...fieldDraft, key: event.target.value })} /></label>
        <label>Type <select className={input} value={fieldDraft.type} onChange={event => setFieldDraft({ ...fieldDraft, type: event.target.value })}>
          {(current ? ["text","number","checkbox"] : fieldTypes).map(type => <option key={type}>{type}</option>)}</select></label>
        {fieldDraft.type === "PICKLIST" && <label>Options (one per line) <textarea required className={input} value={fieldDraft.options}
          onChange={event => setFieldDraft({ ...fieldDraft, options: event.target.value })} /></label>}
        {!current && <label className="block"><input type="checkbox" checked={fieldDraft.required}
          onChange={event => setFieldDraft({ ...fieldDraft, required: event.target.checked })} /> Required</label>}
        <button className={button} disabled={setupBusy || busy}>Save Field</button>
        <button type="button" className="ml-3" onClick={() => setFieldDraft(null)}>Cancel</button>
      </form>}
      <label>Find a field <input className={input} value={fieldQuery} onChange={event => setFieldQuery(event.target.value)} /></label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["Field Label","API Name","Data Type","Origin","Required",...(editableObjects.includes(standard)?["Actions"]:[])].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{objectFields.filter(item => [item.label,item.key,item.type].join(" ").toLowerCase().includes(fieldQuery.trim().toLowerCase())).map(item =>
          <tr key={item.key} className="border-t">
            <td className="p-2">{item.label}</td><td className="p-2">{item.key}</td><td className="p-2">{item.type}</td>
            <td className="p-2">{item.custom ? "Custom" : "Standard"}</td><td className="p-2">{item.required ? "Yes" : "No"}</td>
            {editableObjects.includes(standard) && <td className="p-2">{item.custom && (() => {
              const existing = standardFields.find(field => field.entity === standard && field.key === item.key);
              if (!existing) return null;
              return <div className="flex gap-2">
                <button type="button" className="text-indigo-700" onClick={() => {
                  setEditingField(true);
                  setFieldDraft({ key: existing.key, label: existing.label, type: existing.type,
                    required: existing.required, options: (existing.options ?? []).join("\n") });
                }}>Edit</button>
                <button type="button" className="text-red-700" disabled={setupBusy} onClick={() => {
                  if (window.confirm("Delete this custom field definition?")) void onFieldSave({ action: "deleteField", id: existing.id });
                }}>Delete</button>
              </div>;
            })()}</td>}
          </tr>)}</tbody>
      </table></div>
    </>}
    {newObject && <div>
      <h3 className="text-xl font-semibold">New Custom Object</h3>
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
    </div>}
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
