"use client";
import CustomLookup from "./custom-lookup";
import {useEffect,useState} from "react";
import {resolveLayout,layoutColumns} from "@/lib/record-layout";
type Value=string|number|boolean;
type HistoryEntry={id:string;at:string;actorId:string|null;before:Record<string,Value|null>|null;after:{values?:Record<string,Value|null>;fields?:string[]}|null};
type Field={key:string;label:string;type:string;required:boolean;options:unknown;editable?:boolean};
type CustomValuesData={fields:Field[];values:Record<string,Value>;layout:unknown;history:HistoryEntry[];name:string|null;nameEditable?:boolean;error?:string};

export default function CustomValues({entity,id,onClose,onSaved}:{entity:string;id:string;onClose:()=>void;onSaved?:()=>void}){
 const [originalName,setOriginalName]=useState<string|null>(null);
 const [name,setName]=useState<string|null>(null);
 const [nameEditable,setNameEditable]=useState(false);
 const [history,setHistory]=useState<HistoryEntry[]>([]);
 const [fields,setFields]=useState<Field[]>([]);
 const [values,setValues]=useState<Record<string,Value>>({});
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(true);
 const [ready,setReady]=useState(false);
 const [layout,setLayout]=useState<unknown>([]);

 useEffect(()=>{
  const c=new AbortController();
  setReady(false);setBusy(true);setError("");
  fetch("/api/custom-values?entity="+encodeURIComponent(entity)+"&id="+encodeURIComponent(id),{signal:c.signal}).then(async r=>{
   const x:CustomValuesData=await r.json();
   if(!r.ok)throw Error(x.error||"Unable to load custom fields");
   setFields(x.fields);setName(x.name??null);setOriginalName(x.name??null);setNameEditable(x.nameEditable===true);
   setHistory(x.history??[]);setLayout(x.layout);
   setValues(Object.fromEntries(x.fields.filter(f=>Object.prototype.hasOwnProperty.call(x.values,f.key)).map(f=>[f.key,x.values[f.key]])));
   setReady(true);
  }).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});
  return()=>c.abort();
 },[entity,id]);

 function change(key:string,value:Value){setValues(v=>({...v,[key]:value}))}
 async function save(){
  setBusy(true);setError("");
  const editableValues=Object.fromEntries(fields.filter(field=>field.editable!==false).map(field=>[field.key,values[field.key]]));
  try{
   const r=await fetch("/api/custom-values",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity,id,values:editableValues,...(name===null||name===originalName||!nameEditable?{}:{name})})});
   const x=await r.json();
   if(!r.ok)throw Error(x.error);
   onSaved?.();onClose();
  }catch(e){setError(e instanceof Error?e.message:"Save failed")}finally{setBusy(false)}
 }

 const cls="mt-1 block w-full rounded-lg border p-3";
 const canSave=fields.some(field=>field.editable!==false)||(name!==null&&nameEditable);
 return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"><form className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 space-y-3" onSubmit={e=>{e.preventDefault();save()}}>
  <div className="flex justify-between"><h3 className="text-xl font-bold">{entity} · Custom fields</h3><button type="button" onClick={onClose}>Close</button></div>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {busy&&!ready&&<p>Loading fields…</p>}
  {ready&&name!==null&&<label className="block text-sm font-medium">Name<input disabled={!nameEditable} className={cls} value={name} maxLength={150} required onChange={event=>setName(event.target.value)}/></label>}
  {ready&&!fields.length&&name===null&&<p>No custom fields configured. Use CRM Setup → Object Manager.</p>}
  {resolveLayout(layout,fields.map(f=>f.key),"Required fields",{hideUnplaced:true,required:fields.filter(f=>f.required).map(f=>f.key)}).map((section,i)=><fieldset key={i} className="rounded-xl border p-4">
   <legend className="px-2 font-bold">{section.name}</legend>
   <div className={layoutColumns(section.columns)}>{section.fields.map(key=>fields.find(f=>f.key===key)!).map(f=><label key={f.key} className="block text-sm font-medium">{f.label}{f.required?" *":""}
    {f.type==="LOOKUP"?<CustomLookup target={Array.isArray(f.options)?f.options[0]:null} value={String(values[f.key]??"")} required={f.required} disabled={f.editable===false} onChange={value=>change(f.key,value)}/>:f.type==="CHECKBOX"?<input disabled={f.editable===false} className="ml-2" type="checkbox" checked={values[f.key]===true} onChange={e=>change(f.key,e.target.checked)}/>:f.type==="PICKLIST"?<select disabled={f.editable===false} required={f.required} className={cls} value={String(values[f.key]??"")} onChange={e=>change(f.key,e.target.value)}><option value="">Select</option>{(Array.isArray(f.options)?f.options:[]).map(o=><option key={String(o)}>{String(o)}</option>)}</select>:f.type==="TEXTAREA"?<textarea disabled={f.editable===false} required={f.required} maxLength={5000} className={cls} value={String(values[f.key]??"")} onChange={e=>change(f.key,e.target.value)}/>:<input disabled={f.editable===false} required={f.required} className={cls} type={({NUMBER:"number",CURRENCY:"number",PERCENT:"number",DATE:"date",DATETIME:"datetime-local",EMAIL:"email",PHONE:"tel",URL:"url"} as Record<string,string>)[f.type]||"text"} step={["NUMBER","CURRENCY","PERCENT"].includes(f.type)?"any":undefined} value={String(values[f.key]??"")} onChange={e=>change(f.key,["NUMBER","CURRENCY","PERCENT"].includes(f.type)&&e.target.value!==""?Number(e.target.value):e.target.value)}/>}
   </label>)}</div>
  </fieldset>)}
  {ready&&history.length>0&&<details className="rounded border p-3"><summary>Custom field history</summary><ul className="divide-y">{history.map(entry=><li key={entry.id} className="py-2 text-sm">
   <p>{new Date(entry.at).toLocaleString()} {entry.actorId&&" · "+entry.actorId}</p>
   {entry.after?.values?Object.entries(entry.after.values).map(([key,value])=><p key={key}>{fields.find(field=>field.key===key)?.label??key}: {String(entry.before?.[key]??"—")} → {String(value??"—")}</p>):<p>{entry.after?.fields?.join(", ")}</p>}
  </li>)}</ul></details>}
  <button disabled={busy||!ready||!canSave} className="rounded-xl bg-indigo-600 px-4 py-3 text-white disabled:opacity-50">Save record fields</button>
 </form></div>;
}

export function CustomValuesButton({entity,id,label="Record fields",onSaved}:{entity:string;id:string;label?:string;onSaved?:()=>void}){
 const [open,setOpen]=useState(false);
 return <><button type="button" className="block text-xs font-medium text-indigo-700 hover:underline" onClick={()=>setOpen(true)}>{label}</button>{open&&<CustomValues entity={entity} id={id} onClose={()=>setOpen(false)} onSaved={onSaved}/>}</>;
}
