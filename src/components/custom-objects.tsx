"use client";

import { useEffect, useState } from "react";
import { recordSystemFields } from "@/lib/setup-metadata";
import { objectManagerCatalog } from "@/lib/object-manager-catalog";
import { fieldLabel } from "@/lib/setup-metadata";

import StandardRecords, { RecordDetails } from "./standard-records";
import MetadataFields from "./metadata-fields";
import CustomLookup from "./custom-lookup";
import {editableStandardFields} from "@/lib/standard-field-overrides";
import { customFieldTypes, customObjectStandardFields, normalizeFieldType, type ObjectField as Field } from "@/lib/custom-object-fields";
type Values = Record<string, string | number | boolean>;
type CustomObject = { key: string; definition: { name: string; lookup: string | null; fields?: Field[] } };
type RecordRow = { id: string; record: {
  name: string;
  createdAt?: string | null;
  updatedAt?: string | null;
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

function displayType(key: string, type: string) {
  if (type === "String") return key === "id" ? "ID" : key.endsWith("Id") ? "Record ID" : /email/i.test(key) ? "Email" : /phone/i.test(key) ? "Phone" : "Text";
  return ({ DateTime: "Date/Time", Decimal: "Decimal", Int: "Number", Boolean: "Checkbox", Json: "JSON" } as Record<string, string>)[type] ?? type;
}

const input = "block w-full rounded border p-2";
const button = "rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50";

type StandardField = { id: string; entity: string; key: string; label: string; type: string; required: boolean; options: string[] };
type Props = {
  settings: {key:string;value:unknown}[];
  standardFields: StandardField[];
  editableObjects: string[];
  fieldTypes: string[];
  onFieldSave: (payload: Record<string, unknown>) => Promise<boolean | undefined>;
  busy: boolean;
};
const emptyField = { key: "", label: "", type: "TEXT", required: false, options: "", target: "" };

export default function CustomObjects({ settings, standardFields, editableObjects, fieldTypes, onFieldSave, busy: setupBusy }: Props) {
  const [objectSection, setObjectSection] = useState<"fields"|"records">("fields");
  const [openRecord, setOpenRecord] = useState("");
  const [standard, setStandard] = useState("");
  const [query, setQuery] = useState("");
  const [fieldQuery, setFieldQuery] = useState("");
  const [renameLabel,setRenameLabel]=useState<string|null>(null);
  const [newObject, setNewObject] = useState(false);
  const [editingField,setEditingField]=useState(false);
  const [fieldKeyEdited,setFieldKeyEdited]=useState(false);
  const [standardDraft,setStandardDraft]=useState<{key:string;label:string;required:boolean}|null>(null);
  const [fieldDraft, setFieldDraft] = useState<typeof emptyField | null>(null);
  const [object, setObject] = useState("");
  const [revision, setRevision] = useState(0);
  const [definition, setDefinition] = useState({ key: "", name: "", lookup: "" });
  const [keyEdited, setKeyEdited] = useState(false);
  const [draft, setDraft] = useState<{ id?: string; name: string; lookupId: string; values: Values }>({ name: "", lookupId: "", values: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = useRecords(object, revision);
  const current = data.objects.find(item => item.key === object);
  const selectedRecord = data.records.find(row => row.id === openRecord);
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
        setObjectSection("fields");
        setNewObject(false);
        setDefinition({ key: "", name: "", lookup: "" });
        setKeyEdited(false);
      }
      if(result.deleted)setObject("");
      setRenameLabel(null);
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
  const standardOverrides=(settings.find(item=>item.key==="setup.standardFields."+standard)?.value ?? {}) as Record<string,{label:string;required:boolean}>;
  const objectFields = standard
    ? [...objectManagerCatalog[standard].map(item => ({ ...item, label: standardOverrides[item.key]?.label ?? (recordSystemFields.find(field => field.key === item.key)?.label ?? fieldLabel(item.key)), required: standardOverrides[item.key]?.required ?? item.required, custom: false })),
      ...customObjectStandardFields.filter(item => !["Id", "Name"].includes(item.key) && !objectManagerCatalog[standard].some(field => field.key === item.storage))
        .map(item => ({...item, required: false, custom: false})),
      ...standardFields.filter(item => item.entity === standard).map(item => ({ ...item, type: item.type === "LOOKUP" ? "Lookup ? " + item.options?.[0] : item.type, custom: true }))]
    : current ? [
      ...customObjectStandardFields.map(item => ({ ...item, required: item.key === "Name", custom: false })),
      ...(current.definition.lookup ? [{ key: "lookupId", label: "Related record",
        type: "Lookup → " + current.definition.lookup, required: false, custom: true }] : []),
      ...(current.definition.fields ?? []).map(item => ({ ...item, type: item.type === "LOOKUP" ? "Lookup ? " + item.target : normalizeFieldType(item.type), custom: true })),
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
              setFieldQuery("");setFieldDraft(null);setObjectSection("fields");
              if (item.custom) setObject(item.key); else setStandard(item.key);
            }}>{item.label}</button></td>
            <td>{item.key}</td><td>{item.custom ? "Custom" : "Standard"}</td>
          </tr>)}</tbody>
      </table>
    </>}
    {(standard || current || newObject) && <button type="button" className="text-indigo-700 hover:underline" disabled={busy || setupBusy}
      onClick={() => { setStandard("");setObject("");setNewObject(false);setFieldDraft(null);setRenameLabel(null);setOpenRecord("");resetRecord(); }}>← All Objects</button>}
    {(standard || current) && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{standard ? fieldLabel(standard) : current?.definition.name}</h3>
        {current && <div className="flex gap-2">
          <button type="button" className="rounded border px-3 py-2" disabled={busy}
            onClick={() => setRenameLabel(current.definition.name)}>Edit Object</button>
          <button type="button" className="rounded border px-3 py-2 text-red-700" disabled={busy} onClick={() => {
            const confirmKey = window.prompt("Permanently delete this object and its records? Enter the object API name: " + object);
            if (confirmKey === object) void save({ action: "deleteObject", object, name: current.definition.name, confirmKey });
          }}>Delete Object</button>
        </div>}
      </div>
      {standard && <p className="text-sm text-slate-600">Standard fields cannot be deleted. Editable fields can have their labels and required settings changed; CRM-required fields remain required.</p>}
      {current && renameLabel !== null && <form className="space-y-2 rounded border p-3" onSubmit={event => {
        event.preventDefault();
        void save({ action: "rename", object, name: renameLabel });
      }}>
        <label>Object label <input className={input} required maxLength={100} value={renameLabel}
          onChange={event=>setRenameLabel(event.target.value)} /></label>
        <button className={button} disabled={busy}>Save Object</button>
        <button type="button" className="ml-3" onClick={()=>setRenameLabel(null)}>Cancel</button>
      </form>}
      <nav className="flex gap-2 border-b pb-2" aria-label="Object sections">
        <button type="button" className={objectSection === "fields" ? button : "rounded border px-3 py-2"}
          aria-pressed={objectSection === "fields"} onClick={()=>setObjectSection("fields")}>Fields &amp; Relationships</button>
        <button type="button" className={objectSection === "records" ? button : "rounded border px-3 py-2"}
          aria-pressed={objectSection === "records"} onClick={()=>setObjectSection("records")}>Records</button>
      </nav>
      {objectSection === "fields" && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold">Fields &amp; Relationships</h4>
        {(current || editableObjects.includes(standard)) && <button type="button" className={button}
          onClick={() => {setEditingField(false);setFieldKeyEdited(false);setFieldDraft(current ? { ...emptyField, key: "", type: "TEXT" } : { ...emptyField });}}>New Field</button>}
      </div>
      {standardDraft && <form className="space-y-2 rounded border p-3" onSubmit={async event=>{event.preventDefault();if(await onFieldSave({action:"standardField",entity:standard,...standardDraft}))setStandardDraft(null)}}><h5 className="font-semibold">Edit standard field</h5><label>Field label <input className={input} required maxLength={100} value={standardDraft.label} onChange={event=>setStandardDraft({...standardDraft,label:event.target.value})}/></label><label className="block"><input type="checkbox" checked={standardDraft.required} disabled={editableStandardFields[standard]?.[standardDraft.key]===true} onChange={event=>setStandardDraft({...standardDraft,required:event.target.checked})}/> Required</label>{editableStandardFields[standard]?.[standardDraft.key]===true&&<p className="text-sm text-slate-600">This field is required by the CRM and cannot be optional.</p>}<button className={button} disabled={setupBusy}>Save field</button><button type="button" className="ml-3" onClick={()=>setStandardDraft(null)}>Cancel</button></form>}
      {fieldDraft && <form className="space-y-2 rounded border p-3" onSubmit={async event => {
        event.preventDefault();
        if (current) {
          await save({ action: editingField ? "editField" : "addField", object, name: current.definition.name,
            field: { key: fieldDraft.key, label: fieldDraft.label, type: fieldDraft.type, required: fieldDraft.required, options: fieldDraft.options.split("\n"), target: fieldDraft.target } });
        } else if (await onFieldSave({ action: "field", entity: standard, ...fieldDraft })) setFieldDraft(null);
      }}>
        <label>Field label <input required className={input} value={fieldDraft.label} onChange={event => setFieldDraft({ ...fieldDraft, label: event.target.value, ...(!editingField && !fieldKeyEdited ? {key: (event.target.value.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^[^a-z]+|_+$/g,"").slice(0,37) || "") + "__c"} : {}) })} /></label>
        <label>API name <input readOnly={editingField} required pattern={editingField ? undefined : "[a-z][a-z0-9_]{0,36}__c"} className={input} value={fieldDraft.key}
          onChange={event => {setFieldKeyEdited(true);setFieldDraft({ ...fieldDraft, key: event.target.value });}} /></label>
        <label>Type <select className={input} value={fieldDraft.type} onChange={event => setFieldDraft({ ...fieldDraft, type: event.target.value })}>
          {(current ? customFieldTypes : fieldTypes).map(type => <option key={type}>{type}</option>)}</select></label>
        {fieldDraft.type === "LOOKUP" && <label>Related object <select required className={input} value={fieldDraft.target} onChange={event => setFieldDraft({ ...fieldDraft, target: event.target.value })}><option value="">Select an object</option><optgroup label="Standard objects">{Object.keys(objectManagerCatalog).map(key => <option key={key} value={key}>{fieldLabel(key)}</option>)}</optgroup><optgroup label="Custom objects">{data.objects.map(item => <option key={item.key} value={item.key}>{item.definition.name}</option>)}</optgroup></select></label>}
        {fieldDraft.type === "PICKLIST" && <label>Options (one per line) <textarea required className={input} value={fieldDraft.options}
          onChange={event => setFieldDraft({ ...fieldDraft, options: event.target.value })} /></label>}
        {<label className="block"><input type="checkbox" checked={fieldDraft.required}
          onChange={event => setFieldDraft({ ...fieldDraft, required: event.target.checked })} /> Required</label>}
        <button className={button} disabled={setupBusy || busy}>Save Field</button>
        <button type="button" className="ml-3" onClick={() => setFieldDraft(null)}>Cancel</button>
      </form>}
      <label>Find a field <input className={input} value={fieldQuery} onChange={event => setFieldQuery(event.target.value)} /></label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["Field Label","API Name","Data Type","Origin","Required",...((current || editableObjects.includes(standard))?["Actions"]:[])].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{objectFields.filter(item => [item.label,item.key,item.type].join(" ").toLowerCase().includes(fieldQuery.trim().toLowerCase())).map(item =>
          <tr key={item.key} className="border-t">
            <td className="p-2">{item.label}</td><td className="p-2">{item.key}</td><td className="p-2">{displayType(item.key, item.type)}</td>
            <td className="p-2">{item.custom ? "Custom" : "Standard"}</td><td className="p-2">{item.required ? "Yes" : "No"}</td>
            {current && <td className="p-2">{(() => {
              const existing = current.definition.fields?.find(field => field.key === item.key);
              if (!existing || !item.custom) return null;
              return <div className="flex gap-2">
                <button type="button" className="text-indigo-700" disabled={busy} onClick={() => {
                  setEditingField(true);
                  setFieldDraft({ key: existing.key, label: existing.label, type: normalizeFieldType(existing.type),
                    required: existing.required ?? false, options: (existing.options ?? []).join("\n"), target: existing.target ?? "" });
                }}>Edit</button>
                <button type="button" className="text-red-700" disabled={busy} onClick={() => {
                  if (window.confirm("Permanently delete this field and its values from all records?")) {
                    void save({ action: "deleteField", object, name: current.definition.name, fieldKey: existing.key });
                  }
                }}>Delete</button>
              </div>;
            })()}</td>}
            {editableObjects.includes(standard) && <td className="p-2">{!item.custom ? (Object.prototype.hasOwnProperty.call(editableStandardFields[standard]??{},item.key) ? <button type="button" className="text-indigo-700" onClick={()=>{setFieldDraft(null);setStandardDraft({key:item.key,label:item.label,required:!!item.required})}}>Edit</button> : <span className="text-slate-500">Managed by CRM</span>) : (() => {
              const existing = standardFields.find(field => field.entity === standard && field.key === item.key);
              if (!existing) return null;
              return <div className="flex gap-2">
                <button type="button" className="text-indigo-700" onClick={() => {
                  setEditingField(true);
                  setFieldDraft({ key: existing.key, label: existing.label, type: existing.type,
                    required: existing.required, options: (existing.options ?? []).join("\n"), target: existing.type === "LOOKUP" ? existing.options?.[0] ?? "" : "" });
                }}>Edit</button>
                <button type="button" className="text-red-700" disabled={setupBusy} onClick={() => {
                  if (window.confirm("Permanently delete this custom field and its values from all records?")) void onFieldSave({ action: "deleteField", id: existing.id });
                }}>Delete</button>
              </div>;
            })()}</td>}
          </tr>)}</tbody>
      </table></div>
      </>}
    </>}
    {standard && objectSection === "records" && <StandardRecords key={standard} entity={standard} customFields={standardFields.filter(item => item.entity === standard)} />}
    {newObject && <div>
      <h3 className="text-xl font-semibold">New Custom Object</h3>
      <form className="mt-3 space-y-2" onSubmit={event => {
        event.preventDefault();
        void save({ action: "define", object: definition.key, name: definition.name, lookup: definition.lookup });
      }}>
        <label>Object label <input className={input} required maxLength={100} value={definition.name}
          onChange={event => {
            const name = event.target.value;
            const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0,37) + "__c";
            setDefinition({ ...definition, name, key: keyEdited ? definition.key : key });
          }} /></label>
        <label>Object key <input className={input} required pattern="[a-z][a-z0-9_]{0,36}__c" value={definition.key}
          onChange={event => {setKeyEdited(true);setDefinition({ ...definition, key: event.target.value });}} /></label>
        <label>Lookup object <select className={input} value={definition.lookup}
          onChange={event => setDefinition({ ...definition, lookup: event.target.value })}>
          <option value="">None</option>
          {data.objects.map(item => <option key={item.key} value={item.key}>{item.definition.name}</option>)}
        </select></label>
        <section className="rounded-lg bg-slate-50 p-4">
          <h4 className="font-semibold">Standard fields added automatically</h4>
          <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {customObjectStandardFields.map(field => <li key={field.key} className="rounded border bg-white px-3 py-2">
              {field.label}<span className="ml-2 text-xs text-slate-500">{field.key}</span>
            </li>)}
          </ul>
        </section>
        <button className={button} disabled={busy}>Create object</button>
      </form>
    </div>}
    {current && objectSection === "records" && <>
      <h4 className="border-t pt-4 font-semibold">Records</h4>
      {selectedRecord && <section className="space-y-3 rounded border p-4">
        <div className="flex justify-between gap-3">
          <h5 className="font-semibold">{selectedRecord.record.name}</h5>
          <button type="button" onClick={() => setOpenRecord("")}>Close Details</button>
        </div>
        <RecordDetails fields={[
          ...customObjectStandardFields.map(field => ({label:field.label, value:field.storage === "id" ? selectedRecord.id : selectedRecord.record[field.storage]})),
          ...(current.definition.lookup ? [{label:"Related record",value:related.records.find(row=>row.id===selectedRecord.record.lookupId)?.record.name ?? selectedRecord.record.lookupId}] : []),
          ...(current.definition.fields ?? []).map(field => ({label:field.label,value:selectedRecord.record.values?.[field.key]})),
        ]}/>
        <RelatedLists object={object} id={selectedRecord.id} revision={revision}/>
      </section>}
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
        {current.definition.fields?.filter(field => field.type === "LOOKUP").map(field => <LookupInput key={field.key} field={field} value={String(draft.values[field.key] ?? "")} onChange={value => setDraft(previous => ({ ...previous, values: { ...previous.values, [field.key]: value } }))}/>)}
        {!!current.definition.fields?.some(field => field.type !== "LOOKUP") && <MetadataFields
          sections={null} fields={current.definition.fields.filter(field => field.type !== "LOOKUP").map(field => ({
            ...field, type: normalizeFieldType(field.type), required: field.required ?? false,
          }))} values={draft.values}
          onChange={(key,value) => setDraft(previous => ({ ...previous, values: { ...previous.values, [key]: value } }))}/>}
        <button className={button} disabled={busy}>{draft.id ? "Save record" : "Create record"}</button>
        {draft.id && <button type="button" className="ml-2" onClick={resetRecord}>Cancel edit</button>}
      </form>
      <div className="divide-y">{data.records.map(({ id, record }) => <article className="py-2" key={id}>
        <button type="button" className="font-medium text-indigo-700" onClick={() => setOpenRecord(id)}>{record.name}</button>
        <button type="button" className="ml-3 text-sm text-indigo-700" onClick={() => setDraft({
          id, name: record.name, lookupId: record.lookupId ?? "", values: record.values ?? {},
        })}>Edit Record</button>
        <dl className="grid gap-1 text-sm sm:grid-cols-3">
          <div><dt>Owner</dt><dd>{record.owner ?? "—"}</dd></div>
          <div><dt>Created By</dt><dd>{record.createdBy ?? "—"}</dd></div>
          <div><dt>Last Modified By</dt><dd>{record.lastModifiedBy ?? "—"}</dd></div>
          <div><dt>Created Date</dt><dd>{record.createdAt ? new Date(record.createdAt).toLocaleString() : "—"}</dd></div>
          <div><dt>Last Modified Date</dt><dd>{record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "—"}</dd></div>
        </dl>
      </article>)}</div>
    </>}
  </section>;
}

