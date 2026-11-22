"use client";
import {useEffect,useState} from "react";
import {Rule, validationEntities} from "@/lib/metadata-runtime";
import {fieldLabel} from "@/lib/setup-metadata";
import {validationFieldKeys} from "@/lib/validation-configuration";
export default function ValidationRules(){const [revision,setRevision]=useState(0);const [bundle,setBundle]=useState<File|null>(null);const [entity,setEntity]=useState<(typeof validationEntities)[number]>("Customer");const [rules,setRules]=useState<Rule[]>([]),[fields,setFields]=useState<string[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");useEffect(()=>{
  const controller = new AbortController();
  fetch("/api/record-metadata?entity="+entity,{signal:controller.signal}).then(async response=>{
    if(!response.ok)throw Error("Metadata unavailable");
    const metadata = await response.json();
    if(controller.signal.aborted)return;
    setRules(metadata.rules);
    setFields(validationFieldKeys(entity, metadata.fields.map((field:{key:string})=>field.key)));
    setReady(true);
  }).catch(error=>{if(!controller.signal.aborted)setMessage(error.message)});
  return ()=>controller.abort();
},[entity,revision]);function edit(i:number,p:Partial<Rule>){setRules(v=>v.map((r,j)=>i===j?{...r,...p}:r))}async function save(){if(busy)return;setBusy(true);try{const r=await fetch("/api/setup/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"validation",entity,rules})});if(!r.ok)throw Error((await r.json()).error);setMessage("Rules saved")}catch(e){setMessage(e instanceof Error?e.message:"Save failed")}finally{setBusy(false)}}async function transfer(action:"export"|"import"){
  if(busy)return;
  setBusy(true);
  try{
    const response=await fetch("/api/setup/validation-bundle",action==="import"&&bundle
      ? {method:"POST",headers:{"Content-Type":"application/json"},body:await bundle.text()}
      : undefined);
    if(!response.ok)throw Error((await response.json()).error);
    if(action==="import"){
      const result=await response.json();
      setReady(false);
      setRevision(value=>value+1);
      setMessage("Imported validation rules for "+result.updated+" objects");
    }else{
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement("a");
      link.href=url;
      link.download="anu-crm-validation.json";
      link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage("Validation rules exported");
    }
  }catch(error){
    setMessage(error instanceof Error?error.message:"Unable to transfer validation rules");
  }finally{
    setBusy(false);
  }
}
return <section className="space-y-4 rounded-xl border bg-white p-5"><h3 className="font-semibold">Validation rules</h3><label>Object <select disabled={busy} value={entity} onChange={event=>{
  const selected=validationEntities.find(object=>object===event.target.value);
  if(!selected)return;
  setReady(false);
  setRules([]);
  setMessage("");
  setEntity(selected);
}}>{validationEntities.map(object=><option key={object} value={object}>{fieldLabel(object)}</option>)}</select></label><details className="rounded border p-3">
  <summary>Import and export validation rules</summary>
  <p className="my-2 text-sm">Import replaces the rules for each object listed in the file.</p>
  <button type="button" className="rounded border px-3" disabled={busy} onClick={()=>transfer("export")}>Export rules</button>
  <label className="my-2 block">Rules file <input type="file" accept=".json,application/json" disabled={busy} onChange={event=>setBundle(event.target.files?.[0]??null)}/></label>
  <button type="button" className="rounded border px-3" disabled={busy||!bundle} onClick={()=>transfer("import")}>Import rules</button>
</details>{message&&<p role="status">{message}</p>}{rules.map((r,i)=><div key={i} className="grid gap-3 rounded border p-3"><label>Field<select value={r.field} onChange={e=>edit(i,{field:e.target.value})}>{fields.map(f=><option key={f} value={f}>{fieldLabel(f)}</option>)}</select></label><label>Condition<select value={r.operator} onChange={e=>edit(i,{operator:e.target.value as Rule["operator"]})}><option value="required">Must have a value</option><option value="minLength">Minimum length</option><option value="equals">Must equal</option></select></label>{r.operator!=="required"&&<label>Expected value<input value={r.operand} onChange={e=>edit(i,{operand:e.target.value})}/></label>}<label>Error message<input maxLength={200} className="w-full border p-2" value={r.message} onChange={e=>edit(i,{message:e.target.value})}/></label><label><input type="checkbox" checked={r.enabled} onChange={e=>edit(i,{enabled:e.target.checked})}/> Active</label><button onClick={()=>setRules(v=>v.filter((_,j)=>j!==i))}>Remove rule</button></div>)}<button disabled={!ready||rules.length>=30} className="rounded border px-3" onClick={()=>setRules(v=>[...v,{field:fields[0],operator:"required",operand:"",message:fieldLabel(fields[0])+" is required",enabled:true}])}>New validation rule</button> <button disabled={!ready||busy} className="setup-primary" onClick={save}>Save rules</button></section>}
