"use client";
import MetadataFields,{type Field,type Values} from "./metadata-fields";
import {CustomValuesButton} from "@/components/custom-values";
import {useEffect,useState} from "react";
import {SalesTable,SalesFilters,SalesStatus,statusLabel} from "./sales-table";
import {canEditStaffField,canReadStaffField} from "@/lib/staff-field-access";
import {hasStaffPermission} from "@/lib/staff-permission-check";
const stages=["NEW","CONTACTED","QUALIFIED","NEGOTIATION","WON","LOST"];
const sources=["WALK_IN","PHONE","WHATSAPP","WEBSITE","INSTAGRAM","FACEBOOK","REFERRAL","OTHER"];
type Lead={id:string;name:string;phone:string|null;interest:string|null;source:string;stage:string;customerId:string|null;createdAt:string};
type StaffAccess={permissions:string[];fieldPermissions:string[]};
const blank={id:"",name:"",phone:"",interest:"",source:"WALK_IN",stage:"NEW"};
const field="w-full rounded-xl border bg-white p-3 text-sm";
export default function LiveLeads({mode,staffAccess}:{mode:string;staffAccess?:StaffAccess}){
const [rows,setRows]=useState<Lead[]>([]),[form,setForm]=useState(blank),[query,setQuery]=useState(""),[filter,setFilter]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
const [metadata,setMetadata]=useState<{fields:Field[];sections:unknown}|null>(null),[custom,setCustom]=useState<Values>({}),[metaError,setMetaError]=useState("");
const allowed=(action:"CREATE"|"EDIT"|"DELETE")=>!staffAccess||hasStaffPermission(staffAccess,"Lead",action);
const canRead=(key:string)=>!staffAccess||canReadStaffField(staffAccess,"Lead",key);
const canEdit=(key:string)=>!staffAccess||canEditStaffField(staffAccess,"Lead",key);
const editableLeadFields=["name","phone","interest","source","stage"];
const canCreateLead=allowed("CREATE")&&canEdit("name");
const canEditLead=allowed("EDIT")&&editableLeadFields.some(canEdit);
const canChangeStage=canRead("stage")&&canEdit("stage");
const canConvert=!staffAccess||(hasStaffPermission(staffAccess,"Lead","EDIT")&&canEditStaffField(staffAccess,"Lead","customerId")&&hasStaffPermission(staffAccess,"Customer","READ")&&hasStaffPermission(staffAccess,"Customer","CREATE")&&canReadStaffField(staffAccess,"Customer","phone")&&["name","phone","source"].every(key=>canEditStaffField(staffAccess,"Customer",key)));
const readableSearchFields=(["name","phone","interest","source"] as const).filter(canRead);
useEffect(()=>{const c=new AbortController();setMetadata(null);setCustom({});setMetaError("");Promise.all([fetch("/api/record-metadata?entity=Lead",{signal:c.signal}),form.id?fetch("/api/custom-values?entity=Lead&id="+encodeURIComponent(form.id),{signal:c.signal}):Promise.resolve(null)]).then(async ([m,v])=>{if(!m.ok||v&&!v.ok)throw Error("Unable to load custom fields");const meta=await m.json(),values=v?await v.json():{values:{}};if(!c.signal.aborted){setMetadata(meta);setCustom(values.values??{})}}).catch(e=>{if(!c.signal.aborted)setMetaError(e.message)});return()=>c.abort()},[form.id,revision]);
useEffect(()=>{const c=new AbortController();setBusy(true);fetch("/api/leads",{signal:c.signal}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x.error);setRows(x)}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});return()=>c.abort()},[revision]);
async function save(body:Record<string,unknown>){if(busy)return;if(staffAccess&&(body.action==="convert"?!canConvert:body.id?!canEditLead:!canCreateLead)){setError("You do not have permission to change enquiries.");return}setBusy(true);setError("");try{const payload=staffAccess&&body.action!=="convert"?{...(body.id?{id:body.id}:{}),...Object.fromEntries(editableLeadFields.filter(canEdit).filter(key=>Object.prototype.hasOwnProperty.call(body,key)).map(key=>[key,body[key]])),customValues:Object.fromEntries((metadata?.fields||[]).filter(field=>field.editable!==false).map(field=>[field.key,(body.customValues as Values|undefined)?.[field.key]??custom[field.key]]))}:body;const r=await fetch("/api/leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const x=await r.json();if(!r.ok)throw new Error(x.error);setForm(blank);setRevision(v=>v+1)}catch(e){setError(e instanceof Error?e.message:"Operation failed")}finally{setBusy(false)}}
const visible=rows.filter(r=>(!canRead("stage")||!filter||r.stage===filter)&&readableSearchFields.map(key=>String(r[key]??"")).join(" ").toLowerCase().includes(query.toLowerCase()));
function tile(r:Lead){return <article key={r.id} className="space-y-2 rounded-xl border bg-white p-4 shadow-sm"><h3 className="font-bold">{canRead("name")?r.name:"Enquiry"}</h3>{(canRead("phone")||canRead("source"))&&<p className="text-xs text-slate-500">{canRead("phone")&&(r.phone||"No phone")}{canRead("phone")&&canRead("source")&&" · "}{canRead("source")&&r.source.replaceAll("_"," ")}</p>}{canRead("interest")&&<p className="text-sm">{r.interest||"No interest recorded"}</p>}{canRead("stage")&&(canChangeStage?<select aria-label="Sales stage" disabled={busy} className={field} value={r.stage} onChange={e=>save({...r,stage:e.target.value})}>{stages.map(s=><option key={s}>{s}</option>)}</select>:<SalesStatus value={r.stage}/>)}<div className="flex flex-wrap gap-3 text-xs">{canEditLead&&<button className="font-bold text-indigo-700" onClick={()=>setForm({id:r.id,name:r.name,phone:r.phone||"",interest:r.interest||"",source:r.source,stage:r.stage})}>Edit</button>}{r.customerId?<span className="text-emerald-700">Customer linked</span>:canConvert&&<button disabled={busy||!r.phone||!["QUALIFIED","NEGOTIATION","WON"].includes(r.stage)} className="font-bold text-indigo-700 disabled:text-slate-400" onClick={()=>{if(confirm("Link an existing matching customer or create a new customer?"))save({action:"convert",id:r.id})}}>Convert to customer</button>}</div></article>}
const showActions=canEditLead||canConvert;
const headers=[...(canRead("name")?["Customer"]:[]),...(canRead("phone")?["Phone"]:[]),...(canRead("interest")?["Interest"]:[]),...(canRead("source")?["Source"]:[]),...(canRead("stage")?["Stage"]:[]),...(showActions?["Actions"]:[])];
return <section className="space-y-5">
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  {canRead("stage")&&<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{stages.map(s=><button key={s} onClick={()=>setFilter(filter===s?"":s)} className={"rounded-xl border bg-white p-4 text-left "+(filter===s?"ring-2 ring-indigo-500":"")}><p className="text-xs text-slate-500">{s}</p><p className="text-2xl font-bold">{rows.filter(r=>r.stage===s).length}</p></button>)}</div>}
  {(canCreateLead||Boolean(form.id)&&canEditLead)&&<form id="enquiry-form" className="space-y-4 rounded-2xl border bg-white p-5" onSubmit={e=>{e.preventDefault();save({...form,customValues:custom})}}>
    <h2 className="font-bold">{form.id?"Edit enquiry":"New enquiry"}</h2>
    <div className="grid gap-3 md:grid-cols-2">
      {(["name","phone","interest"] as const).map(k=><label key={k} className="text-sm capitalize">{k}<input required={k==="name"} disabled={!canEdit(k)} className={field} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
      <label className="text-sm">Source<select disabled={!canEdit("source")} className={field} value={form.source} onChange={e=>setForm({...form,source:e.target.value})}>{sources.map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="text-sm">Stage<select disabled={!canEdit("stage")} className={field} value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})}>{stages.map(s=><option key={s}>{s}</option>)}</select></label>
    </div>
    {metaError&&<p role="alert">{metaError}</p>}
    {metadata&&metadata.fields.length>0&&<MetadataFields fields={metadata.fields} sections={metadata.sections} values={custom} onChange={(key,value)=>setCustom(old=>({...old,[key]:value}))}/>}
    <button disabled={busy||!metadata} className="rounded-xl bg-[#6256dc] px-5 py-3 text-white">Save enquiry</button>
    <button type="button" onClick={()=>setForm(blank)}>Clear</button>
  </form>}
  <SalesFilters query={query} onQuery={setQuery} status={filter} onStatus={setFilter} statuses={stages} showStatus={canRead("stage")}/>
  {mode==="Opportunities"?<div className="flex gap-3 overflow-x-auto pb-4">{stages.filter(s=>!canRead("stage")||!filter||s===filter).map(s=><div key={s} className="min-w-[250px] flex-1 space-y-3 rounded-xl bg-slate-100 p-3"><h3 className="font-bold">{s}</h3>{visible.filter(r=>r.stage===s).map(tile)}</div>)}</div>:<SalesTable headers={headers} empty={!visible.length} busy={busy} emptyMessage={canCreateLead?"No matching records. Change filters or create a record.":"No matching enquiries."}>{visible.map(r=><tr key={r.id}>
    {canRead("name")&&<td className="font-semibold">{r.name}{canEditLead&&<CustomValuesButton entity="Lead" id={r.id} onSaved={()=>setRevision(v=>v+1)}/>}</td>}
    {canRead("phone")&&<td>{r.phone||"—"}</td>}
    {canRead("interest")&&<td>{r.interest||"—"}</td>}
    {canRead("source")&&<td>{statusLabel(r.source)}</td>}
    {canRead("stage")&&<td><SalesStatus value={r.stage}/>{canChangeStage&&<select aria-label={"Stage for "+r.name} disabled={busy} className="mt-1 block rounded border p-1 text-xs" value={r.stage} onChange={e=>save({...r,stage:e.target.value})}>{stages.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select>}</td>}
    {showActions&&<td><div className="flex flex-wrap gap-2">
      {canEditLead&&<button className="text-indigo-700" onClick={()=>{setForm({id:r.id,name:r.name,phone:r.phone||"",interest:r.interest||"",source:r.source,stage:r.stage});document.getElementById("enquiry-form")?.scrollIntoView({block:"center"})}}>Edit</button>}
      {canRead("customerId")&&r.customerId?<span className="text-emerald-700">Customer linked</span>:canConvert&&<button className="text-indigo-700 disabled:text-slate-400" disabled={busy||!r.phone||!["QUALIFIED","NEGOTIATION","WON"].includes(r.stage)} onClick={()=>{if(confirm("Link or create customer?"))save({action:"convert",id:r.id})}}>Convert to customer</button>}
    </div></td>}
  </tr>)}</SalesTable>}
  {mode==="Opportunities"&&!visible.length&&<p className="rounded-xl bg-white p-8 text-center text-slate-500">{busy?"Loading…":"No matching enquiries."}</p>}
</section>
}