function LookupInput({field,value,onChange}:{field:Field;value:string;onChange:(value:string)=>void}) {
  return <label>{field.label}<CustomLookup target={field.target} value={value} required={!!field.required} onChange={onChange}/></label>;
}

function RelatedLists({object,id,revision}:{object:string;id:string;revision:number}) {
  const [lists,setLists] = useState<{object:string;label:string;field:string;records:{id:string;name:string}[];truncated:boolean}[]>([]);
  const [error,setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLists([]); setError("");
    fetch("/api/setup/custom-objects?" + new URLSearchParams({object,parentId:id}), {signal:controller.signal}).then(async response => {
      const result = await response.json(); if (!response.ok) throw Error(result.error); setLists(result.relatedLists ?? []);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [object,id,revision]);
  return <div className="space-y-2"><h6 className="font-semibold">Related records</h6>{error && <p role="alert">{error}</p>}{lists.map(list => <section key={list.object+":"+list.field} className="rounded border p-3"><h6 className="font-medium">{list.label} ? {list.field} ({list.records.length}{list.truncated ? "+" : ""})</h6>{list.records.length ? <ul>{list.records.map(record => <li key={record.id}>{record.name}</li>)}</ul> : <p className="text-sm text-slate-500">No related records</p>}{list.truncated && <p className="text-sm">Showing the first 200 records.</p>}</section>)}{!lists.length && !error && <p className="text-sm text-slate-500">No incoming lookup relationships.</p>}</div>;
}
